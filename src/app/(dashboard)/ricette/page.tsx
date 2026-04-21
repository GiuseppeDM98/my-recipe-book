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
import { Search } from 'lucide-react';

/**
 * Recipe List Page - Cascading Filter Architecture
 *
 * Three-level filtering: Season → Category → Subcategory
 * - Season filter: Independent (all recipes)
 * - Category filter: Narrows season results
 * - Subcategory filter: Narrows category results (depends on category selection)
 *
 * Dependency chain: Subcategory availability dynamically updates based on selected category.
 *
 * Performance: useMemo memoizes filtered results to prevent unnecessary recalculations
 * on large recipe lists. Re-runs only when recipes or filter selections change.
 *
 * Data loading: Eager load all categories/subcategories for instant filter response
 * (trade-off: slightly slower initial load for better UX).
 */

/**
 * Recipe list with three-level filtering (season, category, subcategory).
 *
 * Performance: useMemo memoizes filtered results to avoid recalculation.
 * Data loading: Eager load all categories/subcategories upfront (not lazy)
 * for instant filter response without loading delays.
 */
export default function RecipesPage() {
  const { recipes, loading, error } = useRecipes();
  const { user } = useAuth();
  const [selectedSeason, setSelectedSeason] = useState<Season | 'all'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Load categories once — shared cache key ensures a second visit costs no extra reads.
  const { data: categories = [] } = useQuery({
    enabled: !!user,
    queryKey: ['categories', user?.uid ?? ''],
    queryFn: () => getUserCategories(user!.uid),
  });

  // Load ALL subcategories upfront so every category filter responds instantly.
  // Waits for categories to be populated; queryKey includes category IDs so the
  // cache invalidates automatically when categories change (add/delete).
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
   *
   * Filter order rationale:
   * - Search first (narrows entire dataset by title)
   * - Season/Category/Subcategory refine search results
   *
   * Cascading filter pattern: Each filter depends on previous ones.
   * Search is independent, season narrows search results,
   * category narrows season results, subcategory narrows category results.
   *
   * Performance: useMemo prevents recalculation unless dependencies change.
   * With 1000+ recipes, re-filtering on every keystroke would cause lag.
   *
   * Dependencies: Re-runs only when recipes or filter selections change.
   */
  const filteredRecipes = useMemo(() => {
    let filtered = recipes;

    // Filter by search query (title only)
    if (searchQuery.trim()) {
      filtered = filtered.filter(recipe =>
        matchesSearch(searchQuery, recipe.title)
      );
    }

    // Filter by season (supports both old 'season' and new 'seasons' fields)
    if (selectedSeason !== 'all') {
      filtered = filtered.filter(recipe => {
        // New format: check if season in array
        if (recipe.seasons) {
          return recipe.seasons.includes(selectedSeason);
        }
        // Old format: exact match (backward compatibility for unmigrated recipes)
        if (recipe.season) {
          return recipe.season === selectedSeason;
        }
        return false;
      });
    }

    // Filter by category
    if (selectedCategoryId !== 'all') {
      filtered = filtered.filter(recipe => recipe.categoryId === selectedCategoryId);
    }

    // Filter by subcategory
    if (selectedSubcategoryId !== 'all') {
      filtered = filtered.filter(recipe => recipe.subcategoryId === selectedSubcategoryId);
    }

    return filtered;
  }, [recipes, searchQuery, selectedSeason, selectedCategoryId, selectedSubcategoryId]);

  /**
   * Dynamically filters subcategories based on selected category.
   *
   * Why: Prevents user from selecting subcategories from wrong category.
   *
   * Returns: All subcategories if no category selected, filtered otherwise.
   */
  const availableSubcategories = useMemo(() => {
    if (selectedCategoryId === 'all') {
      return subcategories;
    }
    return subcategories.filter(sub => sub.categoryId === selectedCategoryId);
  }, [subcategories, selectedCategoryId]);

  // Reset subcategory filter when category changes because:
  // 1. Selected subcategory might not belong to new category
  // 2. Showing "all subcategories" for new category is clearer UX
  // The check (currentSubInNewCat) preserves selection if it's still valid.
  useEffect(() => {
    if (selectedCategoryId === 'all') {
      setSelectedSubcategoryId('all');
    } else {
      // Check if current subcategory belongs to the new category
      const currentSubInNewCat = availableSubcategories.some(
        sub => sub.id === selectedSubcategoryId
      );
      if (!currentSubInNewCat) {
        setSelectedSubcategoryId('all');
      }
    }
  }, [selectedCategoryId, selectedSubcategoryId, availableSubcategories]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <p className="text-red-500">Errore nel caricamento delle ricette: {error}</p>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Le mie ricette</h1>
        <Button asChild>
          <Link href="/ricette/new">Crea Ricetta</Link>
        </Button>
      </div>

      {/* === SEARCH BAR === */}
      <div className="mb-6">
        <label htmlFor="search-recipes" className="block text-sm font-medium text-gray-700 mb-2">
          Cerca ricette
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            id="search-recipes"
            type="text"
            placeholder="Cerca per nome ricetta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 w-full"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
              aria-label="Cancella ricerca"
            >
              ×
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-sm text-gray-500 mt-2">
            {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'} per &quot;{searchQuery}&quot;
          </p>
        )}
      </div>

      {/* === CATEGORY/SUBCATEGORY FILTERS === */}
      <div className="mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Category Dropdown */}
          <div className="flex-1">
            <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per categoria:
            </label>
            <select
              id="category-filter"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
              className="w-full px-4 py-2 border border-input rounded-lg bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
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

          {/* Subcategory Dropdown */}
          <div className="flex-1">
            <label htmlFor="subcategory-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filtra per sottocategoria:
            </label>
            <select
              id="subcategory-filter"
              value={selectedSubcategoryId}
              onChange={(e) => setSelectedSubcategoryId(e.target.value)}
              disabled={selectedCategoryId === 'all'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-muted disabled:cursor-not-allowed"
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

      {/* === SEASON FILTER === */}
      <div className="mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Filtra per stagione:</span>
          <button
            onClick={() => setSelectedSeason('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedSeason === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tutte ({recipes.length})
          </button>
          {ALL_SEASONS.map((season) => {
            // Count recipes with this season (handle both old and new fields)
            const count = recipes.filter(r =>
              r.seasons?.includes(season) || r.season === season
            ).length;
            return (
              <button
                key={season}
                onClick={() => setSelectedSeason(season)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSeason === season
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span className="mr-2">{SEASON_ICONS[season]}</span>
                {SEASON_LABELS[season]} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* === RECIPE GRID === */}
      {recipes.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-semibold">Nessuna ricetta trovata</h3>
          <p className="text-gray-500 mt-2">Inizia a creare la tua prima ricetta!</p>
          <Button asChild className="mt-4">
            <Link href="/ricette/new">Crea la tua prima ricetta</Link>
          </Button>
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-semibold">Nessuna ricetta trovata</h3>
          <p className="text-gray-500 mt-2">
            {searchQuery
              ? `Nessun risultato per "${searchQuery}". Prova con termini diversi.`
              : 'Prova a selezionare filtri diversi o crea una nuova ricetta.'}
          </p>
          {searchQuery && (
            <Button
              onClick={() => setSearchQuery('')}
              variant="outline"
              className="mt-4"
            >
              Cancella ricerca
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              categories={categories}
              subcategories={subcategories}
            />
          ))}
        </div>
      )}
    </div>
  );
}