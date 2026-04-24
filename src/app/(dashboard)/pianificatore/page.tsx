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
import { getUserCategories } from '@/lib/firebase/categories';
import { deleteMealPlan, getMealPlanByWeek, getUserMealPlans } from '@/lib/firebase/meal-plans';
import { Button } from '@/components/ui/button';
import { Category, MealPlan, MealPlanSetupConfig, MealSlot, MealType, Season } from '@/types';
import { addWeeksToDateString, getCurrentWeekMonday } from '@/lib/constants/seasons';
import { CalendarDays, Sparkles, PenLine, MousePointerClick, BookMarked, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useFamilyProfile } from '@/lib/hooks/useFamilyProfile';
import { validateFamilyContextUsage } from '@/lib/utils/family-context';
import Link from 'next/link';
import { EditorialLoader } from '@/components/ui/editorial-loader';
import { StatusBanner } from '@/components/ui/status-banner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Meal Planner Page
 *
 * UX FLOW (3 steps):
 * 1. SETUP: MealPlanSetupForm — collect season, meal types, exclusions, new recipe count
 * 2. GENERATING: Loading screen while AI builds the plan
 * 3. CALENDAR: WeeklyCalendarGrid — editable 7-day view
 *
 * ON MOUNT:
 * Loads the plan for the current week from Firebase. If no plan exists yet for
 * that week, the page stays on setup with the week already preselected.
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
    regenerateSlot,
    removeDay,
    regeneratingSlots,
    resetToSetup,
    loadPlan,
    loadPlanForWeek,
  } = useMealPlanner();

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [setupWeekStartDate, setSetupWeekStartDate] = useState(getCurrentWeekMonday());
  const [savedPlans, setSavedPlans] = useState<MealPlan[]>([]);
  const [useFamilyContext, setUseFamilyContext] = useState(false);
  const {
    familyProfile,
    hasValidProfile,
  } = useFamilyProfile();

  // Recipe picker sheet state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; mealType: MealType } | null>(null);
  const [regenerateTarget, setRegenerateTarget] = useState<{ dayIndex: number; mealType: MealType } | null>(null);
  const [regenerateNotes, setRegenerateNotes] = useState('');

  // AI-generated recipe save states
  const [savingSlotKeys, setSavingSlotKeys] = useState<Set<string>>(new Set());
  const [savedSlotKeys, setSavedSlotKeys] = useState<Set<string>>(new Set());
  // Tracks which review cards should be force-opened (triggered from the grid cell button)
  const [expandedSlotKeys, setExpandedSlotKeys] = useState<Set<string>>(new Set());

  const isTestAccount = user?.email === 'test@test.com';
  const viewedWeekStartDate = currentPlan?.weekStartDate ?? setupWeekStartDate;
  const activeDays = currentPlan?.activeDays ?? [0, 1, 2, 3, 4, 5, 6];

  async function refreshSavedPlans(currentUserId: string) {
    const plans = await getUserMealPlans(currentUserId);
    setSavedPlans(plans);
  }

  // Load categories and restore the current week's plan on mount.
  useEffect(() => {
    if (!user) return;
    const currentUserId = user.uid;

    async function init() {
      const currentWeekStartDate = getCurrentWeekMonday();

      try {
        const [cats, currentWeekPlan] = await Promise.all([
          getUserCategories(currentUserId),
          getMealPlanByWeek(currentUserId, currentWeekStartDate),
        ]);
        setCategories(cats);
        setSetupWeekStartDate(currentWeekStartDate);
        await refreshSavedPlans(currentUserId);

        if (currentWeekPlan) {
          loadPlan(currentWeekPlan);
        }
      } catch (err) {
        console.error('Errore nel caricamento:', err);
      } finally {
        setCategoriesLoading(false);
      }
    }

    init();
  }, [user, loadPlan]);

  useEffect(() => {
    if (currentPlan) {
      setSetupWeekStartDate(currentPlan.weekStartDate);
    }
  }, [currentPlan]);

  useEffect(() => {
    if (!user || !currentPlan) return;

    refreshSavedPlans(user.uid).catch(err => {
      console.error('Errore nell\'aggiornamento dei piani salvati:', err);
    });
  }, [user, currentPlan]);

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

  function handleOpenRegenerateDialog(dayIndex: number, mealType: MealType) {
    setRegenerateTarget({ dayIndex, mealType });
    setRegenerateNotes('');
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
      const message = err instanceof Error ? err.message : 'Errore nel salvataggio della ricetta';
      toast.error(message);
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
  async function handlePrevWeek() {
    const previousWeekStartDate = addWeeksToDateString(viewedWeekStartDate, -1);
    setSetupWeekStartDate(previousWeekStartDate);
    await loadPlanForWeek(previousWeekStartDate);
  }

  async function handleNextWeek() {
    const nextWeekStartDate = addWeeksToDateString(viewedWeekStartDate, 1);
    setSetupWeekStartDate(nextWeekStartDate);
    await loadPlanForWeek(nextWeekStartDate);
  }

  function handleNewPlan() {
    const targetWeekStartDate = currentPlan?.weekStartDate ?? getCurrentWeekMonday();
    setSetupWeekStartDate(targetWeekStartDate);
    resetToSetup();
    setSavedSlotKeys(new Set());
    setSavingSlotKeys(new Set());
  }

  async function handleDeletePlan() {
    if (!currentPlan || !user) return;
    if (!confirm('Sei sicuro di voler eliminare questo piano pasti?')) return;

    try {
      await deleteMealPlan(currentPlan.id);

      const currentWeekStartDate = getCurrentWeekMonday();
      setSetupWeekStartDate(currentWeekStartDate);
      setSavedSlotKeys(new Set());
      setSavingSlotKeys(new Set());
      await loadPlanForWeek(currentWeekStartDate);
      await refreshSavedPlans(user.uid);
      toast.success('Piano eliminato');
    } catch (err) {
      console.error('Errore nell\'eliminazione del piano:', err);
      toast.error('Errore nell\'eliminazione del piano');
    }
  }

  async function handleOpenSavedPlan(weekStartDate: string) {
    setSetupWeekStartDate(weekStartDate);
    await loadPlanForWeek(weekStartDate);
  }

  async function handleConfirmRegenerate(notesOverride?: string) {
    if (!regenerateTarget) return;

    const target = regenerateTarget;
    const notes = notesOverride ?? regenerateNotes;
    setRegenerateTarget(null);
    setRegenerateNotes('');

    try {
      await regenerateSlot(
        target.dayIndex,
        target.mealType,
        recipes,
        categories,
        notes
      );
      if (notes.trim()) {
        toast.success('Slot rigenerato tenendo conto della tua richiesta');
      }
    } catch (err: unknown) {
      console.error('Errore nella rigenerazione dello slot:', err);
      toast.error(
        err instanceof Error
          ? err.message
          : 'Errore nella rigenerazione dello slot'
      );
    }
  }

  // ── New AI recipes (slots with newRecipe) ─────────────────
  const newRecipeSlots = currentPlan?.slots.filter(s => s.newRecipe !== null) ?? [];

  // ── Picker: find the current slot for the picker target ──
  const pickerCurrentSlot = pickerTarget
    ? currentPlan?.slots.find(
        s => s.dayIndex === pickerTarget.dayIndex && s.mealType === pickerTarget.mealType
      )
    : undefined;
  const regenerateCurrentSlot = regenerateTarget
    ? currentPlan?.slots.find(
        s => s.dayIndex === regenerateTarget.dayIndex && s.mealType === regenerateTarget.mealType
      )
    : undefined;

  // ── Render ────────────────────────────────────────────────

  if (!user || categoriesLoading) {
    return null;
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Page title */}
      <div>
        <h1 className="font-display text-4xl font-semibold italic">Pianificatore pasti</h1>
      </div>

      {(step === 'setup' || (step === 'calendar' && currentPlan)) && (
        <PlannerHeader
          weekStartDate={viewedWeekStartDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onNewPlan={handleNewPlan}
          onDeletePlan={handleDeletePlan}
          hasPlan={currentPlan !== null}
          isGenerating={isGenerating}
        />
      )}

      {/* ── STEP: SETUP ──────────────────────────────── */}
      {step === 'setup' && (
        <div className="max-w-lg mx-auto space-y-6">
          {savedPlans.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Piani già salvati</p>
                <p className="text-xs text-muted-foreground">
                  Apri una settimana esistente senza uscire dalla creazione del nuovo piano.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedPlans.map(plan => (
                  <Button
                    key={plan.id}
                    type="button"
                    variant={plan.weekStartDate === viewedWeekStartDate ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleOpenSavedPlan(plan.weekStartDate)}
                    className="h-8"
                  >
                    {formatWeekChipLabel(plan.weekStartDate)}
                  </Button>
                ))}
              </div>
            </div>
          )}

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
                <span><span className="font-medium text-foreground">Salva le ricette nuove</span> — le ricette generate dall'AI restano evidenziate nella griglia: salvale nel ricettario con un click.</span>
              </li>
            </ul>
          </div>

          <MealPlanSetupForm
            categories={categories}
            onGenerateWithAI={async (config: MealPlanSetupConfig) => {
              const validationError = validateFamilyContextUsage(useFamilyContext, familyProfile);
              if (validationError) {
                toast.error(validationError);
                return;
              }

              await generatePlan(config, recipes, categories, {
                useFamilyContext,
                familyProfile,
              });
            }}
            onCreateManual={(config: MealPlanSetupConfig) => createManualPlan(config)}
            isLoading={isGenerating}
            isTestAccount={isTestAccount}
            initialWeekStartDate={setupWeekStartDate}
            useFamilyContext={useFamilyContext}
            onUseFamilyContextChange={setUseFamilyContext}
            hasValidFamilyProfile={hasValidProfile}
          />
          <StatusBanner
            icon={<CalendarDays className="h-4 w-4" />}
            title={hasValidProfile ? 'Profilo famiglia pronto' : 'Profilo famiglia non ancora configurato'}
            description={
              hasValidProfile
                ? 'Puoi usarlo per dare al piano AI un contesto piu\' aderente alle abitudini di casa.'
                : 'Configuralo prima di usare il contesto famiglia nella generazione AI di questa settimana.'
            }
            tone={hasValidProfile ? 'success' : 'warning'}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/profilo-famiglia">Gestisci profilo</Link>
              </Button>
            }
          />
        </div>
      )}

      {/* ── STEP: GENERATING ─────────────────────────── */}
      {step === 'generating' && (
        <div className="flex min-h-[50vh] items-center justify-center px-4">
          <EditorialLoader
            label="L'AI sta pianificando la tua settimana"
            hint="Bilancio stagione, portate e nuove idee, poi compongo una settimana che resti credibile in cucina."
            tone="anticipation"
          />
        </div>
      )}

      {/* ── STEP: CALENDAR ───────────────────────────── */}
      {step === 'calendar' && currentPlan && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Giorni inclusi nel piano</p>
                <p className="text-xs text-muted-foreground">
                  Se hai attivato un giorno per errore, puoi rimuoverlo qui senza rifare l'intera settimana.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeDays.map((dayIndex) => (
                  <button
                    key={dayIndex}
                    type="button"
                    onClick={async () => {
                      try {
                        await removeDay(dayIndex);
                        toast.success(`Ho rimosso ${DAY_CHIPS[dayIndex]} dal piano`);
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : 'Errore nella rimozione del giorno'
                        );
                      }
                    }}
                    disabled={activeDays.length === 1 || isGenerating}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                    title={
                      activeDays.length === 1
                        ? 'Il piano deve mantenere almeno un giorno attivo'
                        : `Rimuovi ${DAY_CHIPS[dayIndex]}`
                    }
                    aria-label={`Rimuovi ${DAY_CHIPS[dayIndex]} dal piano`}
                  >
                    <span>{DAY_CHIPS[dayIndex]}</span>
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          </div>

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
            onRegenerateSlot={handleOpenRegenerateDialog}
            regeneratingSlots={regeneratingSlots}
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
          onSelect={handleSlotSelect}
          onClear={handleSlotClear}
        />
      )}

      <Dialog
        open={regenerateTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRegenerateTarget(null);
            setRegenerateNotes('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vuoi dare un&apos;indicazione all&apos;AI?</DialogTitle>
            <DialogDescription>
              Puoi rigenerare subito lo slot oppure aggiungere una richiesta specifica, ad esempio ingredienti da evitare o stile del piatto.
            </DialogDescription>
          </DialogHeader>
          {regenerateCurrentSlot?.recipeTitle ? (
            <div className="rounded-lg border border-border bg-muted/25 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Ricetta attuale
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {regenerateCurrentSlot.recipeTitle}
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <label htmlFor="planner-regenerate-notes" className="text-sm font-medium text-foreground">
              Richiesta opzionale
            </label>
            <textarea
              id="planner-regenerate-notes"
              value={regenerateNotes}
              onChange={(e) => setRegenerateNotes(e.target.value.slice(0, 220))}
              placeholder="Es: non suggerirmi ricette con asparagi"
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Lascia vuoto se vuoi solo una nuova proposta per questo slot.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRegenerateTarget(null);
                setRegenerateNotes('');
              }}
            >
              Annulla
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                handleConfirmRegenerate('');
              }}
              disabled={!regenerateTarget || (regenerateTarget ? regeneratingSlots.has(`${regenerateTarget.dayIndex}-${regenerateTarget.mealType}`) : false)}
            >
              Rigenera senza note
            </Button>
            <Button
              type="button"
              onClick={() => {
                handleConfirmRegenerate();
              }}
              disabled={!regenerateTarget || (regenerateTarget ? regeneratingSlots.has(`${regenerateTarget.dayIndex}-${regenerateTarget.mealType}`) : false)}
            >
              Invia nota e rigenera
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function formatWeekChipLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'short' })}`;
}
