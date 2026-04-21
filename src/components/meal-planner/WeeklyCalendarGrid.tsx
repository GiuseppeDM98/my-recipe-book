'use client';

import { MealPlan, MealSlot, MealType, Recipe, Category } from '@/types';
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
}

const DAY_LABELS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const DAY_LABELS_FULL = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};

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
 * SLOT LOOKUP:
 * Finds each slot by (dayIndex, mealType) in O(n) per cell.
 * With max 21 slots this is fast enough without a Map.
 */
export function WeeklyCalendarGrid({
  plan,
  onSlotClick,
  onSaveNewRecipe,
  onRegenerateSlot,
  regeneratingSlots,
  weekStartDate,
}: WeeklyCalendarGridProps) {
  const { activeMealTypes, slots } = plan;
  const activeDays = plan.activeDays ?? [0, 1, 2, 3, 4, 5, 6];

  function getSlot(dayIndex: number, mealType: MealType): MealSlot | undefined {
    return slots.find(s => s.dayIndex === dayIndex && s.mealType === mealType);
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
          className="grid gap-2 mb-2 min-w-0"
          style={{ gridTemplateColumns: `80px repeat(${activeDays.length}, minmax(72px, 1fr))` }}
        >
          {/* Empty corner */}
          <div />
          {activeDays.map(i => (
            <div key={i} className={cn('text-center rounded-md px-1 py-0.5', isToday(i) && 'bg-primary/10 ring-1 ring-primary/40')}>
              <p className={cn('text-xs font-semibold', isToday(i) ? 'text-primary' : 'text-foreground')}>{DAY_LABELS_SHORT[i]}</p>
              <p className={cn('text-xs', isToday(i) ? 'text-primary/70' : 'text-muted-foreground')}>{getDayDate(i)}</p>
            </div>
          ))}
        </div>

        {/* Meal rows */}
        {activeMealTypes.map(mealType => (
          <div
            key={mealType}
            className="grid gap-2 mb-2"
            style={{ gridTemplateColumns: `80px repeat(${activeDays.length}, minmax(72px, 1fr))` }}
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
                  onSaveNewRecipe={slot ? () => onSaveNewRecipe(slot) : undefined}
                  onRegenerate={slot ? () => onRegenerateSlot(dayIndex, mealType) : undefined}
                  isRegenerating={regeneratingSlots.has(slotKey)}
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
        {activeDays.map(dayIndex => (
          <div
            key={dayIndex}
            className={cn(
              'rounded-xl border bg-card p-3',
              isToday(dayIndex) ? 'border-primary/50 bg-primary/5' : 'border-border'
            )}
          >
            {/* Day header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('text-sm font-semibold', isToday(dayIndex) ? 'text-primary' : 'text-foreground')}>
                {DAY_LABELS_FULL[dayIndex]}
              </span>
              <span className={cn('text-xs', isToday(dayIndex) ? 'text-primary/70' : 'text-muted-foreground')}>{getDayDate(dayIndex)}</span>
            </div>

            {/* Meal type rows */}
            <div className="space-y-2">
              {activeMealTypes.map(mealType => {
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
                        onSaveNewRecipe={slot ? () => onSaveNewRecipe(slot) : undefined}
                        onRegenerate={slot ? () => onRegenerateSlot(dayIndex, mealType) : undefined}
                        isRegenerating={regeneratingSlots.has(slotKey)}
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
