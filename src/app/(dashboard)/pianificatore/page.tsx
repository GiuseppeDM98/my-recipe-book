'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRecipes } from '@/lib/hooks/useRecipes';
import { useMealPlanner } from '@/lib/hooks/useMealPlanner';
import { MealPlanSetupForm } from '@/components/meal-planner/MealPlanSetupForm';
import { WeeklyCalendarGrid } from '@/components/meal-planner/WeeklyCalendarGrid';
import { PlannerHeader } from '@/components/meal-planner/PlannerHeader';
import { RecipePickerSheet } from '@/components/meal-planner/RecipePickerSheet';
import { NewRecipeReviewCard } from '@/components/meal-planner/NewRecipeReviewCard';
import { Spinner } from '@/components/ui/spinner';
import { getUserCategories } from '@/lib/firebase/categories';
import { getLatestMealPlan } from '@/lib/firebase/meal-plans';
import { Category, MealPlan, MealPlanSetupConfig, MealSlot, MealType, Season } from '@/types';
import { getCurrentWeekMonday } from '@/lib/constants/seasons';
import { CalendarDays, Sparkles, PenLine, MousePointerClick, BookMarked } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Meal Planner Page
 *
 * UX FLOW (3 steps):
 * 1. SETUP: MealPlanSetupForm — collect season, meal types, exclusions, new recipe count
 * 2. GENERATING: Loading screen while AI builds the plan
 * 3. CALENDAR: WeeklyCalendarGrid — editable 7-day view
 *
 * ON MOUNT:
 * Loads the user's most recent plan from Firebase. If found, skips setup and
 * goes straight to the calendar. User can always start fresh with "Nuovo piano".
 *
 * TEST ACCOUNT:
 * "Genera con AI" is disabled. Manual mode is still accessible.
 */
export default function PianificatorePage() {
  const { user } = useAuth();
  const { recipes } = useRecipes();
  const {
    step,
    currentPlan,
    isGenerating,
    error: plannerError,
    generatePlan,
    createManualPlan,
    updateSlot,
    clearSlot,
    saveNewRecipeToCookbook,
    resetToSetup,
    loadPlan,
  } = useMealPlanner();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Recipe picker sheet state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; mealType: MealType } | null>(null);

  // AI-generated recipe save states
  const [savingSlotKeys, setSavingSlotKeys] = useState<Set<string>>(new Set());
  const [savedSlotKeys, setSavedSlotKeys] = useState<Set<string>>(new Set());
  // Tracks which review cards should be force-opened (triggered from the grid cell button)
  const [expandedSlotKeys, setExpandedSlotKeys] = useState<Set<string>>(new Set());

  const isTestAccount = user?.email === 'test@test.com';

  // Load categories and restore latest plan on mount
  useEffect(() => {
    if (!user) return;

    async function init() {
      try {
        const [cats, latestPlan] = await Promise.all([
          getUserCategories(user!.uid),
          getLatestMealPlan(user!.uid),
        ]);
        setCategories(cats);

        // Restore last plan so the user doesn't have to regenerate on every visit
        if (latestPlan) {
          loadPlan(latestPlan);
        }
      } catch (err) {
        console.error('Errore nel caricamento:', err);
      } finally {
        setCategoriesLoading(false);
      }
    }

    init();
  }, [user, loadPlan]);

  // Show planner error as toast
  useEffect(() => {
    if (plannerError) {
      toast.error(plannerError);
    }
  }, [plannerError]);

  // ── Slot picker ──────────────────────────────────────────
  function handleSlotClick(dayIndex: number, mealType: MealType) {
    setPickerTarget({ dayIndex, mealType });
    setPickerOpen(true);
  }

  const handleSlotSelect = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    recipeId: string,
    title: string
  ) => {
    try {
      await updateSlot(dayIndex, mealType, recipeId, title);
    } catch {
      toast.error('Errore nel salvataggio dello slot');
    }
  }, [updateSlot]);

  const handleSlotClear = useCallback(async (dayIndex: number, mealType: MealType) => {
    try {
      await clearSlot(dayIndex, mealType);
    } catch {
      toast.error('Errore nella rimozione della ricetta');
    }
  }, [clearSlot]);

  // ── Save new AI recipe ────────────────────────────────────
  function slotKey(slot: MealSlot): string {
    return `${slot.dayIndex}-${slot.mealType}`;
  }

  async function handleSaveNewRecipe(slot: MealSlot, categoryName: string, seasons: Season[]) {
    const key = slotKey(slot);
    setSavingSlotKeys(prev => new Set(prev).add(key));

    try {
      await saveNewRecipeToCookbook(slot, categoryName, seasons);
      setSavedSlotKeys(prev => new Set(prev).add(key));
      toast.success('Ricetta salvata nel ricettario!');
    } catch (err: unknown) {
      toast.error('Errore nel salvataggio della ricetta');
      console.error(err);
    } finally {
      setSavingSlotKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  // ── Week navigation ───────────────────────────────────────
  function handlePrevWeek() {
    if (!currentPlan) return;
    const d = new Date(currentPlan.weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    // Navigating weeks doesn't create a new plan — just prompts setup for that week
    toast('Per pianificare un\'altra settimana, crea un nuovo piano', { icon: '📅' });
  }

  function handleNextWeek() {
    if (!currentPlan) return;
    toast('Per pianificare un\'altra settimana, crea un nuovo piano', { icon: '📅' });
  }

  function handleDeletePlan() {
    if (!confirm('Sei sicuro di voler eliminare questo piano pasti?')) return;
    resetToSetup();
    setSavedSlotKeys(new Set());
    setSavingSlotKeys(new Set());
  }

  // ── New AI recipes (slots with newRecipe) ─────────────────
  const newRecipeSlots = currentPlan?.slots.filter(s => s.newRecipe !== null) ?? [];

  // ── Picker: find the current slot for the picker target ──
  const pickerCurrentSlot = pickerTarget
    ? currentPlan?.slots.find(
        s => s.dayIndex === pickerTarget.dayIndex && s.mealType === pickerTarget.mealType
      )
    : undefined;

  // ── Render ────────────────────────────────────────────────

  if (!user || categoriesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
      {/* Page title */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Pianificatore pasti</h1>
      </div>

      {/* ── STEP: SETUP ──────────────────────────────── */}
      {step === 'setup' && (
        <div className="max-w-lg space-y-6">
          {/* How-to info box */}
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">Come usare il pianificatore</p>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Genera con AI</span> — l'AI sceglie ricette dal tuo ricettario e, se vuoi, ne crea di nuove adatte alla stagione.</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <PenLine className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Crea manuale</span> — parte da una griglia vuota: riempi tu ogni slot cliccandoci sopra.</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <MousePointerClick className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Modifica dopo la generazione</span> — clicca qualsiasi slot per cambiare la ricetta assegnata.</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <BookMarked className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span><span className="font-medium text-foreground">Salva le ricette nuove</span> — le ricette generate dall'AI appaiono in viola: salvale nel ricettario con un click.</span>
              </li>
            </ul>
          </div>

          <MealPlanSetupForm
            categories={categories}
            onGenerateWithAI={(config: MealPlanSetupConfig) =>
              generatePlan(config, recipes, categories)
            }
            onCreateManual={(config: MealPlanSetupConfig) => createManualPlan(config)}
            isLoading={isGenerating}
            isTestAccount={isTestAccount}
          />
        </div>
      )}

      {/* ── STEP: GENERATING ─────────────────────────── */}
      {step === 'generating' && (
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
          <Spinner />
          <div>
            <p className="text-lg font-semibold">L'AI sta pianificando la tua settimana...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sto scegliendo le ricette migliori per te
            </p>
          </div>
        </div>
      )}

      {/* ── STEP: CALENDAR ───────────────────────────── */}
      {step === 'calendar' && currentPlan && (
        <div className="space-y-4">
          {/* Header with week navigation */}
          <PlannerHeader
            weekStartDate={currentPlan.weekStartDate}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onNewPlan={resetToSetup}
            onDeletePlan={handleDeletePlan}
            hasPlan={true}
            isGenerating={false}
          />

          {/* Calendar grid */}
          <WeeklyCalendarGrid
            plan={currentPlan}
            recipes={recipes}
            categories={categories}
            onSlotClick={handleSlotClick}
            onSaveNewRecipe={(slot: MealSlot) => {
              const key = slotKey(slot);
              // Force-open the review card, then scroll to it
              setExpandedSlotKeys(prev => new Set(prev).add(key));
              setTimeout(() => {
                document.getElementById(`new-recipe-${key}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
            }}
            weekStartDate={currentPlan.weekStartDate}
          />

          {/* AI-generated recipes to review and optionally save */}
          {newRecipeSlots.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                ✨ Ricette generate dall'AI
                <span className="text-xs font-normal text-muted-foreground">
                  — salvale nel ricettario quando vuoi
                </span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {newRecipeSlots.map(slot => (
                  <div key={slotKey(slot)} id={`new-recipe-${slotKey(slot)}`}>
                    <NewRecipeReviewCard
                      slot={slot}
                      categories={categories}
                      onSave={handleSaveNewRecipe}
                      isSaving={savingSlotKeys.has(slotKey(slot))}
                      isSaved={savedSlotKeys.has(slotKey(slot))}
                      forceExpanded={expandedSlotKeys.has(slotKey(slot))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recipe picker sheet (rendered outside the grid to avoid portal issues) */}
      {pickerTarget && currentPlan && (
        <RecipePickerSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          dayIndex={pickerTarget.dayIndex}
          mealType={pickerTarget.mealType}
          recipes={recipes}
          categories={categories}
          currentSlot={pickerCurrentSlot}
          planSeason={currentPlan.season}
          onSelect={handleSlotSelect}
          onClear={handleSlotClear}
        />
      )}
    </div>
  );
}
