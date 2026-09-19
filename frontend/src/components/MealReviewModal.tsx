import React, { useState } from 'react';
import { Check, Trash2, Plus, Sliders, Utensils, X, Flame } from 'lucide-react';
import type { FoodItem, LocalMealRecord, MealAnalysis } from '../types/meal';

interface MealReviewModalProps {
  initialMeal: MealAnalysis;
  clientRequestId: string;
  imagePreviewUrl?: string;
  onConfirm: (finalizedMeal: LocalMealRecord) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

interface EditableItem extends FoodItem {
  id: string;
  baseWeight: number;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  baseFiber: number;
}

export const MealReviewModal: React.FC<MealReviewModalProps> = ({
  initialMeal,
  clientRequestId,
  imagePreviewUrl,
  onConfirm,
  onCancel,
  isSaving = false,
}) => {
  const [mealName, setMealName] = useState<string>(initialMeal.meal_name);
  const [mealType, setMealType] = useState<'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK'>('LUNCH');

  // Initialize items with baseline nutrient ratios for proportional slider scaling
  const [items, setItems] = useState<EditableItem[]>(() => {
    return initialMeal.food_items.map((item, index) => {
      const weight = Math.max(1, item.estimated_weight_g || 100);
      return {
        ...item,
        id: `item-${index}-${Date.now()}`,
        baseWeight: weight,
        baseCalories: item.calories || 0,
        baseProtein: item.macros?.protein_g || 0,
        baseCarbs: item.macros?.carbs_g || 0,
        baseFat: item.macros?.fat_g || 0,
        baseFiber: item.macros?.fiber_g || 0,
      };
    });
  });

  // Calculate live dynamic totals
  const totalCalories = items.reduce((sum, item) => sum + item.calories, 0);
  const totalProtein = items.reduce((sum, item) => sum + item.macros.protein_g, 0);
  const totalCarbs = items.reduce((sum, item) => sum + item.macros.carbs_g, 0);
  const totalFat = items.reduce((sum, item) => sum + item.macros.fat_g, 0);
  const totalFiber = items.reduce((sum, item) => sum + (item.macros.fiber_g || 0), 0);

  // Portion slider handler: proportionally recalculates calories and macros
  const handleWeightChange = (itemId: string, newWeight: number) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id !== itemId) return item;

        const ratio = item.baseWeight > 0 ? newWeight / item.baseWeight : 1;

        return {
          ...item,
          estimated_weight_g: newWeight,
          calories: Math.max(0, Math.round(item.baseCalories * ratio)),
          macros: {
            protein_g: Math.max(0, Math.round(item.baseProtein * ratio)),
            carbs_g: Math.max(0, Math.round(item.baseCarbs * ratio)),
            fat_g: Math.max(0, Math.round(item.baseFat * ratio)),
            fiber_g: Math.max(0, Math.round(item.baseFiber * ratio)),
          },
        };
      })
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  const handleAddItem = () => {
    const newItem: EditableItem = {
      id: `custom-${Date.now()}`,
      name: 'Custom Item',
      estimated_weight_g: 100,
      calories: 120,
      macros: { protein_g: 5, carbs_g: 15, fat_g: 4, fiber_g: 1 },
      baseWeight: 100,
      baseCalories: 120,
      baseProtein: 5,
      baseCarbs: 15,
      baseFat: 4,
      baseFiber: 1,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleFinalSubmit = () => {
    const finalizedRecord: LocalMealRecord = {
      id: clientRequestId,
      meal_name: mealName.trim() || 'Logged Meal',
      meal_type: mealType,
      status: 'FINALIZED',
      consumed_at: new Date().toISOString(),
      total_calories: totalCalories,
      total_macros: {
        protein_g: totalProtein,
        carbs_g: totalCarbs,
        fat_g: totalFat,
        fiber_g: totalFiber,
      },
      food_items: items.map(({ id: _, baseWeight: _b, baseCalories: _c, baseProtein: _p, baseCarbs: _cb, baseFat: _f, baseFiber: _fb, ...rest }) => rest),
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    onConfirm(finalizedRecord);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in slide-in-from-bottom duration-200">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                Human-In-The-Loop Review
              </span>
              <h2 className="text-base font-bold text-white leading-tight">Review Detected Portions</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Optional Image Thumbnail */}
          {imagePreviewUrl && (
            <div className="w-full h-32 rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <img src={imagePreviewUrl} alt="Meal preview" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Editable Meal Title & Meal Type */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400">Meal Name</label>
            <input
              type="text"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="e.g. Steak with Rice and Broccoli"
            />

            {/* Meal Type Pills */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMealType(type)}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg border transition ${
                    mealType === type
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                      : 'border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {type[0] + type.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Macro Summary Banner */}
          <div className="p-3 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-800/40 border border-slate-700/60 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Live Recalculated Energy
              </span>
              <span className="text-xl font-extrabold text-white font-mono">
                {totalCalories} <span className="text-xs font-normal text-slate-400">kcal</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/70 p-2 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-blue-400 block">Protein</span>
                <span className="text-xs font-bold text-white font-mono">{totalProtein}g</span>
              </div>
              <div className="bg-slate-900/70 p-2 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">Carbs</span>
                <span className="text-xs font-bold text-white font-mono">{totalCarbs}g</span>
              </div>
              <div className="bg-slate-900/70 p-2 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-rose-400 block">Fat</span>
                <span className="text-xs font-bold text-white font-mono">{totalFat}g</span>
              </div>
            </div>
          </div>

          {/* Portion Sliders Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                <span>Detected Ingredients ({items.length})</span>
              </div>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3 h-3" />
                Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/90 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const val = e.target.value;
                        setItems((prev) =>
                          prev.map((it) => (it.id === item.id ? { ...it, name: val } : it))
                        );
                      }}
                      className="bg-transparent text-xs font-bold text-white focus:outline-none focus:border-b border-emerald-500 max-w-[200px]"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {item.calories} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-slate-500 hover:text-rose-400 transition"
                        title="Remove ingredient"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Weight Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Portion Weight</span>
                      <span className="font-bold text-white font-mono">{item.estimated_weight_g} g</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={600}
                      step={5}
                      value={item.estimated_weight_g}
                      onChange={(e) => handleWeightChange(item.id, Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                    />
                  </div>

                  {/* Item Macro Breakdown Badges */}
                  <div className="flex gap-2 text-[10px] text-slate-400 pt-1">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 font-mono">
                      P: {item.macros.protein_g}g
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">
                      C: {item.macros.carbs_g}g
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 font-mono">
                      F: {item.macros.fat_g}g
                    </span>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No items in this meal. Tap "Add Item" above to add one.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer: Confirm Action */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleFinalSubmit}
            disabled={isSaving || items.length === 0}
            className="flex-[2] py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 text-xs font-bold rounded-xl transition shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {isSaving ? 'Saving Meal...' : 'Confirm & Log Meal'}
          </button>
        </div>

      </div>
    </div>
  );
};
