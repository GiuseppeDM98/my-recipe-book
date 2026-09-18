'use client';

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Category, Recipe, Season } from '@/types';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';
import { matchesSearch } from '@/lib/utils/search';
import { getRecipeCategoryIds } from '@/lib/utils/recipe-categories';
import { cn } from '@/lib/utils/cn';

interface RecipePickerPanelProps {
  recipes: Recipe[];
  categories: Category[];
  /** Highlighted as the current choice (e.g. the slot's base recipe). */
  selectedRecipeId?: string | null;
  /** Recipes left out of the list (e.g. the base meal when picking a variant). */
  excludedRecipeIds?: string[];
  /** One tap = one pick. The caller decides what a pick commits and where to go next. */
  onPick: (recipe: Recipe) => void;
}

const SEASONS_WITH_ALL: (Season | 'tutti')[] = [
  'tutti', 'primavera', 'estate', 'autunno', 'inverno', 'tutte_stagioni'
];

/**
 * Search + season filter + category filter + recipe list over the user's cookbook.
 *
 * WHY A PANEL AND NOT A SHEET:
 * The slot editor picks a recipe in two places (the base meal and a variant) without
 * closing between one action and the next. The picker is therefore a view INSIDE the
 * editor sheet, and owns only what is local to a pick: the filters. They reset on every
 * mount, which is what the caller wants — each pick starts from the whole cookbook.
 *
 * Expects a flex column parent with a bounded height: the list is the only scrolling
 * region, the filters stay in place above it.
 */
export function RecipePickerPanel({
  recipes,
  categories,
  selectedRecipeId = null,
  excludedRecipeIds,
  onPick,
}: RecipePickerPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<Season | 'tutti'>('tutti');
  const [categoryFilter, setCategoryFilter] = useState<string>('tutti');

  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories]
  );

  const filtered = useMemo(() => {
    return recipes.filter(recipe => {
      if (excludedRecipeIds?.includes(recipe.id)) return false;

      // Search filter
      if (searchQuery && !matchesSearch(searchQuery, recipe.title)) return false;

      // Season filter
      if (seasonFilter !== 'tutti') {
        const hasSeasons = recipe.seasons && recipe.seasons.length > 0;
        if (hasSeasons && !recipe.seasons!.includes(seasonFilter)) return false;
        if (!hasSeasons && recipe.season && recipe.season !== seasonFilter) return false;
      }

      // Category filter
      if (categoryFilter !== 'tutti' && !getRecipeCategoryIds(recipe).includes(categoryFilter)) return false;

      return true;
    });
  }, [recipes, excludedRecipeIds, searchQuery, seasonFilter, categoryFilter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Search */}
      <div className="relative shrink-0">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Cerca ricetta..."
          aria-label="Cerca ricetta"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={cn(
            'w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border',
            'bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary'
          )}
        />
      </div>

      {/* Season filter pills */}
      <div className="flex gap-1.5 overflow-x-auto shrink-0 pb-1">
        {SEASONS_WITH_ALL.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setSeasonFilter(s)}
            aria-pressed={seasonFilter === s}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors shrink-0',
              seasonFilter === s
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-accent'
            )}
          >
            {s === 'tutti' ? (
              'Tutte'
            ) : (
              <>
                <span>{SEASON_ICONS[s]}</span>
                <span>{SEASON_LABELS[s]}</span>
              </>
            )}
          </button>
        ))}
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          aria-label="Filtra per categoria"
          className={cn(
            'shrink-0 w-full text-sm border border-border rounded-lg px-3 py-2',
            'bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
          )}
        >
          <option value="tutti">Tutte le categorie</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      )}

      {/* Recipe list */}
      <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nessuna ricetta trovata
          </p>
        ) : (
          filtered.map(recipe => {
            const recipeCategories = getRecipeCategoryIds(recipe)
              .map(id => categoryMap.get(id))
              .filter((c): c is Category => Boolean(c));
            const isCurrentlySelected = selectedRecipeId === recipe.id;

            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => onPick(recipe)}
                aria-current={isCurrentlySelected ? 'true' : undefined}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
                  isCurrentlySelected
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent hover:bg-accent'
                )}
              >
                <p className="text-sm font-medium line-clamp-1">{recipe.title}</p>
                {recipeCategories.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {recipeCategories.map(c => `${c.icon ?? ''} ${c.name}`.trim()).join(' · ')}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
