import { db } from './db';
import { generateUUIDv7 } from '../utils/uuid';
import type { LocalMealRecord, MealAnalysis, MealType } from '../types/meal';

export interface DispatchResult {
  client_request_id: string;
  isOffline: boolean;
  analysis?: MealAnalysis;
  error?: string;
}

type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();

export function subscribeToSyncEvents(listener: SyncListener): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function notifySyncListeners() {
  syncListeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error('Error in sync listener:', e);
    }
  });
}

/**
 * Sends an optimized image blob to the Django Ninja /api/food/analyze-food endpoint.
 */
export async function uploadMealImageForAnalysis(
  blob: Blob,
  clientRequestId: string
): Promise<MealAnalysis> {
  const formData = new FormData();
  formData.append('image', blob, `meal_${clientRequestId}.webp`);

  const response = await fetch('/api/food/analyze-food', {
    method: 'POST',
    headers: {
      'X-Client-Request-Id': clientRequestId,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorDetail = parsed.message || parsed.detail || errorText;
    } catch {
      // Keep errorText
    }
    throw new Error(errorDetail || `Upload failed with status ${response.status}`);
  }

  const analysis: MealAnalysis = await response.json();
  return analysis;
}

/**
 * Sends a finalized meal record to Django /api/food/confirm-meal for server persistence.
 */
export async function syncFinalizedMealToServer(meal: LocalMealRecord): Promise<void> {
  const payload = {
    client_request_id: meal.id,
    meal_name: meal.meal_name,
    meal_type: meal.meal_type,
    consumed_at: meal.consumed_at,
    total_calories: meal.total_calories,
    total_macros: meal.total_macros,
    food_items: meal.food_items,
  };

  const response = await fetch('/api/food/confirm-meal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Client-Request-Id': meal.id,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to sync meal to server: ${err}`);
  }
}

/**
 * Stage 3 Offline-First Ingestion Orchestrator:
 * 1. Creates local record with status PENDING_UPLOAD in IndexedDB.
 * 2. Enqueues item into outbox_queue with 350KB image blob.
 * 3. If online: attempts immediate background upload & transitions to PENDING_REVIEW.
 * 4. If offline: updates state to "Meal Saved Offline" and leaves in outbox for reconnection.
 */
export async function ingestMealImage(
  imageBlob: Blob,
  mealType: MealType = 'LUNCH',
  isOnline: boolean = true
): Promise<DispatchResult> {
  const clientRequestId = generateUUIDv7();
  const now = Date.now();
  const consumedAt = new Date().toISOString();

  // Create initial local draft record
  const initialRecord: LocalMealRecord = {
    id: clientRequestId,
    meal_name: 'Analyzing Meal...',
    meal_type: mealType,
    status: 'PENDING_UPLOAD',
    consumed_at: consumedAt,
    total_calories: 0,
    total_macros: { protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    food_items: [],
    created_at: now,
    updated_at: now,
  };

  // 1. Write meal record to Dexie
  await db.saveMeal(initialRecord);

  // 2. Write to Outbox Queue
  const queueItemId = await db.enqueueOutbox({
    client_request_id: clientRequestId,
    action: 'ANALYZE_IMAGE',
    image_blob: imageBlob,
    created_at: now,
    retry_count: 0,
  });

  notifySyncListeners();

  // If offline, return immediately with optimistic saved state
  if (!isOnline) {
    return {
      client_request_id: clientRequestId,
      isOffline: true,
    };
  }

  // If online, dispatch upload immediately
  try {
    await db.updateMealStatus(clientRequestId, 'ANALYZING');
    notifySyncListeners();

    const analysis = await uploadMealImageForAnalysis(imageBlob, clientRequestId);

    // Update local record with Gemini analysis
    await db.updateMealStatus(clientRequestId, 'PENDING_REVIEW', {
      meal_name: analysis.meal_name,
      total_calories: analysis.total_calories,
      total_macros: analysis.total_macros,
      food_items: analysis.food_items,
    });

    // Remove from outbox on success
    await db.dequeueOutbox(queueItemId);
    notifySyncListeners();

    return {
      client_request_id: clientRequestId,
      isOffline: false,
      analysis,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    await db.recordOutboxError(queueItemId, message);
    await db.updateMealStatus(clientRequestId, 'PENDING_UPLOAD');
    notifySyncListeners();

    return {
      client_request_id: clientRequestId,
      isOffline: false,
      error: message,
    };
  }
}

/**
 * Flushes all pending outbox items when connection is restored.
 */
export async function drainOutboxQueue(): Promise<void> {
  const pending = await db.getPendingOutbox();
  if (pending.length === 0) return;

  for (const item of pending) {
    if (item.action === 'ANALYZE_IMAGE' && item.image_blob && item.id) {
      try {
        await db.updateMealStatus(item.client_request_id, 'ANALYZING');
        notifySyncListeners();

        const analysis = await uploadMealImageForAnalysis(
          item.image_blob,
          item.client_request_id
        );

        await db.updateMealStatus(item.client_request_id, 'PENDING_REVIEW', {
          meal_name: analysis.meal_name,
          total_calories: analysis.total_calories,
          total_macros: analysis.total_macros,
          food_items: analysis.food_items,
        });

        await db.dequeueOutbox(item.id);
        notifySyncListeners();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        await db.recordOutboxError(item.id, msg);
        await db.updateMealStatus(item.client_request_id, 'PENDING_UPLOAD');
      }
    } else if (item.action === 'CONFIRM_MEAL' && item.id) {
      try {
        const meal = await db.meals.get(item.client_request_id);
        if (meal) {
          await syncFinalizedMealToServer(meal);
          await db.dequeueOutbox(item.id);
          notifySyncListeners();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Sync failed';
        await db.recordOutboxError(item.id, msg);
      }
    }
  }
}

// Auto-attach lifecycle listeners for reconnect & foreground visibility
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    drainOutboxQueue().catch(console.error);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      drainOutboxQueue().catch(console.error);
    }
  });
}
