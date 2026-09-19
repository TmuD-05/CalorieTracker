/**
 * Meal & Nutrition Type Definitions
 *
 * Matches the backend Django Ninja / Pydantic schemas:
 * - MacroNutrients
 * - FoodItem
 * - MealAnalysis
 * - MealRecord & Outbox items for IndexedDB (Dexie)
 */

export interface MacroNutrients {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g?: number;
}

export interface FoodItem {
  name: string;
  estimated_weight_g: number;
  calories: number;
  macros: MacroNutrients;
  // Per-gram reference ratios for instant, proportional client recalculation
  base_weight_g?: number;
  base_calories?: number;
  base_protein_g?: number;
  base_carbs_g?: number;
  base_fat_g?: number;
  base_fiber_g?: number;
}

export interface MealAnalysis {
  meal_name: string;
  total_calories: number;
  total_macros: MacroNutrients;
  food_items: FoodItem[];
}

export type MealStatus = 'PENDING_UPLOAD' | 'ANALYZING' | 'PENDING_REVIEW' | 'FINALIZED';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';

export interface LocalMealRecord {
  id: string; // client_request_id (UUIDv7)
  meal_name: string;
  meal_type: MealType;
  status: MealStatus;
  consumed_at: string; // ISO-8601 timestamp
  total_calories: number;
  total_macros: MacroNutrients;
  food_items: FoodItem[];
  image_preview_url?: string; // Optional local preview pointer or thumbnail
  created_at: number; // Unix epoch ms
  updated_at: number; // Unix epoch ms
}

export interface OutboxQueueItem {
  id?: number; // Auto-increment primary key
  client_request_id: string; // UUIDv7
  action: 'ANALYZE_IMAGE' | 'CONFIRM_MEAL';
  image_blob?: Blob; // 350KB WebP blob stored safely offline
  payload?: Record<string, unknown>; // Optional additional serialized metadata
  created_at: number;
  retry_count: number;
  error?: string;
}
