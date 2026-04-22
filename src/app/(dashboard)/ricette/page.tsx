'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecipes } from '@/lib/hooks/useRecipes';
import { RecipeCard } from '@/components/recipe/recipe-card';
import { Spinner } from '@/components/ui/spinner';
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
      const all: Subcategory[] = [];
      for (const category of categories) {
        const subs = await getCategorySubcategories(category.id, user!.uid);
        all.push(...subs);
      }
      return all;
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
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <p className="text-destructive">Errore nel caricamento delle ricette: {error}</p>;
  }

  return (
    <div>
      {/* === PAGE HEADER === */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="font-display text-4xl font-semibold italic">Le mie ricette</h1>
        <Button asChild>
          <Link href="/ricette/new">Crea Ricetta</Link>
        </Button>
      </div>

      {/* === SEARCH BAR === */}
      <div className="mb-4">
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
          <p className="text-sm text-muted-foreground mt-2">
            {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'} per &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* === FILTER TOGGLE === */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
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
              {categories.find(c => c.id === selectedCategoryId)?.icon}{' '}
              {categories.find(c => c.id === selectedCategoryId)?.name}
              <button onClick={() => setSelectedCategoryId('all')} aria-label="Rimuovi filtro categoria">
                <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
              </button>
            </span>
          )}
          {selectedSubcategoryId !== 'all' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-sm font-medium">
              {subcategories.find(s => s.id === selectedSubcategoryId)?.name}
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
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              {/* Season buttons */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Stagione</p>
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
                    const count = recipes.filter(r =>
                      r.seasons?.includes(season) || r.season === season
                    ).length;
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
                        {SEASON_LABELS[season]} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Category + Subcategory dropdowns */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label htmlFor="category-filter" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
                      const count = recipes.filter(r => r.categoryId === cat.id).length;
                      return (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex-1">
                  <label htmlFor="subcategory-filter" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
                        : `Tutte le sottocategorie (${recipes.filter(r => r.categoryId === selectedCategoryId).length})`}
                    </option>
                    {availableSubcategories.map((sub) => {
                      const count = recipes.filter(r => r.subcategoryId === sub.id).length;
                      return (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({count})
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
        <div className="text-center py-16 rounded-xl bg-muted/30 border border-dashed border-border">
          <p className="text-4xl mb-4">📖</p>
          <h3 className="font-display text-2xl font-semibold italic mb-2">Il ricettario è vuoto</h3>
          <p className="text-muted-foreground mt-2 mb-6">Aggiungi la tua prima ricetta per iniziare la collezione.</p>
          <Button asChild>
            <Link href="/ricette/new">Crea la tua prima ricetta</Link>
          </Button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-muted/30 border border-dashed border-border">
          <p className="text-4xl mb-4">🔍</p>
          <h3 className="font-display text-2xl font-semibold italic mb-2">Nessuna ricetta trovata</h3>
          <p className="text-muted-foreground mt-2 mb-6">
            {searchQuery
              ? `Nessun risultato per "${searchQuery}". Prova con termini diversi.`
              : 'Prova a selezionare filtri diversi o crea una nuova ricetta.'}
          </p>
          {searchQuery ? (
            <Button onClick={() => setSearchQuery('')} variant="outline">
              Cancella ricerca
            </Button>
          ) : activeFilterCount > 0 ? (
            <Button onClick={clearFilters} variant="outline">
              Cancella filtri
            </Button>
          ) : null}
        </div>
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
