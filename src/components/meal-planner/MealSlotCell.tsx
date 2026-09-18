'use client';

import Link from 'next/link';
import { Plus, Sparkles, ArrowRight, RefreshCw, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { MealSlot } from '@/types';
import { PlannerMember, buildVariantChips } from '@/lib/utils/planner-members';

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
  /** Family members with resolved labels, to name who eats each variant. */
  members?: PlannerMember[];
}

const NO_MEMBERS: PlannerMember[] = [];

/**
 * Who deviates from the base meal, as compact chips under the recipe title.
 *
 * Deliberately quiet — secondary surface, no terracotta, not interactive (the whole
 * cell opens the editor) — and always visible, never hover-only: on touch a hover never
 * fires. The people count is NOT shown here: it lives in the editor, the differential
 * information worth a glance is the variants.
 */
function VariantChips({ slot, members }: { slot: MealSlot; members: PlannerMember[] }) {
  const { chips, overflowCount } = buildVariantChips(slot.variants ?? [], members);
  if (chips.length === 0) return null;

  return (
    <ul className="flex flex-wrap items-center gap-1 pl-8" aria-label="Varianti">
      {chips.map(chip => (
        <li
          key={chip.key}
          title={chip.description}
          className={cn(
            'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium leading-none',
            chip.hasRemovedMember ? 'bg-muted text-muted-foreground' : 'bg-secondary text-muted-foreground'
          )}
        >
          <span aria-hidden="true">{chip.text}</span>
          <span className="sr-only">{chip.description}</span>
        </li>
      ))}
      {overflowCount > 0 && (
        <li className="text-[10px] font-medium leading-none text-muted-foreground">
          +{overflowCount}
          <span className="sr-only"> altre varianti</span>
        </li>
      )}
    </ul>
  );
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
 * Filled cells also list the slot's per-member variants (see VariantChips).
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
export function MealSlotCell({
  slot,
  onClick,
  onSaveNewRecipe,
  isNew,
  onRegenerate,
  isRegenerating,
  members = NO_MEMBERS,
}: MealSlotCellProps) {
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
          <span className="sr-only">Ricetta generata dall&apos;AI</span>
        </span>

        <div className="flex items-start justify-between gap-1 pl-8">
          <button
            onClick={onClick}
            className="flex-1 text-left text-sm lg:text-xs font-medium leading-tight text-foreground line-clamp-2 lg:line-clamp-3 hover:underline"
            title={slot.recipeTitle ?? undefined}
          >
            {slot.recipeTitle}
          </button>
          {onRegenerate && (
            <button
              onClick={e => { e.stopPropagation(); onRegenerate(); }}
              className={cn(
                'shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground transition-opacity hover:text-foreground',
                'h-9 w-9 -mr-1.5 -mt-1 lg:h-7 lg:w-7 lg:m-0',
                'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:opacity-100'
              )}
              title="Rimescola"
              aria-label="Rimescola questo slot"
            >
              <RefreshCw className="h-4 w-4 lg:h-3 lg:w-3" />
            </button>
          )}
        </div>
        <VariantChips slot={slot} members={members} />
        {onSaveNewRecipe ? (
          <div className="flex items-center gap-1 mt-auto pl-8">
            <button
              onClick={e => { e.stopPropagation(); onSaveNewRecipe(); }}
              className="inline-flex min-h-[32px] items-center text-sm lg:text-xs text-primary hover:underline font-medium"
            >
              Salva nel ricettario
            </button>
          </div>
        ) : (
          <div className="mt-auto pl-8">
            <span className="text-xs lg:text-[11px] text-muted-foreground">
              Rimescola o clicca per scegliere una ricetta dal ricettario
            </span>
          </div>
        )}
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
        <span className="sr-only">Dal ricettario</span>
      </span>

      <div className="flex items-start justify-between gap-1 pl-8">
        <button
          onClick={onClick}
          className="flex-1 text-left text-sm lg:text-xs font-medium leading-tight text-foreground line-clamp-2 lg:line-clamp-3 hover:underline"
          title={slot.recipeTitle ?? undefined}
        >
          {slot.recipeTitle}
        </button>
        {onRegenerate && (
          <button
            onClick={e => { e.stopPropagation(); onRegenerate(); }}
            className={cn(
              'shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground transition-opacity hover:text-foreground',
              'h-9 w-9 -mr-1.5 -mt-1 lg:h-7 lg:w-7 lg:m-0',
              'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 focus-visible:opacity-100'
            )}
            title="Rimescola"
            aria-label="Rimescola questo slot"
          >
            <RefreshCw className="h-4 w-4 lg:h-3 lg:w-3" />
          </button>
        )}
      </div>
      <VariantChips slot={slot} members={members} />
      {slot.existingRecipeId && (
        <div className="mt-auto pl-8">
          <Link
            href={`/ricette/${slot.existingRecipeId}`}
            className="inline-flex min-h-[32px] items-center gap-0.5 text-sm lg:text-xs text-muted-foreground hover:text-foreground hover:underline font-medium"
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
