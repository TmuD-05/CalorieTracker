import Dexie, { type Table } from 'dexie';
import type { LocalMealRecord, OutboxQueueItem, MealStatus } from '../types/meal';

/**
 * CalorieTrackerDB (Stage 3: Offline-First Storage Engine)
 *
 * Backed by IndexedDB via Dexie.js:
 * - `meals`: Stores complete meal history, itemized breakdowns, and local states.
 * - `outbox_queue`: Stores pending actions and 350KB image blobs for reliable background sync.
 */
export class CalorieTrackerDB extends Dexie {
  meals!: Table<LocalMealRecord, string>;
  outbox_queue!: Table<OutboxQueueItem, number>;

  constructor() {
    super('CalorieTrackerDB');
    this.version(1).stores({
      meals: 'id, consumed_at, status, meal_type, created_at',
      outbox_queue: '++id, client_request_id, action, created_at',
    });
  }

  /**
   * Saves or updates a meal record in local IndexedDB.
   */
  async saveMeal(meal: LocalMealRecord): Promise<string> {
    await this.meals.put(meal);
    return meal.id;
  }

  /**
   * Updates only the status and optional fields of a meal.
   */
  async updateMealStatus(
    id: string,
    status: MealStatus,
    patch?: Partial<LocalMealRecord>
  ): Promise<void> {
    await this.meals.update(id, {
      status,
      updated_at: Date.now(),
      ...patch,
    });
  }

  /**
   * Adds an item to the outbox queue to be synced to the backend.
   */
  async enqueueOutbox(item: OutboxQueueItem): Promise<number> {
    return await this.outbox_queue.add(item);
  }

  /**
   * Retrieves all pending outbox queue items, ordered chronologically.
   */
  async getPendingOutbox(): Promise<OutboxQueueItem[]> {
    return await this.outbox_queue.orderBy('created_at').toArray();
  }

  /**
   * Removes an item from the outbox queue after successful sync.
   */
  async dequeueOutbox(id: number): Promise<void> {
    await this.outbox_queue.delete(id);
  }

  /**
   * Increments retry count or records error on an outbox queue item.
   */
  async recordOutboxError(id: number, error: string): Promise<void> {
    const item = await this.outbox_queue.get(id);
    if (item) {
      await this.outbox_queue.update(id, {
        retry_count: (item.retry_count || 0) + 1,
        error,
      });
    }
  }

  /**
   * Fetches all finalized meals logged on the given calendar date (defaults to today).
   */
  async getMealsForDate(dateStr?: string): Promise<LocalMealRecord[]> {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    const allMeals = await this.meals
      .where('status')
      .equals('FINALIZED')
      .toArray();

    return allMeals.filter((meal) => meal.consumed_at.startsWith(targetDate));
  }

  /**
   * Request persistent storage from browser (prevents iOS Safari 7-day eviction).
   */
  async ensurePersistence(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }
}

export const db = new CalorieTrackerDB();
