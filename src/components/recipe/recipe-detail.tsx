'use client';

import { Recipe } from '@/types';
import { IngredientListCollapsible } from './ingredient-list-collapsible';
import { StepsListCollapsible } from './steps-list-collapsible';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';

interface RecipeDetailProps {
  recipe: Recipe;
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const originalServings = recipe.servings || 4;

  /**
   * Determine which seasons to display.
   *
   * BACKWARD COMPATIBILITY:
   * Supports both old 'season' (single value) and new 'seasons' (array) formats.
   * During migration period, recipes may have either field.
   *
   * Priority: new 'seasons' array > old 'season' value > empty array
   */
  const seasonsToShow = recipe.seasons || (recipe.season ? [recipe.season] : []);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="font-display text-5xl font-semibold italic leading-tight mb-4">{recipe.title}</h1>
      {recipe.description && (
        <p className="font-display italic text-lg text-muted-foreground mb-6">{recipe.description}</p>
      )}

      {/* Season Badges (horizontal layout) */}
      {seasonsToShow.length > 0 && (
        <div className="mb-6 flex gap-2 flex-wrap">
          {seasonsToShow.map(season => (
            <div
              key={season}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 border border-primary-200 rounded-lg"
            >
              <span className="text-2xl">{SEASON_ICONS[season]}</span>
              <span className="font-medium text-primary-700">{SEASON_LABELS[season]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recipe meta — inline editorial row, no identical boxes */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-8 pb-6 border-b border-border">
        {recipe.servings && (
          <div>
            <span className="text-2xl font-bold tabular-nums">{recipe.servings}</span>
            <span className="text-sm text-muted-foreground ml-1.5">porzioni</span>
          </div>
        )}
        {recipe.prepTime && (
          <div>
            <span className="text-2xl font-bold tabular-nums">{recipe.prepTime}</span>
            <span className="text-sm text-muted-foreground ml-1.5">min prep.</span>
          </div>
        )}
        {recipe.cookTime && (
          <div>
            <span className="text-2xl font-bold tabular-nums">{recipe.cookTime}</span>
            <span className="text-sm text-muted-foreground ml-1.5">min cottura</span>
          </div>
        )}
        {recipe.totalTime && (
          <div>
            <span className="text-2xl font-bold tabular-nums text-primary">{recipe.totalTime}</span>
            <span className="text-sm text-muted-foreground ml-1.5">min totali</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <h2 className="font-display text-2xl font-semibold italic mb-4">Ingredienti</h2>
          <IngredientListCollapsible ingredients={recipe.ingredients} defaultExpanded={false} />
        </div>
        <div className="lg:col-span-2">
          <h2 className="font-display text-2xl font-semibold italic mb-4">Preparazione</h2>
          <StepsListCollapsible
            steps={recipe.steps}
            ingredients={recipe.ingredients}
            originalServings={originalServings}
            targetServings={originalServings}
            defaultExpanded={false}
          />
        </div>
      </div>

      {recipe.notes && (
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold italic mb-4">Note</h2>
          <p className="text-foreground whitespace-pre-line">{recipe.notes}</p>
        </div>
      )}
    </div>
  );
}
