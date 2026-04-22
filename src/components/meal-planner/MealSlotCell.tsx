'use client';

import Link from 'next/link';
import { Plus, Sparkles, ArrowRight, RefreshCw, BookOpen } from 'lucide-react';
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
  /** Called when user clicks the regenerate button on an occupied slot */
  onRegenerate?: () => void;
  /** True while a regeneration request is in-flight for this slot */
  isRegenerating?: boolean;
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
 * - Existing recipe (book badge): recipe from the user's cookbook
 * - AI-generated new recipe (sparkle badge): not yet saved to cookbook;
 *   shows a "Salva" button so user can add it to their cookbook
 *
 * WHY SEPARATE onSaveNewRecipe from onClick:
 * The "Salva" action is distinct from the "change recipe" action (onClick).
 * Mixing them would require the parent to infer intent from context.
 */
export function MealSlotCell({ slot, onClick, onSaveNewRecipe, isNew, onRegenerate, isRegenerating }: MealSlotCellProps) {
  // Empty slot
  if (!slot) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'w-full min-h-[64px] rounded-lg border-2 border-dashed border-border',
          'flex items-center justify-center',
          'text-muted-foreground hover:border-primary hover:text-primary',
          'transition-all duration-150 ease-out motion-reduce:transition-none',
          'hover:scale-[1.02] active:scale-[0.98]'
        )}
        aria-label="Aggiungi ricetta"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  }

  // AI-generated new recipe (not yet in cookbook)
  if (isNew) {
    if (isRegenerating) {
      return (
        <div className={cn(
          'w-full min-h-[64px] rounded-lg border border-border bg-muted/40',
          'p-2 flex items-center justify-center animate-pulse motion-reduce:animate-none'
        )}>
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
        </div>
      );
    }
    return (
      <div
        className={cn(
          'w-full min-h-[64px] rounded-lg border border-border bg-muted/30',
          'p-2 flex flex-col gap-1 group relative',
          'transition-shadow duration-150 ease-out motion-reduce:transition-none',
          'hover:shadow-sm'
        )}
      >
        {/* AI badge — top-left corner, identifies origin without side-stripe */}
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-sm bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary leading-none">
          <Sparkles className="h-2.5 w-2.5" />
          AI
        </span>

        <div className="flex items-start justify-between gap-1 pl-8">
          <button
            onClick={onClick}
            className="text-left text-xs font-medium text-foreground line-clamp-2 hover:underline leading-tight flex-1"
          >
            {slot.recipeTitle}
          </button>
          {onRegenerate && (
            <button
              onClick={e => { e.stopPropagation(); onRegenerate(); }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
              title="Rigenera"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 mt-auto pl-8">
          <button
            onClick={e => { e.stopPropagation(); onSaveNewRecipe?.(); }}
            className="text-xs text-primary hover:underline font-medium"
          >
            Salva nel ricettario
          </button>
        </div>
      </div>
    );
  }

  // Existing cookbook recipe
  if (isRegenerating) {
    return (
      <div className={cn(
        'w-full min-h-[64px] rounded-lg border border-border bg-muted/40',
        'p-2 flex items-center justify-center animate-pulse motion-reduce:animate-none'
      )}>
        <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        'w-full min-h-[64px] rounded-lg border border-border bg-card',
        'p-2 flex flex-col gap-1 group relative',
        'transition-shadow duration-150 ease-out motion-reduce:transition-none',
        'hover:shadow-sm'
      )}
    >
      {/* Cookbook badge — top-left corner, identifies source */}
      <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 rounded-sm bg-secondary px-1 py-0.5 text-[10px] font-medium text-muted-foreground leading-none">
        <BookOpen className="h-2.5 w-2.5" />
      </span>

      <div className="flex items-start justify-between gap-1 pl-8">
        <button
          onClick={onClick}
          className="text-left text-xs font-medium text-foreground line-clamp-2 hover:underline leading-tight flex-1"
        >
          {slot.recipeTitle}
        </button>
        {onRegenerate && (
          <button
            onClick={e => { e.stopPropagation(); onRegenerate(); }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
            title="Rigenera"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        )}
      </div>
      {slot.existingRecipeId && (
        <div className="mt-auto pl-8">
          <Link
            href={`/ricette/${slot.existingRecipeId}`}
            className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline font-medium"
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
