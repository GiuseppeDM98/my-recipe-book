'use client';

import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Category, MealSlot, MealType, Recipe, Season } from '@/types';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';
import { matchesSearch } from '@/lib/utils/search';
import { cn } from '@/lib/utils/cn';

interface RecipePickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayIndex: number;
  mealType: MealType;
  recipes: Recipe[];
  categories: Category[];
  currentSlot: MealSlot | undefined;
  onSelect: (dayIndex: number, mealType: MealType, recipeId: string, title: string) => void;
  onClear: (dayIndex: number, mealType: MealType) => void;
}

const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};

const DAY_LABELS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

const SEASONS_WITH_ALL: (Season | 'tutti')[] = [
  'tutti', 'primavera', 'estate', 'autunno', 'inverno', 'tutte_stagioni'
];

/**
 * Bottom sheet for picking a recipe from the user's cookbook.
 *
 * Features search (Italian accent-aware), season filter, and category filter.
 * The current slot's recipe is highlighted if already assigned.
 *
 * WHY BOTTOM SHEET (not dialog):
 * Consistent with more-sheet.tsx and RecipeChatInput patterns.
 * Bottom sheets are more ergonomic on mobile portrait (thumb reach).
 */
export function RecipePickerSheet({
  open,
  onOpenChange,
  dayIndex,
  mealType,
  recipes,
  categories,
  currentSlot,
  onSelect,
  onClear,
}: RecipePickerSheetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [seasonFilter, setSeasonFilter] = useState<Season | 'tutti'>('tutti');
  const [categoryFilter, setCategoryFilter] = useState<string>('tutti');

  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories]
  );

  const filtered = useMemo(() => {
    return recipes.filter(recipe => {
      // Search filter
      if (searchQuery && !matchesSearch(searchQuery, recipe.title)) return false;

      // Season filter
      if (seasonFilter !== 'tutti') {
        const hasSeasons = recipe.seasons && recipe.seasons.length > 0;
        if (hasSeasons && !recipe.seasons!.includes(seasonFilter)) return false;
        if (!hasSeasons && recipe.season && recipe.season !== seasonFilter) return false;
      }

      // Category filter
      if (categoryFilter !== 'tutti' && recipe.categoryId !== categoryFilter) return false;

      return true;
    });
  }, [recipes, searchQuery, seasonFilter, categoryFilter]);

  const title = `${DAY_LABELS[dayIndex]} — ${MEAL_LABELS[mealType]}`;

  function handleSelect(recipe: Recipe) {
    onSelect(dayIndex, mealType, recipe.id, recipe.title);
    onOpenChange(false);
  }

  function handleClear() {
    onClear(dayIndex, mealType);
    onOpenChange(false);
  }

  // Reset filters when sheet opens
  function handleOpenChange(open: boolean) {
    if (!open) {
      setSearchQuery('');
      setSeasonFilter('tutti');
      setCategoryFilter('tutti');
    }
    onOpenChange(open);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="max-lg:portrait:rounded-t-xl h-[85vh] flex flex-col"
      >
        <SheetHeader className="shrink-0">
          <SheetTitle className="text-left">{title}</SheetTitle>
          <SheetDescription className="sr-only">
            Scegli una ricetta dal tuo ricettario per questo slot
          </SheetDescription>
        </SheetHeader>

        {/* Search */}
        <div className="relative shrink-0 mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Cerca ricetta..."
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
              const category = recipe.categoryId ? categoryMap.get(recipe.categoryId) : undefined;
              const isCurrentlySelected = currentSlot?.existingRecipeId === recipe.id;

              return (
                <button
                  key={recipe.id}
                  onClick={() => handleSelect(recipe)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg border transition-colors',
                    isCurrentlySelected
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-accent'
                  )}
                >
                  <p className="text-sm font-medium line-clamp-1">{recipe.title}</p>
                  {category && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {category.icon} {category.name}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Clear action */}
        {currentSlot && (currentSlot.existingRecipeId || currentSlot.newRecipe) && (
          <Button
            variant="ghost"
            onClick={handleClear}
            className="shrink-0 text-destructive hover:text-destructive gap-2"
          >
            <X className="h-4 w-4" />
            Rimuovi ricetta da questo slot
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
