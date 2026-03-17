'use client';

import Link from 'next/link';
import { Plus, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MealSlot } from '@/types';

interface MealSlotCellProps {
  /** Slot data; undefined means the slot is empty */
  slot: MealSlot | undefined;
  onClick: () => void;
  /** Called when user clicks "Salva" on an AI-generated recipe */
  onSaveNewRecipe?: () => void;
  /** True if the slot contains an AI-generated recipe not yet in the cookbook */
  isNew: boolean;
}

/**
 * Determine if a slot is visually "new" (AI-generated, not yet in cookbook).
 *
 * WHY CHECK BOTH newRecipe AND existingRecipeId:
 * If newRecipe is null but existingRecipeId is also null, the slot is still
 * an AI-generated one (it just failed to parse client-side). Treat it as
 * "new" so the user can still click it to manually replace it, rather than
 * showing it as a cookbook recipe (green = misleading).
 */
export function isNewRecipeSlot(slot: MealSlot | undefined): boolean {
  if (!slot) return false;
  return slot.newRecipe !== null || (!slot.existingRecipeId && !!slot.recipeTitle);
}

/**
 * A single cell in the weekly meal calendar grid.
 *
 * THREE VISUAL STATES:
 * - Empty: dashed border with "+" affordance — invites user to assign a recipe
 * - Existing recipe (green left border): recipe from the user's cookbook
 * - AI-generated new recipe (purple left border): not yet saved to cookbook;
 *   shows a "Salva" button so user can add it to their cookbook
 *
 * WHY SEPARATE onSaveNewRecipe from onClick:
 * The "Salva" action is distinct from the "change recipe" action (onClick).
 * Mixing them would require the parent to infer intent from context.
 */
export function MealSlotCell({ slot, onClick, onSaveNewRecipe, isNew }: MealSlotCellProps) {
  // Empty slot
  if (!slot) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full min-h-[64px] rounded-lg border-2 border-dashed border-border',
          'flex items-center justify-center',
          'text-muted-foreground hover:border-primary hover:text-primary',
          'transition-colors duration-150'
        )}
        aria-label="Aggiungi ricetta"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  // AI-generated new recipe (not yet in cookbook)
  if (isNew) {
    return (
      <div
        className={cn(
          'w-full min-h-[64px] rounded-lg border border-purple-200 bg-purple-50',
          'border-l-4 border-l-purple-400',
          'p-2 flex flex-col gap-1'
        )}
      >
        <button
          onClick={onClick}
          className="text-left text-xs font-medium text-purple-900 line-clamp-2 hover:underline leading-tight"
        >
          {slot.recipeTitle}
        </button>
        <div className="flex items-center gap-1 mt-auto">
          <Sparkles className="h-3 w-3 text-purple-400 shrink-0" />
          <button
            onClick={e => { e.stopPropagation(); onSaveNewRecipe?.(); }}
            className="text-xs text-purple-600 hover:text-purple-800 hover:underline font-medium"
          >
            Salva nel ricettario
          </button>
        </div>
      </div>
    );
  }

  // Existing cookbook recipe
  return (
    <div
      className={cn(
        'w-full min-h-[64px] rounded-lg border border-green-200 bg-green-50',
        'border-l-4 border-l-green-400',
        'p-2 flex flex-col gap-1'
      )}
    >
      <button
        onClick={onClick}
        className="text-left text-xs font-medium text-green-900 line-clamp-2 hover:underline leading-tight"
      >
        {slot.recipeTitle}
      </button>
      {slot.existingRecipeId && (
        <div className="mt-auto">
          <Link
            href={`/ricette/${slot.existingRecipeId}`}
            className="flex items-center gap-0.5 text-xs text-green-700 hover:text-green-900 hover:underline font-medium"
            onClick={e => e.stopPropagation()}
          >
            Vai alla ricetta
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
