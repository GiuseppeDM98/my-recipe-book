'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { MealPlan, MealSlot, MealType, Recipe, Category } from '@/types';
import { MEAL_LABELS, sortMealTypes } from '@/lib/constants/meal-types';
import {
  computeWeekNutrition,
  MacroTotals,
  NutrientTotal,
} from '@/lib/utils/meal-plan-calories';
import { PlannerMember } from '@/lib/utils/planner-members';
import { MealSlotCell, isNewRecipeSlot } from './MealSlotCell';
import { cn } from '@/lib/utils/cn';

interface WeeklyCalendarGridProps {
  plan: MealPlan;
  recipes: Recipe[];
  categories: Category[];
  onSlotClick: (dayIndex: number, mealType: MealType) => void;
  onSaveNewRecipe: (slot: MealSlot) => void;
  onRegenerateSlot: (dayIndex: number, mealType: MealType) => void;
  regeneratingSlots: Set<string>;
  weekStartDate: string;
  /** Family members with resolved labels; [] when there is no family profile. */
  members?: PlannerMember[];
}

// Stable reference: a fresh [] default would invalidate the nutrition memo on every render.
const NO_MEMBERS: PlannerMember[] = [];

/** "≈1250" for a complete total, "≥1250" for a floor (some recipe has no estimate). */
function formatCalories(calories: NutrientTotal): string {
  return `${calories.isPartial ? '≥' : '≈'}${calories.total}`;
}

function formatMacros(macros: MacroTotals): string {
  return `${macros.isPartial ? '≥ ' : ''}P ${macros.proteinTotal} · C ${macros.carbsTotal} · G ${macros.fatTotal}`;
}

// "Today" markers: a soft terracotta tint and outline — a stamp, not paint. The date
// next to them stays solid `text-primary`: at /70 it drops below 4.5:1 on cream.
const TODAY_HEADER_CLASSES = 'bg-primary/10 ring-1 ring-primary/40';
const TODAY_CARD_CLASSES = 'border-primary/50 bg-primary/5';

const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const DAY_LABELS_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

/**
 * Weekly meal plan calendar grid.
 *
 * LAYOUT STRATEGY:
 * - Desktop (≥1440px):  CSS grid with 8 columns — label column + 7 day columns.
 *   Shows day names in headers and meal type labels on the left.
 * - Mobile portrait (<1440px portrait): Stacked day cards.
 *   Each card contains the day's name and a row per active meal type.
 *   Horizontal grids would require scroll or tiny cells on narrow screens.
 * - Mobile landscape: Same as desktop grid.
 *
 * NUTRITION IS PER PERSON: the day badge is what ONE person eats on the base path.
 * When a member eats a variant their day differs, so the badge gains a people icon and
 * the alternative totals — in the tooltip on desktop, in an expandable row on mobile
 * portrait, because a hover never fires on touch.
 *
 * SLOT LOOKUP:
 * Finds each slot by (dayIndex, mealType) in O(n) per cell.
 * With max 21 slots this is fast enough without a Map.
 */
export function WeeklyCalendarGrid({
  plan,
  recipes,
  onSlotClick,
  onSaveNewRecipe,
  onRegenerateSlot,
  regeneratingSlots,
  weekStartDate,
  members = NO_MEMBERS,
}: WeeklyCalendarGridProps) {
  const { activeMealTypes, slots } = plan;
  const activeDays = plan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
  const orderedMealTypes = useMemo(() => sortMealTypes(activeMealTypes), [activeMealTypes]);

  const recipesById = useMemo(
    () => new Map(recipes.map(recipe => [recipe.id, recipe])),
    [recipes]
  );

  const nutritionByDay = useMemo(
    () => computeWeekNutrition(plan, recipesById, members),
    [plan, recipesById, members]
  );

  function getSlot(dayIndex: number, mealType: MealType): MealSlot | undefined {
    return slots.find(s => s.dayIndex === dayIndex && s.mealType === mealType);
  }

  // Days whose per-member detail is open (mobile portrait only).
  const [expandedNutritionDays, setExpandedNutritionDays] = useState<Set<number>>(new Set());

  function toggleNutritionDetail(dayIndex: number) {
    setExpandedNutritionDays(prev => {
      const next = new Set(prev);
      if (next.has(dayIndex)) next.delete(dayIndex);
      else next.add(dayIndex);
      return next;
    });
  }

  /**
   * Tooltip of the day's calorie badge: what the number is, why it may be a floor, and
   * the members whose day differs from the base path.
   */
  function describeDayCalories(dayIndex: number): string {
    const day = nutritionByDay.get(dayIndex);
    if (!day) return '';
    const { calories, memberDeltas } = day;

    const base = calories.isPartial
      ? `Almeno ${calories.total} kcal a persona — ${calories.uncountedSlots} ricett${calories.uncountedSlots === 1 ? 'a' : 'e'} senza stima`
      : `${calories.total} kcal stimate a persona`;
    if (memberDeltas.length === 0) return base;

    return [
      `Base ${formatCalories(calories)} kcal/pers.`,
      ...memberDeltas.map(delta => `${delta.label} ${formatCalories(delta.calories)}`),
    ].join(' · ');
  }

  /**
   * Renders a day's per-person calorie total, or nothing when there is none to show.
   *
   * A partial total is marked with "≥" rather than being hidden: a day where two of
   * three recipes have estimates still carries useful information, but presenting the
   * partial sum as the day's intake would understate it silently.
   *
   * @param expandable - Mobile portrait: with member deltas the badge becomes the button
   *                     that opens the detail row (renderMemberDetail).
   */
  function renderDayCalories(dayIndex: number, className: string, expandable = false) {
    const day = nutritionByDay.get(dayIndex);
    if (!day || day.calories.total === 0) return null;

    const hasMemberDeltas = day.memberDeltas.length > 0;
    const label = (
      <>
        {hasMemberDeltas && <Users className="h-3 w-3 shrink-0" aria-hidden="true" />}
        {formatCalories(day.calories)} kcal/pers.
      </>
    );

    if (expandable && hasMemberDeltas) {
      const isExpanded = expandedNutritionDays.has(dayIndex);
      return (
        <button
          type="button"
          onClick={() => toggleNutritionDetail(dayIndex)}
          aria-expanded={isExpanded}
          aria-controls={`day-nutrition-${dayIndex}`}
          aria-label={`${describeDayCalories(dayIndex)}. ${isExpanded ? 'Nascondi' : 'Mostra'} il dettaglio per componente`}
          className={cn(
            className,
            '-my-2 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          {label}
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none',
              isExpanded && 'rotate-180'
            )}
          />
        </button>
      );
    }

    return (
      <span className={cn(className, 'items-center gap-1')} title={describeDayCalories(dayIndex)}>
        {label}
      </span>
    );
  }

  /**
   * Renders a day's macro totals, or nothing when no slot has an estimate.
   *
   * Gated on `countedSlots`, not on the totals being non-zero: a day where every slot
   * has 0 g of fat is still fully counted and must stay visible (macros are `!= null`
   * fields, never a truthy check).
   */
  function renderDayMacros(dayIndex: number, className: string) {
    const day = nutritionByDay.get(dayIndex);
    const macros = day?.macros;
    if (!day || !macros || macros.countedSlots === 0) return null;

    const base = macros.isPartial
      ? `Almeno P ${macros.proteinTotal} g · C ${macros.carbsTotal} g · G ${macros.fatTotal} g a persona — ${macros.uncountedSlots} ricett${macros.uncountedSlots === 1 ? 'a' : 'e'} senza macro`
      : `Proteine ${macros.proteinTotal} g · Carboidrati ${macros.carbsTotal} g · Grassi ${macros.fatTotal} g stimati a persona`;
    const memberLines = day.memberDeltas
      .filter(delta => delta.macros.countedSlots > 0)
      .map(delta => `${delta.label}: ${formatMacros(delta.macros)}`);

    return (
      <span className={className} title={[base, ...memberLines].join(' · ')}>
        {formatMacros(macros)}
      </span>
    );
  }

  /** Mobile portrait: the members whose day differs from the base path, one per line. */
  function renderMemberDetail(dayIndex: number) {
    const day = nutritionByDay.get(dayIndex);
    if (!day || day.memberDeltas.length === 0 || !expandedNutritionDays.has(dayIndex)) return null;

    return (
      <dl
        id={`day-nutrition-${dayIndex}`}
        className="mb-3 space-y-1 rounded-lg bg-muted px-3 py-2 text-xs tabular-nums"
      >
        {day.memberDeltas.map(delta => (
          <div key={delta.memberId} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="font-medium text-foreground">{delta.label}</dt>
            <dd className="text-muted-foreground">
              {formatCalories(delta.calories)} kcal
              {delta.macros.countedSlots > 0 && ` · ${formatMacros(delta.macros)}`}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  // Calculate date for each day from weekStartDate
  function getDayDate(dayIndex: number): string {
    const d = new Date(weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() + dayIndex);
    return d.getDate().toString();
  }

  function isToday(dayIndex: number): boolean {
    const today = new Date();
    const d = new Date(weekStartDate + 'T00:00:00');
    d.setDate(d.getDate() + dayIndex);
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  }

  /**
   * Mobile portrait: open the week on today's card instead of on Monday.
   *
   * One-time per displayed week (the ref), so later re-renders — every slot edit
   * replaces `plan` — never yank the scroll position away from the user. Skipped when
   * today is the first card (nothing to scroll past) and when the stacked layout is
   * not the one on screen (`offsetParent` is null under `display: none`).
   */
  const todayCardRef = useRef<HTMLDivElement | null>(null);
  const autoScrolledWeekRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoScrolledWeekRef.current === weekStartDate) return;
    autoScrolledWeekRef.current = weekStartDate;

    const card = todayCardRef.current;
    if (!card || card.offsetParent === null) return;
    card.scrollIntoView({ block: 'start' });
  }, [weekStartDate]);

  return (
    <>
      {/* ─────────────────────────────────────────
          DESKTOP GRID (≥1440px and landscape)
          8-column grid: meal labels | 7 days
          overflow-x-auto ensures narrow landscape phones can scroll
          rather than cramping columns below 72px.
          ───────────────────────────────────────── */}
      <div className="hidden lg:block max-lg:portrait:hidden max-lg:landscape:block overflow-x-auto">
        {/* Day headers */}
        <div
          className="grid gap-2 mb-2 min-w-max"
          style={{ gridTemplateColumns: `88px repeat(${activeDays.length}, minmax(150px, 1fr))` }}
        >
          {/* Empty corner */}
          <div />
          {activeDays.map(i => (
            <div key={i} className={cn('text-center rounded-md px-1 py-0.5', isToday(i) && TODAY_HEADER_CLASSES)}>
              <p className={cn('text-xs font-semibold', isToday(i) ? 'text-primary' : 'text-foreground')}>{DAY_LABELS_SHORT[i]}</p>
              <p className={cn('text-xs', isToday(i) ? 'text-primary' : 'text-muted-foreground')}>{getDayDate(i)}</p>
              {renderDayCalories(i, 'flex justify-center text-[11px] tabular-nums text-muted-foreground')}
              {renderDayMacros(i, 'block text-[10px] tabular-nums text-muted-foreground')}
            </div>
          ))}
        </div>

        {/* Meal rows */}
        {orderedMealTypes.map(mealType => (
          <div
            key={mealType}
            className="grid gap-2 mb-2"
            style={{ gridTemplateColumns: `88px repeat(${activeDays.length}, minmax(150px, 1fr))` }}
          >
            {/* Meal type label */}
            <div className="flex items-center">
              <span className="text-xs font-medium text-muted-foreground">
                {MEAL_LABELS[mealType]}
              </span>
            </div>

            {/* Active day slots */}
            {activeDays.map(dayIndex => {
              const slot = getSlot(dayIndex, mealType);
              const slotKey = `${dayIndex}-${mealType}`;
              return (
                <MealSlotCell
                  key={dayIndex}
                  slot={slot}
                  isNew={isNewRecipeSlot(slot)}
                  onClick={() => onSlotClick(dayIndex, mealType)}
                  onSaveNewRecipe={slot?.newRecipe ? () => onSaveNewRecipe(slot) : undefined}
                  onRegenerate={slot ? () => onRegenerateSlot(dayIndex, mealType) : undefined}
                  isRegenerating={regeneratingSlots.has(slotKey)}
                  members={members}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ─────────────────────────────────────────
          MOBILE PORTRAIT: Stacked day cards
          Each card = one day with meal rows inside
          ───────────────────────────────────────── */}
      <div className="block lg:hidden max-lg:portrait:block max-lg:landscape:hidden space-y-3">
        {activeDays.map((dayIndex, i) => (
          <div
            key={dayIndex}
            ref={isToday(dayIndex) && i > 0 ? todayCardRef : undefined}
            className={cn(
              'rounded-xl border bg-card p-3 scroll-mt-4',
              'animate-fade-up motion-reduce:animate-none',
              isToday(dayIndex) ? TODAY_CARD_CLASSES : 'border-border'
            )}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {/* Day header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('text-sm font-semibold', isToday(dayIndex) ? 'text-primary' : 'text-foreground')}>
                {DAY_LABELS_FULL[dayIndex]}
              </span>
              <span className={cn('text-xs', isToday(dayIndex) ? 'text-primary' : 'text-muted-foreground')}>{getDayDate(dayIndex)}</span>
              {renderDayCalories(dayIndex, 'ml-auto inline-flex text-xs tabular-nums text-muted-foreground', true)}
            </div>
            {renderDayMacros(dayIndex, 'block text-right text-[11px] tabular-nums text-muted-foreground mb-2')}
            {renderMemberDetail(dayIndex)}

            {/* Meal type rows */}
            <div className="space-y-2">
              {orderedMealTypes.map(mealType => {
                const slot = getSlot(dayIndex, mealType);
                const slotKey = `${dayIndex}-${mealType}`;
                return (
                  <div key={mealType} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-[72px] shrink-0 pt-1">
                      {MEAL_LABELS[mealType]}
                    </span>
                    <div className="flex-1">
                      <MealSlotCell
                        slot={slot}
                        isNew={isNewRecipeSlot(slot)}
                        onClick={() => onSlotClick(dayIndex, mealType)}
                        onSaveNewRecipe={slot?.newRecipe ? () => onSaveNewRecipe(slot) : undefined}
                        onRegenerate={slot ? () => onRegenerateSlot(dayIndex, mealType) : undefined}
                        isRegenerating={regeneratingSlots.has(slotKey)}
                        members={members}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
