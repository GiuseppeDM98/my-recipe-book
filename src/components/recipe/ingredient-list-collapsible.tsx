'use client';

import { useState, useEffect, useRef } from 'react';
import { Ingredient } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * IngredientListCollapsible - Section-based ingredient viewer
 *
 * SECTION HANDLING:
 * - Ingredients with section field → Collapsible named sections
 * - Ingredients without section (null/undefined) → Flat list (no header)
 * - Null section always renders first (default ingredients)
 *
 * RENDERING MODES:
 * - static (recipe view): Checkmarks, no interaction
 * - interactive (cooking mode): Checkboxes, track checked ingredients
 *
 * SORTING:
 * - Null section: First
 * - Named sections: `orderedSections` when the caller supplies one (the cooking order read
 *   from the steps), otherwise order of first appearance in the ingredients array
 */

interface IngredientListCollapsibleProps {
  ingredients: Ingredient[];
  /**
   * Section names in cooking order, from `orderedSectionNamesFromSteps(recipe.steps)`.
   *
   * Without it the ingredient column falls back to the array order, which stops meaning
   * anything once sections are assigned across an already-flat recipe — the reorganize
   * action does exactly that, and the two columns then disagree. Sections missing from
   * this list keep their first-appearance position, after the listed ones.
   */
  orderedSections?: string[];
  defaultExpanded?: boolean;
  interactive?: boolean;
  checkedIngredients?: string[];
  onToggleIngredient?: (ingredientId: string) => void;
}

interface GroupedIngredients {
  section: string | null;
  ingredients: Ingredient[];
}

export function IngredientListCollapsible({
  ingredients,
  orderedSections,
  defaultExpanded = false,
  interactive = false,
  checkedIngredients = [],
  onToggleIngredient,
}: IngredientListCollapsibleProps) {
  // ========================================
  // Group ingredients by section, in document order
  // ========================================
  //
  // ALGORITHM:
  // 1. Group by section field (null = no section); a Map preserves insertion order,
  //    so each section lands in the order it first appears in the array
  // 2. Emit the null group first, then the named groups in that same order
  //
  // WHY FIRST APPEARANCE (not alphabetical):
  // - The document order IS the order of preparation: a recipe lists the base before
  //   the cream because you make it first. Sorting alphabetically put "Per la crema"
  //   ahead of "Per la base" and read as a different recipe.
  // - Null section still comes first: those are the recipe's default ingredients,
  //   rendered without collapsible chrome.
  //
  // `orderedSections` overrides the array order when the caller knows the cooking order
  // (it comes from the steps' sectionOrder). It matters for recipes reorganized after the
  // fact, whose ingredient array still follows the old flat listing and no longer implies
  // anything about the new sections.
  const ingredientsBySection = new Map<string | null, Ingredient[]>();

  ingredients.forEach(ingredient => {
    const section = ingredient.section || null; // Normalize undefined → null
    if (!ingredientsBySection.has(section)) {
      ingredientsBySection.set(section, []);
    }
    ingredientsBySection.get(section)!.push(ingredient);
  });

  const nullGroups: GroupedIngredients[] = [];
  const namedGroups: GroupedIngredients[] = [];
  ingredientsBySection.forEach((sectionIngredients, section) => {
    const group = { section, ingredients: sectionIngredients };
    (section === null ? nullGroups : namedGroups).push(group);
  });

  if (orderedSections && orderedSections.length > 0) {
    // Sections the caller didn't list sort after the listed ones, keeping their relative
    // order (Array.prototype.sort is stable), so an unexpected name is never dropped.
    const rank = (section: string | null) => {
      const index = section === null ? -1 : orderedSections.indexOf(section);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    namedGroups.sort((a, b) => rank(a.section) - rank(b.section));
  }

  const groupedIngredients: GroupedIngredients[] = [...nullGroups, ...namedGroups];

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(defaultExpanded ? groupedIngredients.map(g => g.section || 'no-section') : [])
  );

  // Initialized with current value to avoid auto-closing already-complete sections on mount
  const prevCheckedRef = useRef<string[]>(checkedIngredients);

  function isSectionComplete(items: { id: string }[]): boolean {
    if (!interactive || items.length === 0) return false;
    return items.every(item => checkedIngredients.includes(item.id));
  }

  useEffect(() => {
    if (!interactive) return;

    const newlyCompleted: string[] = [];
    groupedIngredients.forEach(group => {
      const key = group.section || 'no-section';
      const ids = group.ingredients.map(i => i.id);
      if (ids.length === 0) return;

      const wasComplete = ids.every(id => prevCheckedRef.current.includes(id));
      const isComplete = ids.every(id => checkedIngredients.includes(id));
      if (!wasComplete && isComplete) newlyCompleted.push(key);
    });

    if (newlyCompleted.length > 0) {
      setExpandedSections(prev => {
        const next = new Set(prev);
        newlyCompleted.forEach(key => next.delete(key));
        return next;
      });
    }

    prevCheckedRef.current = checkedIngredients;
  }, [checkedIngredients, interactive]);

  const toggleSection = (section: string | null) => {
    const key = section || 'no-section';
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  return (
    <div className="space-y-4">
      {groupedIngredients.map((group) => {
        const sectionKey = group.section || 'no-section';
        const isExpanded = expandedSections.has(sectionKey);
        const hasSection = group.section !== null;

        // ========================================
        // Null section: Render flat (no collapsible header)
        // ========================================
        // WHY: Simple recipes often have single section → avoid unnecessary UI chrome
        // Named sections get collapsible headers instead (see below)
        if (!hasSection) {
          const sectionComplete = isSectionComplete(group.ingredients);
          return (
            <div key={sectionKey} className={cn(
              interactive && sectionComplete
                ? 'rounded-lg border border-accent/40 bg-accent/8 p-3 transition-colors duration-300'
                : ''
            )}>
            <ul className="space-y-3">
              {group.ingredients.map((ingredient) => {
                const isChecked = checkedIngredients.includes(ingredient.id);
                return (
                  <li
                    key={ingredient.id}
                    className={`flex items-start ${interactive ? 'cursor-pointer hover:bg-secondary/50 p-2 rounded transition-colors' : ''}`}
                    onClick={() => interactive && onToggleIngredient?.(ingredient.id)}
                    {...(interactive ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-pressed': isChecked,
                      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleIngredient?.(ingredient.id); } },
                    } : {})}
                  >
                    {interactive ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleIngredient?.(ingredient.id)}
                        tabIndex={-1}
                        className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer accent-primary"
                      />
                    ) : (
                      <span className="flex-shrink-0 mr-3 text-primary">&#10003;</span>
                    )}
                    <div className={isChecked && interactive ? 'line-through text-muted-foreground' : ''}>
                      <span className="font-medium">{ingredient.name}</span>
                      {ingredient.quantity && (
                        <span className="text-muted-foreground ml-2">({ingredient.quantity})</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            </div>
          );
        }

        // Render collapsible section
        const sectionComplete = isSectionComplete(group.ingredients);
        return (
          <div key={sectionKey} className={cn(
            'border rounded-lg overflow-hidden transition-colors duration-300',
            sectionComplete ? 'border-accent/40 bg-accent/8' : 'border-border'
          )}>
            {/* Section Header */}
            <button
              onClick={() => toggleSection(group.section)}
              aria-expanded={isExpanded}
              className={cn(
                'w-full flex items-center justify-between p-4 transition-colors',
                sectionComplete ? 'bg-accent/12 hover:bg-accent/18' : 'bg-secondary hover:bg-secondary/80'
              )}
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className={cn('w-5 h-5', sectionComplete ? 'text-accent' : 'text-muted-foreground')} />
                ) : (
                  <ChevronRight className={cn('w-5 h-5', sectionComplete ? 'text-accent' : 'text-muted-foreground')} />
                )}
                <h3 className={cn('font-semibold text-lg', sectionComplete ? 'text-accent' : 'text-foreground')}>
                  {group.section}
                </h3>
                {sectionComplete && <span className="ml-2 text-accent">&#10003;</span>}
              </div>
            </button>

            {/* Section Ingredients — grid-rows animation è GPU-friendly (no layout thrash) */}
            <div className={cn(
              'border-t grid motion-reduce:transition-none',
              'transition-[grid-template-rows] duration-200 ease-in-out will-change-[grid-template-rows]',
              isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            )}>
              <div className="overflow-hidden">
              <div className="p-4">
                <ul className="space-y-3">
                  {group.ingredients.map((ingredient) => {
                    const isChecked = checkedIngredients.includes(ingredient.id);
                    return (
                      <li
                        key={ingredient.id}
                        className={`flex items-start ${interactive ? 'cursor-pointer hover:bg-muted/50 p-2 rounded transition-colors' : ''}`}
                        onClick={() => interactive && onToggleIngredient?.(ingredient.id)}
                        {...(interactive ? {
                          role: 'button' as const,
                          tabIndex: 0,
                          'aria-pressed': isChecked,
                          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleIngredient?.(ingredient.id); } },
                        } : {})}
                      >
                        {interactive ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleIngredient?.(ingredient.id)}
                            tabIndex={-1}
                            className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer accent-primary"
                          />
                        ) : (
                          <span className="flex-shrink-0 mr-3 text-primary">&#10003;</span>
                        )}
                        <div className={isChecked && interactive ? 'line-through text-muted-foreground' : ''}>
                          <span className="font-medium">{ingredient.name}</span>
                          {ingredient.quantity && (
                            <span className="text-muted-foreground ml-2">({ingredient.quantity})</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
