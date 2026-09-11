'use client';

import { ShoppingBasket, Flame, ListTree } from 'lucide-react';
import { Recipe } from '@/types';
import { IngredientListCollapsible } from './ingredient-list-collapsible';
import { StepsListCollapsible } from './steps-list-collapsible';
import { SectionProposalDialog } from './section-proposal-dialog';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/lib/hooks/useAuth';
import { useAddToAdHocShoppingList } from '@/lib/hooks/useAddToAdHocShoppingList';
import { useEstimateCalories } from '@/lib/hooks/useEstimateCalories';
import { useReorganizeRecipe } from '@/lib/hooks/useReorganizeRecipe';
import { hasNamedSections, orderedSectionNamesFromSteps } from '@/lib/utils/section-assignments';

/**
 * Below these counts a recipe has no room for two components of two or three items
 * each, so the model would answer "not reorganizable" and the call would be wasted.
 */
const MIN_INGREDIENTS_TO_REORGANIZE = 6;
const MIN_STEPS_TO_REORGANIZE = 4;

interface RecipeDetailProps {
  recipe: Recipe;
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const originalServings = recipe.servings || 4;
  const { user } = useAuth();
  const addToAdHocShoppingList = useAddToAdHocShoppingList();
  const estimateCalories = useEstimateCalories();
  const reorganize = useReorganizeRecipe();
  const hasIngredients = recipe.ingredients.length > 0;

  // The steps know the cooking order; the ingredient array, on a reorganized recipe,
  // no longer does. Let the former drive both columns so they can't disagree.
  const orderedSections = orderedSectionNamesFromSteps(recipe.steps);

  // Only offered on flat recipes with enough material to actually split.
  const canReorganize =
    !!user &&
    !hasNamedSections(recipe) &&
    recipe.ingredients.length >= MIN_INGREDIENTS_TO_REORGANIZE &&
    recipe.steps.length >= MIN_STEPS_TO_REORGANIZE;

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
    <div className="max-w-5xl mx-auto">
      <div className="shell-panel rounded-[2rem] px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-6 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={!hasIngredients || !user || addToAdHocShoppingList.isPending}
            onClick={() => addToAdHocShoppingList.mutate(recipe)}
            className="w-full sm:w-auto"
          >
            {addToAdHocShoppingList.isPending ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <ShoppingBasket className="mr-2 h-4 w-4" />
            )}
            Voglio preparare questo
          </Button>
        </div>

        <div className="cinematic-heading">
          <h1 className="mb-4 font-display text-3xl font-semibold italic leading-tight sm:text-4xl lg:text-5xl">{recipe.title}</h1>
          {recipe.description && (
            <p className="mb-6 font-display text-lg italic text-muted-foreground">{recipe.description}</p>
          )}
        </div>

        {/* Season Badges (horizontal layout) */}
        {seasonsToShow.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {seasonsToShow.map(season => (
              <div
                key={season}
                className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/85 px-4 py-2 shadow-[0_16px_30px_-26px_oklch(var(--primary)/0.7)]"
              >
                <span className="text-2xl">{SEASON_ICONS[season]}</span>
                <span className="font-medium text-primary">{SEASON_LABELS[season]}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recipe meta — inline editorial row, no identical boxes */}
        <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border/70 pb-6">
          {recipe.servings && (
            <div>
              <span className="text-2xl font-bold tabular-nums">{recipe.servings}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">porzioni</span>
            </div>
          )}
          {recipe.prepTime && (
            <div>
              <span className="text-2xl font-bold tabular-nums">{recipe.prepTime}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">min prep.</span>
            </div>
          )}
          {recipe.cookTime && (
            <div>
              <span className="text-2xl font-bold tabular-nums">{recipe.cookTime}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">min cottura</span>
            </div>
          )}
          {recipe.totalTime && (
            <div>
              <span className="text-2xl font-bold tabular-nums text-primary">{recipe.totalTime}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">min totali</span>
            </div>
          )}
          {/* Calories: the estimate when we have one, otherwise the action that produces
              it. A "—" placeholder in a row of large numbers reads as broken data. */}
          {recipe.caloriesPerServing ? (
            <div>
              <span className="text-2xl font-bold tabular-nums">{recipe.caloriesPerServing}</span>
              <span className="ml-1.5 text-sm text-muted-foreground">kcal / porz.</span>
            </div>
          ) : (
            hasIngredients && user && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={estimateCalories.isPending}
                onClick={() => estimateCalories.mutate(recipe)}
                className="h-auto gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {estimateCalories.isPending ? (
                  <>
                    <Spinner size="sm" />
                    Stimo le calorie…
                  </>
                ) : (
                  <>
                    <Flame className="h-4 w-4" />
                    Stima calorie
                  </>
                )}
              </Button>
            )
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <h2 className="mb-4 font-display text-2xl font-semibold italic">Ingredienti</h2>
            {canReorganize && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={reorganize.propose.isPending}
                onClick={() => reorganize.propose.mutate(recipe)}
                className="mb-3 h-auto gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
              >
                {reorganize.propose.isPending ? (
                  <>
                    <Spinner size="sm" />
                    Analizzo la ricetta…
                  </>
                ) : (
                  <>
                    <ListTree className="h-4 w-4" />
                    Organizza in sezioni
                  </>
                )}
              </Button>
            )}
            <IngredientListCollapsible
              ingredients={recipe.ingredients}
              orderedSections={orderedSections}
              defaultExpanded={false}
            />
          </div>
          <div className="lg:col-span-2">
            <h2 className="mb-4 font-display text-2xl font-semibold italic">Preparazione</h2>
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
            <h2 className="mb-4 font-display text-2xl font-semibold italic">Note</h2>
            <p className="whitespace-pre-line text-foreground">{recipe.notes}</p>
          </div>
        )}
      </div>

      <SectionProposalDialog
        proposal={reorganize.pendingProposal}
        ingredients={recipe.ingredients}
        steps={recipe.steps}
        isApplying={reorganize.apply.isPending}
        onCancel={reorganize.dismissProposal}
        onApply={() => {
          if (reorganize.pendingProposal) {
            reorganize.apply.mutate({ recipe, proposal: reorganize.pendingProposal });
          }
        }}
      />
    </div>
  );
}
