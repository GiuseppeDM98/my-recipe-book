'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecipes } from '@/lib/hooks/useRecipes';
import { RecipeCard } from '@/components/recipe/recipe-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/context/auth-context';
import { getUserCategories, getCategorySubcategories } from '@/lib/firebase/categories';
import { Subcategory, Season } from '@/types';
import { matchesSearch } from '@/lib/utils/search';
import { SEASON_ICONS, SEASON_LABELS, ALL_SEASONS } from '@/lib/constants/seasons';
import Link from 'next/link';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { EditorialEmptyState } from '@/components/ui/editorial-empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Recipe List Page - Cascading Filter Architecture
 *
 * Three-level filtering: Season → Category → Subcategory
 * - Season filter: Independent (all recipes)
 * - Category filter: Narrows season results
 * - Subcategory filter: Narrows category results (depends on category selection)
 *
 * Filter panel collapsed by default to reduce cognitive load in kitchen context.
 * Active filters shown as chips so user always knows what is applied.
 */
export default function RecipesPage() {
  const { recipes, loading, error } = useRecipes();
  const { user } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState<Season | 'all'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Load categories once — shared cache key ensures a second visit costs no extra reads.
  const { data: categories = [] } = useQuery({
    enabled: !!user,
    queryKey: ['categories', user?.uid ?? ''],
    queryFn: () => getUserCategories(user!.uid),
  });

  // Load ALL subcategories upfront so every category filter responds instantly.
  const categoryIds = categories.map((c) => c.id);
  const { data: subcategories = [] } = useQuery<Subcategory[]>({
    enabled: !!user && categories.length > 0,
    queryKey: ['subcategories', user?.uid ?? '', categoryIds],
    queryFn: async () => {
      const subcategoryGroups = await Promise.all(
        categories.map((category) => getCategorySubcategories(category.id, user!.uid))
      );
      return subcategoryGroups.flat();
    },
  });

  /**
   * Applies cascading filters in order (search → season → category → subcategory).
   * useMemo prevents recalculation unless dependencies change.
   */
  const filteredRecipes = useMemo(() => {
    let filtered = recipes;

    if (searchQuery.trim()) {
      filtered = filtered.filter(recipe =>
        matchesSearch(searchQuery, recipe.title)
      );
    }

    if (selectedSeason !== 'all') {
      filtered = filtered.filter(recipe => {
        if (recipe.seasons) return recipe.seasons.includes(selectedSeason);
        if (recipe.season) return recipe.season === selectedSeason;
        return false;
      });
    }

    if (selectedCategoryId !== 'all') {
      filtered = filtered.filter(recipe => recipe.categoryId === selectedCategoryId);
    }

    if (selectedSubcategoryId !== 'all') {
      filtered = filtered.filter(recipe => recipe.subcategoryId === selectedSubcategoryId);
    }

    return filtered;
  }, [recipes, searchQuery, selectedSeason, selectedCategoryId, selectedSubcategoryId]);

  const availableSubcategories = useMemo(() => {
    if (selectedCategoryId === 'all') return subcategories;
    return subcategories.filter(sub => sub.categoryId === selectedCategoryId);
  }, [subcategories, selectedCategoryId]);

  const recipeCountBySeason = useMemo(() => {
    return ALL_SEASONS.reduce<Record<Season, number>>((counts, season) => {
      counts[season] = recipes.reduce((total, recipe) => {
        if (recipe.seasons?.includes(season)) return total + 1;
        if (!recipe.seasons && recipe.season === season) return total + 1;
        return total;
      }, 0);
      return counts;
    }, {
      primavera: 0,
      estate: 0,
      autunno: 0,
      inverno: 0,
      tutte_stagioni: 0,
    });
  }, [recipes]);

  const recipeCountByCategoryId = useMemo(() => {
    return recipes.reduce<Record<string, number>>((counts, recipe) => {
      if (!recipe.categoryId) return counts;
      counts[recipe.categoryId] = (counts[recipe.categoryId] ?? 0) + 1;
      return counts;
    }, {});
  }, [recipes]);

  const recipeCountBySubcategoryId = useMemo(() => {
    return recipes.reduce<Record<string, number>>((counts, recipe) => {
      if (!recipe.subcategoryId) return counts;
      counts[recipe.subcategoryId] = (counts[recipe.subcategoryId] ?? 0) + 1;
      return counts;
    }, {});
  }, [recipes]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId),
    [categories, selectedCategoryId]
  );

  const selectedSubcategory = useMemo(
    () => subcategories.find((subcategory) => subcategory.id === selectedSubcategoryId),
    [subcategories, selectedSubcategoryId]
  );

  // Reset subcategory when category changes and current sub no longer belongs to it
  useEffect(() => {
    if (selectedCategoryId === 'all') {
      setSelectedSubcategoryId('all');
    } else {
      const currentSubInNewCat = availableSubcategories.some(
        sub => sub.id === selectedSubcategoryId
      );
      if (!currentSubInNewCat) setSelectedSubcategoryId('all');
    }
  }, [selectedCategoryId, selectedSubcategoryId, availableSubcategories]);

  const activeFilterCount = [
    selectedSeason !== 'all',
    selectedCategoryId !== 'all',
    selectedSubcategoryId !== 'all',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSelectedSeason('all');
    setSelectedCategoryId('all');
    setSelectedSubcategoryId('all');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-11 w-56" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
        <div className="rounded-[1.75rem] border border-border bg-card px-4 py-4 sm:px-5 space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-3 w-44" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-24 rounded-full" />
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-[1.6rem] border border-border bg-card p-5 space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-4/5" />
              </div>
              <Skeleton className="h-16 w-full" />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Errore nel caricamento delle ricette: {error}</p>;
  }

  return (
    <div className="space-y-6">
      {/* === PAGE HEADER === */}
      <div className="flex items-end justify-between gap-4">
        <div className="cinematic-heading">
          <p className="editorial-kicker text-[0.7rem] font-semibold uppercase text-muted-foreground">Archivio personale</p>
          <h1 className="font-display text-4xl font-semibold italic">Le mie ricette</h1>
        </div>
        <Button asChild>
          <Link href="/ricette/new">Crea Ricetta</Link>
        </Button>
      </div>

      {/* === SEARCH BAR === */}
      <div className="shell-panel rounded-[1.75rem] px-4 py-4 sm:px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            id="search-recipes"
            type="text"
            placeholder="Cerca per nome ricetta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 w-full"
            aria-label="Cerca ricette"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cancella ricerca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="mt-2 text-sm text-muted-foreground">
            {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'} per &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* === FILTER TOGGLE === */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
              filtersOpen || activeFilterCount > 0
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground hover:bg-muted/80'
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtra
            {activeFilterCount > 0 && (
              <span className="ml-1 rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-xs font-bold leading-none">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={cn('w-3 h-3 transition-transform', filtersOpen && 'rotate-180')} />
          </button>

          {/* Active filter chips */}
          {selectedSeason !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
              {SEASON_ICONS[selectedSeason]} {SEASON_LABELS[selectedSeason]}
              <button onClick={() => setSelectedSeason('all')} aria-label="Rimuovi filtro stagione">
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          )}
          {selectedCategoryId !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
              {selectedCategory?.icon}{' '}
              {selectedCategory?.name}
              <button onClick={() => setSelectedCategoryId('all')} aria-label="Rimuovi filtro categoria">
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          )}
          {selectedSubcategoryId !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
              {selectedSubcategory?.name}
              <button onClick={() => setSelectedSubcategoryId('all')} aria-label="Rimuovi filtro sottocategoria">
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          )}
          {activeFilterCount > 1 && (
            <button
              onClick={clearFilters}
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Cancella tutti
            </button>
          )}
        </div>

        {/* Collapsible filter panel */}
        <div className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none',
          filtersOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}>
          <div className="overflow-hidden">
            <div className="shell-panel rounded-[1.6rem] p-4 space-y-4">
              {/* Season buttons */}
              <div>
                <p className="editorial-kicker mb-2 text-xs font-semibold uppercase text-muted-foreground">Stagione</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedSeason('all')}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                      selectedSeason === 'all'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground hover:bg-secondary border border-border'
                    )}
                  >
                    Tutte ({recipes.length})
                  </button>
                  {ALL_SEASONS.map((season) => {
                    return (
                      <button
                        key={season}
                        onClick={() => setSelectedSeason(season)}
                        className={cn(
                          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                          selectedSeason === season
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-foreground hover:bg-secondary border border-border'
                        )}
                      >
                        <span className="mr-1.5">{SEASON_ICONS[season]}</span>
                        {SEASON_LABELS[season]} ({recipeCountBySeason[season]})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category + Subcategory dropdowns */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label htmlFor="category-filter" className="editorial-kicker mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                    Categoria
                  </label>
                  <select
                    id="category-filter"
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  >
                    <option value="all">Tutte le categorie ({recipes.length})</option>
                    {categories.map((cat) => {
                      return (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name} ({recipeCountByCategoryId[cat.id] ?? 0})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex-1">
                  <label htmlFor="subcategory-filter" className="editorial-kicker mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                    Sottocategoria
                  </label>
                  <select
                    id="subcategory-filter"
                    value={selectedSubcategoryId}
                    onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                    disabled={selectedCategoryId === 'all'}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-muted disabled:cursor-not-allowed"
                  >
                    <option value="all">
                      {selectedCategoryId === 'all'
                        ? 'Seleziona prima una categoria'
                        : `Tutte le sottocategorie (${recipeCountByCategoryId[selectedCategoryId] ?? 0})`}
                    </option>
                    {availableSubcategories.map((sub) => {
                      return (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({recipeCountBySubcategoryId[sub.id] ?? 0})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === RECIPE GRID === */}
      {recipes.length === 0 ? (
        <EditorialEmptyState
          icon={<Search className="h-5 w-5" />}
          eyebrow="Primo piatto"
          title="Il ricettario aspetta la prima ricetta"
          description="Inizia con un piatto che fai spesso: da li' la raccolta prende ritmo e diventa davvero tua."
          action={
            <Button asChild>
              <Link href="/ricette/new">Crea la tua prima ricetta</Link>
            </Button>
          }
        />
      ) : filteredRecipes.length === 0 ? (
        <EditorialEmptyState
          icon={<Search className="h-5 w-5" />}
          eyebrow="Filtri"
          title="Qui non c'e' ancora nulla"
          description={
            searchQuery
              ? `Nessun risultato per "${searchQuery}". Prova un nome piu' ampio o libera la ricerca.`
              : 'I filtri attuali stringono troppo la selezione. Allargali e lascia riemergere il ricettario.'
          }
          action={
            searchQuery ? (
              <Button onClick={() => setSearchQuery('')} variant="outline">
                Cancella ricerca
              </Button>
            ) : activeFilterCount > 0 ? (
              <Button onClick={clearFilters} variant="outline">
                Cancella filtri
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe, i) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              categories={categories}
              subcategories={subcategories}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
