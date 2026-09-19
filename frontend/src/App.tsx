import { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  Barcode,
  BookOpen,
  Utensils,
  Sparkles,
  Activity,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { CameraCapture } from './components/CameraCapture';
import { MealReviewModal } from './components/MealReviewModal';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { db } from './services/db';
import {
  ingestMealImage,
  syncFinalizedMealToServer,
  subscribeToSyncEvents,
} from './services/outboxDispatcher';
import type { TransformedImageResult } from './services/imageTransform';
import type { LocalMealRecord, MealAnalysis } from './types/meal';

type TabMode = 'camera' | 'barcode' | 'recipe';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabMode>('camera');

  // Network status hook with offline simulation toggle
  const { isOnline, simulatedOffline, toggleSimulatedOffline } = useNetworkStatus();

  // Ingestion & Review State Machine
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Stage 5 Review State
  const [reviewState, setReviewState] = useState<{
    analysis: MealAnalysis;
    clientRequestId: string;
    previewUrl?: string;
  } | null>(null);
  const [isSavingReview, setIsSavingReview] = useState<boolean>(false);

  // Today's Meals & Energy Summary (from IndexedDB)
  const [todayMeals, setTodayMeals] = useState<LocalMealRecord[]>([]);
  const [outboxCount, setOutboxCount] = useState<number>(0);

  const loadTodayMeals = useCallback(async () => {
    try {
      const meals = await db.getMealsForDate();
      setTodayMeals(meals);

      const pending = await db.getPendingOutbox();
      setOutboxCount(pending.length);
    } catch (e) {
      console.error('Failed to load local meals from IndexedDB:', e);
    }
  }, []);

  useEffect(() => {
    loadTodayMeals();
    db.ensurePersistence();

    const unsubscribe = subscribeToSyncEvents(() => {
      loadTodayMeals();
    });

    return () => {
      unsubscribe();
    };
  }, [loadTodayMeals]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4000);
  };

  // Stage 3 & Stage 4 Ingestion Handler
  const handleAnalyzeMeal = async (transformed: TransformedImageResult) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const result = await ingestMealImage(transformed.blob, 'LUNCH', isOnline);

      if (result.isOffline) {
        showToast('Meal Saved Offline (Outbox Queued). Will sync when online.');
        await loadTodayMeals();
      } else if (result.analysis) {
        setReviewState({
          analysis: result.analysis,
          clientRequestId: result.client_request_id,
          previewUrl: transformed.previewUrl,
        });
      } else if (result.error) {
        setAnalysisError(result.error);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed.';
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Stage 5 Confirm Handler
  const handleConfirmReview = async (finalizedMeal: LocalMealRecord) => {
    setIsSavingReview(true);
    try {
      // 1. Commit to IndexedDB as FINALIZED
      await db.saveMeal(finalizedMeal);

      // 2. Sync to backend if online, or queue for sync
      if (isOnline) {
        try {
          await syncFinalizedMealToServer(finalizedMeal);
        } catch (e) {
          console.warn('Direct server sync failed; enqueuing to outbox:', e);
          await db.enqueueOutbox({
            client_request_id: finalizedMeal.id,
            action: 'CONFIRM_MEAL',
            created_at: Date.now(),
            retry_count: 0,
          });
        }
      } else {
        await db.enqueueOutbox({
          client_request_id: finalizedMeal.id,
          action: 'CONFIRM_MEAL',
          created_at: Date.now(),
          retry_count: 0,
        });
      }

      showToast(`Logged "${finalizedMeal.meal_name}" (${finalizedMeal.total_calories} kcal)`);
      setReviewState(null);
      await loadTodayMeals();
    } catch (err: unknown) {
      console.error('Error finalizing meal:', err);
      showToast('Error saving meal locally.');
    } finally {
      setIsSavingReview(false);
    }
  };

  // Compute Daily Energy from Today's Finalized Meals
  const totalCalories = todayMeals.reduce((acc, m) => acc + (m.total_calories || 0), 0);
  const totalProtein = todayMeals.reduce((acc, m) => acc + (m.total_macros?.protein_g || 0), 0);
  const totalCarbs = todayMeals.reduce((acc, m) => acc + (m.total_macros?.carbs_g || 0), 0);
  const totalFat = todayMeals.reduce((acc, m) => acc + (m.total_macros?.fat_g || 0), 0);
  const targetCalories = 2200;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Mobile App Container */}
      <div className="w-full max-w-md min-h-screen flex flex-col justify-between border-x border-slate-800 bg-slate-900 shadow-2xl relative">
        
        {/* Toast Notification */}
        {toastMessage && (
          <div className="absolute top-16 left-4 right-4 z-50 p-3 bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-xl flex items-center justify-between animate-in fade-in slide-in-from-top duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="text-slate-950/70 hover:text-slate-950 text-sm font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="px-5 py-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 sticky top-0 z-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight text-white">MacroTrack</h1>
              <p className="text-xs text-slate-400">Offline-First Nutrition Engine</p>
            </div>
          </div>

          {/* Network Pill with Simulated Toggle for Testing */}
          <button
            type="button"
            onClick={toggleSimulatedOffline}
            title={simulatedOffline ? 'Simulating offline. Tap to reconnect.' : 'Online. Tap to simulate offline.'}
            className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium transition cursor-pointer ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span>Offline{simulatedOffline ? ' (Sim)' : ''}</span>
              </>
            )}
            {outboxCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-slate-950 font-bold rounded-full text-[10px]">
                {outboxCount}
              </span>
            )}
          </button>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 p-5 flex flex-col space-y-4">
          
          {/* Daily Quick Summary Card */}
          <section className="p-4 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-800/40 border border-slate-700/60 shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Today's Energy</span>
              </div>
              <span className="text-xs text-slate-400">Target: {targetCalories.toLocaleString()} kcal</span>
            </div>
            
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-extrabold tracking-tight text-white font-mono">
                {totalCalories}
              </span>
              <span className="text-sm font-medium text-slate-400">
                / {targetCalories.toLocaleString()} kcal
              </span>
              <span className="text-xs text-slate-500 ml-auto font-medium">
                {todayMeals.length} {todayMeals.length === 1 ? 'meal' : 'meals'} logged
              </span>
            </div>
            
            {/* Macro Pill Bars */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-blue-400 block mb-0.5">Protein</span>
                <span className="text-sm font-bold text-white font-mono">{totalProtein}g</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-amber-400 block mb-0.5">Carbs</span>
                <span className="text-sm font-bold text-white font-mono">{totalCarbs}g</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-rose-400 block mb-0.5">Fat</span>
                <span className="text-sm font-bold text-white font-mono">{totalFat}g</span>
              </div>
            </div>
          </section>

          {/* Error Banner */}
          {analysisError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Analysis Failed</span>
                <span>{analysisError}</span>
              </div>
            </div>
          )}

          {/* Active Mode Container */}
          <section className="flex-1 flex flex-col justify-center items-center text-center p-4 border border-slate-800 rounded-2xl bg-slate-900/40 min-h-[300px]">
            {activeTab === 'camera' && (
              <CameraCapture
                onAnalyze={handleAnalyzeMeal}
                isAnalyzing={isAnalyzing}
              />
            )}

            {activeTab === 'barcode' && (
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-4 shadow-inner">
                  <Barcode className="w-8 h-8" />
                </div>
                <h2 className="text-base font-semibold text-white mb-1">Barcode Scanner</h2>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  Point your camera at a packaged food barcode to look up official Open Food Facts nutrition.
                </p>
                <button
                  type="button"
                  className="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <Barcode className="w-4 h-4" />
                  Start Scanner
                </button>
              </div>
            )}

            {activeTab === 'recipe' && (
              <div className="flex flex-col items-center w-full">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-inner">
                  <BookOpen className="w-8 h-8" />
                </div>
                <h2 className="text-base font-semibold text-white mb-1">Describe Meal or Recipe</h2>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  Type or paste ingredients (e.g. "200g of beef and 150g of rice").
                </p>
                <textarea
                  placeholder="e.g. 2 eggs scrambled with 1 tbsp butter and 2 slices toast..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500/50 mb-3"
                />
                <button
                  type="button"
                  className="w-full py-2.5 bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-xl transition-all shadow-md shadow-purple-500/20 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Analyze with Gemini
                </button>
              </div>
            )}
          </section>

          {/* Today's Logged Meals History (IndexedDB) */}
          {todayMeals.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                <span>Today's Logged Meals</span>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">{todayMeals.length} logged</span>
              </div>

              <div className="space-y-2">
                {todayMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">{meal.meal_name}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase font-semibold">
                          {meal.meal_type}
                        </span>
                      </div>
                      <div className="flex gap-2 text-[10px] text-slate-400 font-mono">
                        <span className="text-emerald-400 font-bold">{meal.total_calories} kcal</span>
                        <span>P: {meal.total_macros.protein_g}g</span>
                        <span>C: {meal.total_macros.carbs_g}g</span>
                        <span>F: {meal.total_macros.fat_g}g</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[11px]">
                        {new Date(meal.consumed_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </main>

        {/* Stage 5: Human-In-The-Loop Review Modal */}
        {reviewState && (
          <MealReviewModal
            initialMeal={reviewState.analysis}
            clientRequestId={reviewState.clientRequestId}
            imagePreviewUrl={reviewState.previewUrl}
            onConfirm={handleConfirmReview}
            onCancel={() => setReviewState(null)}
            isSaving={isSavingReview}
          />
        )}

        {/* Bottom Navigation Bar */}
        <nav className="p-3 bg-slate-950/90 backdrop-blur border-t border-slate-800 sticky bottom-0 z-20">
          <div className="grid grid-cols-3 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              className={`py-2 px-3 rounded-xl flex flex-col items-center gap-1 transition-all text-xs font-medium cursor-pointer ${
                activeTab === 'camera'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Camera className="w-5 h-5" />
              <span>Camera</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('barcode')}
              className={`py-2 px-3 rounded-xl flex flex-col items-center gap-1 transition-all text-xs font-medium cursor-pointer ${
                activeTab === 'barcode'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Barcode className="w-5 h-5" />
              <span>Barcode</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('recipe')}
              className={`py-2 px-3 rounded-xl flex flex-col items-center gap-1 transition-all text-xs font-medium cursor-pointer ${
                activeTab === 'recipe'
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span>Recipe</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  );
}
