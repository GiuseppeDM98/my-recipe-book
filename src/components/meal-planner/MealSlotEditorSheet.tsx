'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Plus, TriangleAlert, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { StatusBanner } from '@/components/ui/status-banner';
import { ServingsStepper } from '@/components/recipe/servings-stepper';
import { RecipePickerPanel } from './RecipePickerPanel';
import { Category, MealSlot, MealSlotVariant, MealType, Recipe } from '@/types';
import { MEAL_LABELS } from '@/lib/constants/meal-types';
import {
  MAX_SERVINGS_PLANNED,
  MIN_SERVINGS_PLANNED,
  PlannerMember,
  REMOVED_MEMBER_LABEL,
  findMemberLabel,
} from '@/lib/utils/planner-members';
import { cn } from '@/lib/utils/cn';

interface MealSlotEditorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayIndex: number;
  mealType: MealType;
  recipes: Recipe[];
  categories: Category[];
  /** undefined = empty cell. The sheet derives everything it shows from this prop. */
  currentSlot: MealSlot | undefined;
  /** Family members with resolved labels; [] = no family profile (variants disabled). */
  members: PlannerMember[];
  defaultServingsPlanned: number;
  onSelectBase: (dayIndex: number, mealType: MealType, recipeId: string, title: string) => void;
  onClear: (dayIndex: number, mealType: MealType) => void;
  onSetServings: (dayIndex: number, mealType: MealType, servingsPlanned: number) => void;
  onSetVariants: (dayIndex: number, mealType: MealType, variants: MealSlotVariant[]) => void;
}

type EditorView = 'main' | 'pick-base' | 'variant-members' | 'variant-recipe';

/** The variant being created (`id: null`) or edited, while the user walks the two steps. */
interface VariantDraft {
  id: string | null;
  memberIds: string[];
}

const DAY_LABELS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

const SERVINGS_DEBOUNCE_MS = 600;

const PEOPLE_STEPPER_LABELS = {
  decrease: 'Riduci persone',
  increase: 'Aumenta persone',
  input: 'Numero di persone',
};

function personWord(count: number): string {
  return count === 1 ? 'persona' : 'persone';
}

/**
 * Editor of a single meal: base recipe, people, per-member variants.
 *
 * WHY A SHEET THAT STAYS OPEN (the old picker closed on the first tap):
 * A slot now has three persistent concerns and the user often sets several in a row
 * ("pasta for 4, but Sofia has the minestrone"). Every commit writes through the
 * planner mutations immediately and returns to the main view instead of closing.
 *
 * STATE: the recipe, people and variants shown always come from `currentSlot` — no local
 * copies that could drift from the plan. Local state is only the current view, the
 * variant being composed, and the people stepper's draft.
 *
 * LEGACY INVARIANT: a slot with `servingsPlanned == null` does not scale the shopping
 * list. Opening and closing this sheet must not change that, so the people value is
 * written ONLY after an explicit action (±, typing, or "Conferma") — never on mount.
 *
 * PEOPLE DEBOUNCE: ± taps are coalesced into one write. The pending value is flushed
 * on close, on unmount and before any other commit from this sheet, always reading the
 * latest value and callback from refs (no stale closure) — same failure mode as the
 * shopping list's lost check marks when a debounce is cancelled instead of flushed.
 */
export function MealSlotEditorSheet({
  open,
  onOpenChange,
  dayIndex,
  mealType,
  recipes,
  categories,
  currentSlot,
  members,
  defaultServingsPlanned,
  onSelectBase,
  onClear,
  onSetServings,
  onSetVariants,
}: MealSlotEditorSheetProps) {
  const [view, setView] = useState<EditorView>('main');
  const [variantDraft, setVariantDraft] = useState<VariantDraft>({ id: null, memberIds: [] });

  const hasBase = Boolean(currentSlot && (currentSlot.existingRecipeId || currentSlot.newRecipe));
  const isLegacySlot = hasBase && currentSlot?.servingsPlanned == null;
  const variants = currentSlot?.variants ?? [];
  const persistedServings = currentSlot?.servingsPlanned ?? defaultServingsPlanned;

  // ── People stepper: draft + debounced, flushable write ────────────────────
  const [servingsDraft, setServingsDraft] = useState(persistedServings);
  // true once the user has acted on the people control in this opening of the sheet.
  // Drives the legacy hint: a ref can't, reading it during render would not re-render.
  const [hasTouchedServings, setHasTouchedServings] = useState(false);
  const pendingServingsRef = useRef<{ dayIndex: number; mealType: MealType; value: number } | null>(null);
  const servingsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSetServingsRef = useRef(onSetServings);
  useEffect(() => {
    onSetServingsRef.current = onSetServings;
  }, [onSetServings]);

  // Follow the plan (useState(prop) would not), but not while a local change is still
  // waiting to be written: the prop is older than the draft in that window.
  useEffect(() => {
    if (pendingServingsRef.current === null) setServingsDraft(persistedServings);
  }, [persistedServings, dayIndex, mealType]);

  const clearServingsTimer = useCallback(() => {
    if (servingsTimerRef.current !== null) {
      clearTimeout(servingsTimerRef.current);
      servingsTimerRef.current = null;
    }
  }, []);

  const flushServings = useCallback(() => {
    clearServingsTimer();
    const pending = pendingServingsRef.current;
    if (!pending) return;
    pendingServingsRef.current = null;
    onSetServingsRef.current(pending.dayIndex, pending.mealType, pending.value);
  }, [clearServingsTimer]);

  const discardPendingServings = useCallback(() => {
    clearServingsTimer();
    pendingServingsRef.current = null;
  }, [clearServingsTimer]);

  useEffect(() => flushServings, [flushServings]);

  function handleServingsChange(next: number) {
    // The stepper re-emits the current value on blur: not a user decision, and on a
    // legacy slot persisting it would start scaling a list the user never touched.
    if (next === servingsDraft) return;

    setServingsDraft(next);
    setHasTouchedServings(true);
    pendingServingsRef.current = { dayIndex, mealType, value: next };
    clearServingsTimer();
    servingsTimerRef.current = setTimeout(flushServings, SERVINGS_DEBOUNCE_MS);
  }

  /** Legacy slot whose default is already right: activate scaling without changing the number. */
  function handleConfirmServings() {
    setHasTouchedServings(true);
    pendingServingsRef.current = { dayIndex, mealType, value: servingsDraft };
    flushServings();
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setView('main');
      setVariantDraft({ id: null, memberIds: [] });
      setHasTouchedServings(false);
    }
  }, [open, dayIndex, mealType]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) flushServings();
    onOpenChange(nextOpen);
  }

  // ── Commits ───────────────────────────────────────────────────────────────
  function handlePickBase(recipe: Recipe) {
    flushServings();
    onSelectBase(dayIndex, mealType, recipe.id, recipe.title);
    setView('main');
  }

  function handleClear() {
    // The slot is going away: a pending people value has nothing left to land on.
    discardPendingServings();
    onClear(dayIndex, mealType);
    onOpenChange(false);
  }

  function handlePickVariantRecipe(recipe: Recipe) {
    flushServings();

    const committed: MealSlotVariant = {
      id: variantDraft.id ?? crypto.randomUUID(),
      memberIds: variantDraft.memberIds,
      existingRecipeId: recipe.id,
      recipeTitle: recipe.title,
    };
    const nextVariants = variantDraft.id
      ? variants.map(variant => (variant.id === variantDraft.id ? committed : variant))
      : [...variants, committed];

    onSetVariants(dayIndex, mealType, nextVariants);
    setView('main');
  }

  function handleRemoveVariant(variantId: string) {
    flushServings();
    onSetVariants(dayIndex, mealType, variants.filter(variant => variant.id !== variantId));
  }

  function startVariant(variant?: MealSlotVariant) {
    setVariantDraft(
      variant
        ? // Members who left the profile can't be re-selected: editing drops them.
          { id: variant.id, memberIds: variant.memberIds.filter(id => findMemberLabel(id, members) !== null) }
        : { id: null, memberIds: [] }
    );
    setView('variant-members');
  }

  function toggleDraftMember(memberId: string) {
    setVariantDraft(draft => ({
      ...draft,
      memberIds: draft.memberIds.includes(memberId)
        ? draft.memberIds.filter(id => id !== memberId)
        : [...draft.memberIds, memberId],
    }));
  }

  // ── Derived wording ───────────────────────────────────────────────────────
  // Members already eating another variant: one person can't have two dinners.
  const memberIdsCoveredElsewhere = new Set(
    variants.filter(variant => variant.id !== variantDraft.id).flatMap(variant => variant.memberIds)
  );
  const allMembersCovered =
    members.length > 0 &&
    members.every(member => variants.some(variant => variant.memberIds.includes(member.id)));

  const variantPersons = variants.reduce((sum, variant) => sum + variant.memberIds.length, 0);
  const basePersons = servingsDraft - variantPersons;

  const showLegacyHint = isLegacySlot && !hasTouchedServings;

  // Same dish as the base meal would not be a variant. Memoized: the picker filters on it.
  const baseRecipeId = currentSlot?.existingRecipeId ?? null;
  const variantExcludedRecipeIds = useMemo(
    () => (baseRecipeId ? [baseRecipeId] : undefined),
    [baseRecipeId]
  );

  const title = `${DAY_LABELS[dayIndex]} — ${MEAL_LABELS[mealType]}`;
  const editedVariant = variantDraft.id ? variants.find(v => v.id === variantDraft.id) : undefined;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'h-[85vh] flex flex-col gap-0 max-lg:portrait:rounded-t-xl',
          // Desktop: a centered modal. A full-width bottom sheet on a 1440px+ screen
          // stretches the recipe list into unreadably long rows.
          'lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[560px] lg:rounded-2xl lg:border',
          'lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2 lg:h-[min(85vh,760px)]'
        )}
      >
        <SheetHeader className="shrink-0 pr-8">
          {view !== 'main' && (
            <button
              type="button"
              onClick={() => setView(view === 'variant-recipe' ? 'variant-members' : 'main')}
              className="-ml-2 mb-1 inline-flex h-9 w-fit items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="h-4 w-4" />
              Indietro
            </button>
          )}
          <SheetTitle className="text-left font-display text-xl font-semibold italic">
            {view === 'main' && title}
            {view === 'pick-base' && 'Scegli la ricetta base'}
            {view === 'variant-members' && 'Per chi?'}
            {view === 'variant-recipe' && 'Quale ricetta?'}
          </SheetTitle>
          <SheetDescription className={cn('text-left', view === 'main' && 'sr-only')}>
            {view === 'main' && 'Ricetta base, persone e varianti di questo pasto'}
            {view === 'pick-base' && title}
            {view === 'variant-members' && 'Scegli chi mangia un piatto diverso dal pasto base.'}
            {view === 'variant-recipe' &&
              `Variante per ${variantDraft.memberIds
                .map(id => findMemberLabel(id, members) ?? REMOVED_MEMBER_LABEL)
                .join(', ')}`}
          </SheetDescription>
        </SheetHeader>

        {/* ── MAIN ─────────────────────────────────────────────── */}
        {view === 'main' && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-2">
              {/* Base recipe */}
              <section aria-labelledby="slot-editor-base" className="space-y-2">
                <h3 id="slot-editor-base" className="font-sans text-sm font-semibold text-foreground">
                  Ricetta base
                </h3>
                {hasBase ? (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                        {currentSlot?.recipeTitle}
                      </p>
                      {currentSlot?.existingRecipeId && (
                        <Link
                          href={`/ricette/${currentSlot.existingRecipeId}`}
                          className="mt-0.5 inline-flex min-h-[32px] items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                        >
                          Vai alla ricetta
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 shrink-0 lg:h-9"
                      onClick={() => setView('pick-base')}
                    >
                      Cambia ricetta
                    </Button>
                  </div>
                ) : (
                  <Button type="button" className="h-11 w-full" onClick={() => setView('pick-base')}>
                    Scegli la ricetta base
                  </Button>
                )}
              </section>

              {/* People */}
              <section aria-labelledby="slot-editor-people" className="space-y-2">
                <h3 id="slot-editor-people" className="font-sans text-sm font-semibold text-foreground">
                  Per quante persone?
                </h3>
                <ServingsStepper
                  value={servingsDraft}
                  onChange={handleServingsChange}
                  min={MIN_SERVINGS_PLANNED}
                  max={MAX_SERVINGS_PLANNED}
                  size="md"
                  disabled={!hasBase}
                  labels={PEOPLE_STEPPER_LABELS}
                />
                {!hasBase && (
                  <p className="text-xs text-muted-foreground">Prima scegli la ricetta base.</p>
                )}
                {showLegacyHint && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-xs text-muted-foreground">
                      Quantità non ancora adattate alle persone — conferma per attivare.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-10 lg:h-8"
                      onClick={handleConfirmServings}
                    >
                      Conferma {servingsDraft} {personWord(servingsDraft)}
                    </Button>
                  </div>
                )}
                {hasBase && !showLegacyHint && variantPersons === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Il pasto base copre {servingsDraft} {personWord(servingsDraft)}.
                  </p>
                )}
                {hasBase && variantPersons > 0 && basePersons > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Base per {basePersons} {personWord(basePersons)} · {variantPersons} con variante.
                  </p>
                )}
                {hasBase && variantPersons > 0 && basePersons <= 0 && (
                  <StatusBanner
                    tone="warning"
                    icon={<TriangleAlert className="h-5 w-5" />}
                    title="La ricetta base resta fuori dalla spesa"
                    description="Le varianti coprono tutte le persone: la ricetta base non entrerà nella lista della spesa."
                  />
                )}
              </section>

              {/* Variants */}
              <section aria-labelledby="slot-editor-variants" className="space-y-2">
                <div>
                  <h3 id="slot-editor-variants" className="font-sans text-sm font-semibold text-foreground">
                    Varianti
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Un piatto diverso per uno o più componenti.
                  </p>
                </div>

                {variants.length > 0 && (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {variants.map(variant => {
                      const hasRemovedMember = variant.memberIds.some(
                        id => findMemberLabel(id, members) === null
                      );
                      const recipeMissing =
                        !variant.existingRecipeId || !recipes.some(r => r.id === variant.existingRecipeId);

                      return (
                        <li key={variant.id} className="flex items-start gap-2 p-3">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap gap-1">
                              {variant.memberIds.map(memberId => {
                                const label = findMemberLabel(memberId, members);
                                return (
                                  <span
                                    key={memberId}
                                    title={label ? undefined : 'Questo componente non è più nel profilo famiglia'}
                                    className={cn(
                                      'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium',
                                      label
                                        ? 'bg-secondary text-foreground'
                                        : 'bg-muted text-muted-foreground'
                                    )}
                                  >
                                    {label ?? REMOVED_MEMBER_LABEL}
                                  </span>
                                );
                              })}
                            </div>
                            <p className="text-sm font-medium leading-snug text-foreground line-clamp-2">
                              {variant.recipeTitle ?? 'Ricetta non disponibile'}
                            </p>
                            {(hasRemovedMember || recipeMissing) && (
                              <p className="text-xs text-muted-foreground">
                                {recipeMissing && !hasRemovedMember
                                  ? 'Questa ricetta non è più nel ricettario. '
                                  : ''}
                                Modifica o rimuovi questa variante.
                              </p>
                            )}
                          </div>
                          {members.length > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-10 shrink-0 px-2 text-muted-foreground lg:h-9"
                              onClick={() => startVariant(variant)}
                            >
                              Modifica
                            </Button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(variant.id)}
                            aria-label={`Rimuovi la variante ${variant.recipeTitle ?? ''}`.trim()}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-2 lg:h-10"
                  disabled={!hasBase || members.length === 0 || allMembersCovered}
                  onClick={() => startVariant()}
                >
                  <Plus className="h-4 w-4" />
                  Aggiungi variante
                </Button>
                {hasBase && members.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Per creare varianti aggiungi i componenti nel profilo famiglia.{' '}
                    <Link href="/profilo-famiglia" className="font-medium text-primary underline-offset-4 hover:underline">
                      Vai al profilo famiglia
                    </Link>
                  </p>
                )}
                {hasBase && allMembersCovered && (
                  <p className="text-xs text-muted-foreground">
                    Tutti i componenti hanno già una variante.
                  </p>
                )}
              </section>
            </div>

            {/* Footer */}
            {hasBase && (
              <div className="shrink-0 border-t border-border pt-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClear}
                  className="h-11 w-full gap-2 text-destructive hover:text-destructive lg:h-10"
                >
                  <X className="h-4 w-4" />
                  Svuota slot
                </Button>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  Rimuove ricetta, persone e varianti di questo pasto.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── PICK BASE ────────────────────────────────────────── */}
        {view === 'pick-base' && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <RecipePickerPanel
              recipes={recipes}
              categories={categories}
              selectedRecipeId={currentSlot?.existingRecipeId ?? null}
              onPick={handlePickBase}
            />
          </div>
        )}

        {/* ── VARIANT: MEMBERS ─────────────────────────────────── */}
        {view === 'variant-members' && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {members.map(member => {
                const isCoveredElsewhere = memberIdsCoveredElsewhere.has(member.id);
                const isSelected = variantDraft.memberIds.includes(member.id);

                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isCoveredElsewhere}
                      onClick={() => toggleDraftMember(member.id)}
                      className={cn(
                        'flex min-h-[48px] w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-foreground hover:bg-muted',
                        isCoveredElsewhere && 'cursor-not-allowed opacity-60 hover:bg-background'
                      )}
                    >
                      <span>{member.label}</span>
                      {isCoveredElsewhere && (
                        <span className="text-xs font-normal text-muted-foreground">
                          già coperto da una variante
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex shrink-0 gap-2 border-t border-border pt-3">
              <Button type="button" variant="outline" className="h-11 flex-1 lg:h-10" onClick={() => setView('main')}>
                Annulla
              </Button>
              <Button
                type="button"
                className="h-11 flex-1 lg:h-10"
                disabled={variantDraft.memberIds.length === 0}
                onClick={() => setView('variant-recipe')}
              >
                Continua
              </Button>
            </div>
          </div>
        )}

        {/* ── VARIANT: RECIPE ──────────────────────────────────── */}
        {view === 'variant-recipe' && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <RecipePickerPanel
              recipes={recipes}
              categories={categories}
              selectedRecipeId={editedVariant?.existingRecipeId ?? null}
              excludedRecipeIds={variantExcludedRecipeIds}
              onPick={handlePickVariantRecipe}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
