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
 * - Named sections: Alphabetical (localeCompare)
 */

interface IngredientListCollapsibleProps {
  ingredients: Ingredient[];
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
  defaultExpanded = false,
  interactive = false,
  checkedIngredients = [],
  onToggleIngredient,
}: IngredientListCollapsibleProps) {
  // ========================================
  // Group ingredients by section and sort
  // ========================================
  //
  // ALGORITHM:
  // 1. Group by section field (null = no section)
  // 2. Convert Map → array
  // 3. Sort: null first, then alphabetically
  //
  // WHY ALPHABETICAL (not insertion order):
  // - Predictable section order across recipe views
  // - User can find sections quickly (sorted like a menu)
  // - Null section always first (most common/default ingredients)
  const groupedIngredients: GroupedIngredients[] = [];
  const ingredientsBySection = new Map<string | null, Ingredient[]>();

  ingredients.forEach(ingredient => {
    const section = ingredient.section || null; // Normalize undefined → null
    if (!ingredientsBySection.has(section)) {
      ingredientsBySection.set(section, []);
    }
    ingredientsBySection.get(section)!.push(ingredient);
  });

  // Convert to array
  ingredientsBySection.forEach((ingredients, section) => {
    groupedIngredients.push({ section, ingredients });
  });

  // Sort sections
  groupedIngredients.sort((a, b) => {
    if (a.section === null) return -1; // Null section first
    if (b.section === null) return 1;
    return a.section.localeCompare(b.section); // Alphabetical
  });

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
        // Named sections get collapsible headers below (lines 109-163)
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
                      onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleIngredient?.(ingredient.id); } },
                    } : {})}
                  >
                    {interactive ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => onToggleIngredient?.(ingredient.id)}
                        tabIndex={-1}
                        className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer"
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
                      >
                        {interactive ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleIngredient?.(ingredient.id)}
                            className="flex-shrink-0 mr-3 mt-1 w-5 h-5 cursor-pointer"
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
