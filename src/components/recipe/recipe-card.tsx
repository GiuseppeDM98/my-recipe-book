'use client';

import { Recipe, Category, Subcategory } from '@/types';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';

interface RecipeCardProps {
  recipe: Recipe;
  categories?: Category[];
  subcategories?: Subcategory[];
}

export function RecipeCard({ recipe, categories = [], subcategories = [] }: RecipeCardProps) {
  // Find category and subcategory for this recipe
  const category = categories.find(cat => cat.id === recipe.categoryId);
  const subcategory = subcategories.find(sub => sub.id === recipe.subcategoryId);

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
    <Link href={`/ricette/${recipe.id}`}>
      <Card className="hover:shadow-lg transition-shadow duration-200 relative">
        {/* Season Badges (multiple) */}
        {seasonsToShow.length > 0 && (
          <div className="absolute top-3 right-3 flex gap-1">
            {seasonsToShow.map(season => (
              <div
                key={season}
                className="text-xl bg-background/80 rounded-full p-1"
                title={SEASON_LABELS[season]}
              >
                {SEASON_ICONS[season]}
              </div>
            ))}
          </div>
        )}

        <CardHeader>
          <CardTitle>{recipe.title}</CardTitle>
          <CardDescription>{recipe.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Category and Subcategory */}
          {(category || subcategory) && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              {category && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium"
                  style={{
                    backgroundColor: `${category.color}20`,
                    color: category.color,
                  }}
                >
                  {category.icon && <span>{category.icon}</span>}
                  {category.name}
                </span>
              )}
              {subcategory && (
                <span className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-muted text-muted-foreground">
                  {subcategory.name}
                </span>
              )}
            </div>
          )}

          {/* Time and Servings */}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{recipe.totalTime ? `${recipe.totalTime} min` : ''}</span>
            <span>{recipe.servings ? `${recipe.servings} porzioni` : ''}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
