'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { useRecipes } from '@/lib/hooks/useRecipes';
import { useMealPlanner } from '@/lib/hooks/useMealPlanner';
import { useFamilyProfile } from '@/lib/hooks/useFamilyProfile';
import { resolvePlannerMembers } from '@/lib/utils/planner-members';
import { MealPlanSetupForm } from '@/components/meal-planner/MealPlanSetupForm';
import { WeeklyCalendarGrid } from '@/components/meal-planner/WeeklyCalendarGrid';
import { PlannerHeader } from '@/components/meal-planner/PlannerHeader';
import { MealSlotEditorSheet } from '@/components/meal-planner/MealSlotEditorSheet';
import { NewRecipeReviewCard } from '@/components/meal-planner/NewRecipeReviewCard';
import { PlanStructureCard } from '@/components/meal-planner/PlanStructureCard';
import { getUserCategories } from '@/lib/firebase/categories';
import { deleteMealPlan, getMealPlanByWeek, getUserMealPlans } from '@/lib/firebase/meal-plans';
import { Button } from '@/components/ui/button';
import { Category, MealPlan, MealPlanSetupConfig, MealSlot, MealSlotVariant, MealType, Season } from '@/types';
import { addWeeksToDateString, getCurrentWeekMonday, getWeekMonday } from '@/lib/constants/seasons';
import { MEAL_LABELS } from '@/lib/constants/meal-types';
import { CalendarDays, Shuffle, PenLine, MousePointerClick, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import { EditorialEmptyState } from '@/components/ui/editorial-empty-state';
import { StatusBanner } from '@/components/ui/status-banner';

/**
 * Meal Planner Page
 *
 * UX FLOW:
 * 1. SETUP: a week without a plan opens on an empty state (with the saved weeks one
 *    tap away), followed by MealPlanSetupForm — days, meals, people, shuffle rules.
 * 2. CALENDAR: WeeklyCalendarGrid — the grid is the page; the plan structure sits in a
 *    collapsed panel above it. Each cell opens MealSlotEditorSheet (base recipe,
 *    people, per-member variants). Plans are built locally by shuffling the user's own
 *    recipes (no AI) or filled in manually.
 *
 * ON MOUNT:
 * Loads the plan for the current week from Firebase. If no plan exists yet for
 * that week, the page stays on setup with the week already preselected.
 */
export default function PianificatorePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { recipes } = useRecipes();
  const {
    step,
    currentPlan,
    isGenerating,
    error: plannerError,
    generateShuffledPlan,
    createManualPlan,
    copyPlanToWeek,
    updateSlot,
    clearSlot,
    saveNewRecipeToCookbook,
    reshuffleSlot,
    setSlotServings,
    setSlotVariants,
    defaultServingsPlanned,
    removeDay,
    addDay,
    addMealType,
    removeMealType,
    regeneratingSlots,
    resetToSetup,
    loadPlan,
    loadPlanForWeek,
  } = useMealPlanner();

  // Family members with labels already resolved ("Componente N" fallback). Shares the
  // ['familyProfile', uid] query with useMealPlanner, so this costs no extra read.
  const { familyProfile } = useFamilyProfile();
  const members = useMemo(() => resolvePlannerMembers(familyProfile), [familyProfile]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [setupWeekStartDate, setSetupWeekStartDate] = useState(getCurrentWeekMonday());
  const [savedPlans, setSavedPlans] = useState<MealPlan[]>([]);
  const [showAllSavedPlans, setShowAllSavedPlans] = useState(false);

  // Slot editor sheet state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTarget, setEditorTarget] = useState<{ dayIndex: number; mealType: MealType } | null>(null);

  // Copy-plan dialog state
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  // Delete-plan confirmation state
  const [deletePlanDialogOpen, setDeletePlanDialogOpen] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);

  // AI-generated recipe save states
  const [savingSlotKeys, setSavingSlotKeys] = useState<Set<string>>(new Set());
  const [savedSlotKeys, setSavedSlotKeys] = useState<Set<string>>(new Set());
  // Tracks which review cards should be force-opened (triggered from the grid cell button)
  const [expandedSlotKeys, setExpandedSlotKeys] = useState<Set<string>>(new Set());

  const viewedWeekStartDate = currentPlan?.weekStartDate ?? setupWeekStartDate;
  const isCurrentWeek = viewedWeekStartDate === getCurrentWeekMonday();
  // "Nuovo piano" on a week that already has one also lands on setup: the empty state
  // would then be lying, so that case gets its own banner instead.
  const viewedWeekHasSavedPlan = savedPlans.some(plan => plan.weekStartDate === viewedWeekStartDate);
  const visibleSavedPlans = showAllSavedPlans ? savedPlans : savedPlans.slice(0, MAX_SAVED_PLAN_CHIPS);
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

  // ── Slot editor ──────────────────────────────────────────
  function handleSlotClick(dayIndex: number, mealType: MealType) {
    setEditorTarget({ dayIndex, mealType });
    setEditorOpen(true);
  }

  async function handleReshuffleSlot(dayIndex: number, mealType: MealType) {
    try {
      await reshuffleSlot(dayIndex, mealType, recipes);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Errore nel rimescolare lo slot'
      );
    }
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

  const handleSlotServings = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    servingsPlanned: number
  ) => {
    try {
      await setSlotServings(dayIndex, mealType, servingsPlanned);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio delle persone');
    }
  }, [setSlotServings]);

  const handleSlotVariants = useCallback(async (
    dayIndex: number,
    mealType: MealType,
    variants: MealSlotVariant[]
  ) => {
    try {
      await setSlotVariants(dayIndex, mealType, variants);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Errore nel salvataggio delle varianti');
    }
  }, [setSlotVariants]);

  // ── Plan structure (days and meal types) ──────────────────
  // Each handler surfaces the hook's guard messages ("almeno un giorno attivo",
  // "almeno una portata") as toasts instead of letting them reject silently.
  async function handleRemoveDay(dayIndex: number) {
    try {
      await removeDay(dayIndex);
      toast.success(`Ho rimosso ${DAY_CHIPS[dayIndex]} dal piano`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Errore nella rimozione del giorno'
      );
    }
  }

  async function handleAddDay(dayIndex: number) {
    try {
      await addDay(dayIndex);
      toast.success(`Ho aggiunto ${DAY_CHIPS[dayIndex]} al piano`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Errore nell\'aggiunta del giorno'
      );
    }
  }

  async function handleAddMealType(mealType: MealType, autofill: boolean) {
    try {
      await addMealType(mealType, recipes, { autofill });
      toast.success(
        autofill
          ? `Ho aggiunto ${MEAL_LABELS[mealType].toLowerCase()} e riempito gli slot`
          : `Ho aggiunto ${MEAL_LABELS[mealType].toLowerCase()} al piano`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Errore nell\'aggiunta della portata'
      );
    }
  }

  async function handleRemoveMealType(mealType: MealType) {
    try {
      await removeMealType(mealType);
      toast.success(`Ho rimosso ${MEAL_LABELS[mealType].toLowerCase()} dal piano`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Errore nella rimozione della portata'
      );
    }
  }

  // ── Save new AI recipe ────────────────────────────────────
  function slotKey(slot: MealSlot): string {
    return `${slot.dayIndex}-${slot.mealType}`;
  }

  async function handleSaveNewRecipe(slot: MealSlot, categoryNames: string[], seasons: Season[]) {
    const key = slotKey(slot);
    setSavingSlotKeys(prev => new Set(prev).add(key));

    try {
      await saveNewRecipeToCookbook(slot, categoryNames, seasons);
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

  async function handleGoToToday() {
    const currentWeekStartDate = getCurrentWeekMonday();
    setSetupWeekStartDate(currentWeekStartDate);
    await loadPlanForWeek(currentWeekStartDate);
  }

  function handleNewPlan() {
    const targetWeekStartDate = currentPlan?.weekStartDate ?? getCurrentWeekMonday();
    setSetupWeekStartDate(targetWeekStartDate);
    resetToSetup();
    setSavedSlotKeys(new Set());
    setSavingSlotKeys(new Set());
  }

  function handleDeletePlan() {
    if (!currentPlan || !user) return;
    setDeletePlanDialogOpen(true);
  }

  async function handleConfirmDeletePlan() {
    if (!currentPlan || !user) return;
    setIsDeletingPlan(true);

    try {
      await deleteMealPlan(currentPlan.id);

      // The shopping list derives from this plan, so its cache is now describing a
      // document that no longer exists (see invalidateShoppingList in useMealPlanner).
      queryClient.invalidateQueries({ queryKey: ['shoppingList', user.uid] });

      const currentWeekStartDate = getCurrentWeekMonday();
      setSetupWeekStartDate(currentWeekStartDate);
      setSavedSlotKeys(new Set());
      setSavingSlotKeys(new Set());
      await loadPlanForWeek(currentWeekStartDate);
      await refreshSavedPlans(user.uid);
      setDeletePlanDialogOpen(false);
      toast.success('Piano eliminato');
    } catch (err) {
      console.error('Errore nell\'eliminazione del piano:', err);
      toast.error('Errore nell\'eliminazione del piano');
    } finally {
      setIsDeletingPlan(false);
    }
  }

  async function handleOpenSavedPlan(weekStartDate: string) {
    setSetupWeekStartDate(weekStartDate);
    await loadPlanForWeek(weekStartDate);
  }

  function handleOpenCopyDialog() {
    // Default the target to the week after the one currently viewed.
    setCopyTargetDate(addWeeksToDateString(viewedWeekStartDate, 1));
    setCopyDialogOpen(true);
  }

  async function handleConfirmCopy() {
    if (!user || !copyTargetDate) return;

    // Plans are week-aligned, so snap the chosen date to its Monday.
    const targetWeek = getWeekMonday(new Date(copyTargetDate + 'T00:00:00'));
    setIsCopying(true);

    try {
      await copyPlanToWeek(targetWeek);
      setCopyDialogOpen(false);
      setSetupWeekStartDate(targetWeek);
      await loadPlanForWeek(targetWeek);
      await refreshSavedPlans(user.uid);
      toast.success('Piano copiato nella settimana selezionata');
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Errore nella copia del piano'
      );
    } finally {
      setIsCopying(false);
    }
  }

  // ── New AI recipes (slots with newRecipe) ─────────────────
  const newRecipeSlots = currentPlan?.slots.filter(s => s.newRecipe !== null) ?? [];

  // ── Editor: the slot behind the editor target (undefined = empty cell) ──
  const editorCurrentSlot = editorTarget
    ? currentPlan?.slots.find(
        s => s.dayIndex === editorTarget.dayIndex && s.mealType === editorTarget.mealType
      )
    : undefined;

  // ── Render ────────────────────────────────────────────────

  if (!user || categoriesLoading) {
    return null;
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {(step === 'setup' || (step === 'calendar' && currentPlan)) && (
        <PlannerHeader
          weekStartDate={viewedWeekStartDate}
          onPrevWeek={handlePrevWeek}
          onNextWeek={handleNextWeek}
          onGoToToday={handleGoToToday}
          isCurrentWeek={isCurrentWeek}
          onNewPlan={handleNewPlan}
          onDeletePlan={handleDeletePlan}
          onCopyPlan={handleOpenCopyDialog}
          hasPlan={currentPlan !== null}
          isGenerating={isGenerating}
        />
      )}

      {/* ── STEP: SETUP ──────────────────────────────── */}
      {step === 'setup' && (
        <div className="max-w-lg mx-auto space-y-4">
          {viewedWeekHasSavedPlan ? (
            <StatusBanner
              tone="info"
              icon={<CalendarDays className="h-5 w-5" />}
              title="Questa settimana ha già un piano"
              description="Puoi riaprirlo, oppure crearne uno nuovo qui sotto."
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 lg:h-9"
                  onClick={() => handleOpenSavedPlan(viewedWeekStartDate)}
                >
                  Apri il piano
                </Button>
              }
            />
          ) : (
            <EditorialEmptyState
              className="py-8 lg:py-10"
              icon={<CalendarDays className="h-5 w-5" />}
              title="Nessun piano per questa settimana"
              description="Genera una proposta dal tuo ricettario o parti da una griglia vuota."
            />
          )}

          {savedPlans.length > 0 && (
            <section aria-labelledby="saved-plans-heading" className="space-y-2">
              <h2 id="saved-plans-heading" className="text-sm font-semibold text-foreground font-sans">
                Piani già salvati
              </h2>
              <div className="flex flex-wrap gap-2">
                {visibleSavedPlans.map(plan => (
                  <Button
                    key={plan.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenSavedPlan(plan.weekStartDate)}
                    className="h-11 lg:h-9 tabular-nums"
                  >
                    {formatWeekChipLabel(plan.weekStartDate)}
                  </Button>
                ))}
                {savedPlans.length > MAX_SAVED_PLAN_CHIPS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllSavedPlans(showAll => !showAll)}
                    className="h-11 lg:h-9 text-muted-foreground"
                  >
                    {showAllSavedPlans ? 'Mostra meno' : `Mostra tutti (${savedPlans.length})`}
                  </Button>
                )}
              </div>
            </section>
          )}

          <MealPlanSetupForm
            categories={categories}
            onGenerate={async (config: MealPlanSetupConfig) => {
              const unfilledMealTypes = await generateShuffledPlan(config, recipes);
              if (unfilledMealTypes.length > 0) {
                toast('Alcuni pasti sono rimasti vuoti: non avevi ricette adatte. Riempili a mano.', {
                  icon: 'ℹ️',
                });
              }
            }}
            onCreateManual={(config: MealPlanSetupConfig) => createManualPlan(config)}
            isLoading={isGenerating}
            initialWeekStartDate={setupWeekStartDate}
            defaultServingsPlanned={defaultServingsPlanned}
          />

          <DisclosurePanel title="Come funziona?" variant="plain">
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Shuffle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <span><span className="font-medium text-foreground">Genera (shuffle)</span> — compongo la settimana pescando dal tuo ricettario in base a stagione e categorie preferite.</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <PenLine className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <span><span className="font-medium text-foreground">Crea manuale</span> — parte da una griglia vuota: riempi tu ogni slot cliccandoci sopra.</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <MousePointerClick className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                <span><span className="font-medium text-foreground">Modifica quando vuoi</span> — clicca uno slot per cambiare ricetta, persone e varianti, o usa il tasto rimescola per una proposta diversa.</span>
              </li>
            </ul>
          </DisclosurePanel>
        </div>
      )}

      {/* ── STEP: CALENDAR ───────────────────────────── */}
      {step === 'calendar' && currentPlan && (
        <div className="space-y-4">
          <PlanStructureCard
            activeDays={activeDays}
            activeMealTypes={currentPlan.activeMealTypes}
            hasRecipes={recipes.length > 0}
            disabled={isGenerating}
            onAddDay={handleAddDay}
            onRemoveDay={handleRemoveDay}
            onAddMealType={handleAddMealType}
            onRemoveMealType={handleRemoveMealType}
          />

          {/* A freshly created manual plan is an empty grid: say what a cell does. */}
          {currentPlan.slots.length === 0 && (
            <StatusBanner
              tone="info"
              icon={<MousePointerClick className="h-5 w-5" />}
              title="Il piano è vuoto"
              description={
                <>
                  Tocca una cella per scegliere la ricetta. Con{' '}
                  <RefreshCw className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Rimescola" /> ti
                  propongo un&apos;alternativa dal ricettario.
                </>
              }
            />
          )}

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
            onRegenerateSlot={handleReshuffleSlot}
            regeneratingSlots={regeneratingSlots}
            weekStartDate={currentPlan.weekStartDate}
            members={members}
          />

          {/* AI-generated recipes to review and optionally save */}
          {newRecipeSlots.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="font-display text-lg italic text-foreground">
                Ricette da rivedere
                <span className="ml-2 font-sans text-xs not-italic font-normal text-muted-foreground">
                  generate in un piano precedente — salvale nel ricettario quando vuoi
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

      {/* Slot editor sheet (rendered outside the grid to avoid portal issues) */}
      {editorTarget && currentPlan && (
        <MealSlotEditorSheet
          open={editorOpen}
          onOpenChange={setEditorOpen}
          dayIndex={editorTarget.dayIndex}
          mealType={editorTarget.mealType}
          recipes={recipes}
          categories={categories}
          currentSlot={editorCurrentSlot}
          members={members}
          defaultServingsPlanned={defaultServingsPlanned}
          onSelectBase={handleSlotSelect}
          onClear={handleSlotClear}
          onSetServings={handleSlotServings}
          onSetVariants={handleSlotVariants}
        />
      )}

      <Dialog
        open={copyDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isCopying) setCopyDialogOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copia il piano in un&apos;altra settimana</DialogTitle>
            <DialogDescription>
              Uso il lunedì della settimana che indichi. Se quella settimana ha già un piano, non lo sovrascrivo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="planner-copy-week" className="text-sm font-medium text-foreground">
              Settimana di destinazione
            </label>
            <input
              id="planner-copy-week"
              type="date"
              value={copyTargetDate}
              onChange={(e) => setCopyTargetDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              La copia include solo le ricette del piano, non la lista della spesa.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCopyDialogOpen(false)}
              disabled={isCopying}
            >
              Annulla
            </Button>
            <Button
              type="button"
              onClick={handleConfirmCopy}
              disabled={isCopying || !copyTargetDate}
            >
              Copia piano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletePlanDialogOpen}
        onOpenChange={setDeletePlanDialogOpen}
        title="Eliminare questo piano pasti?"
        description="Il piano della settimana verrà rimosso. Le cotture già concluse restano nello storico."
        confirmLabel="Elimina piano"
        isConfirming={isDeletingPlan}
        onConfirm={handleConfirmDeletePlan}
      />
    </div>
  );
}

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

// Saved-week chips shown before "Mostra tutti": a year of plans would bury the setup.
const MAX_SAVED_PLAN_CHIPS = 8;

function formatWeekChipLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'short' })}`;
}
