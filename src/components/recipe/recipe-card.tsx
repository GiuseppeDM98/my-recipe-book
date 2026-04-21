'use client';

import { Recipe, Category, Subcategory } from '@/types';
import Link from 'next/link';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';

interface RecipeCardProps {
  recipe: Recipe;
  categories?: Category[];
  subcategories?: Subcategory[];
}

export function RecipeCard({ recipe, categories = [], subcategories = [] }: RecipeCardProps) {
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
    <Link href={`/ricette/${recipe.id}`} className="group block">
      <article className="relative h-full rounded-xl border border-border bg-card p-5 transition-shadow duration-200 hover:shadow-md">
        {/* Season badges — top-right corner */}
        {seasonsToShow.length > 0 && (
          <div className="absolute top-4 right-4 flex gap-1">
            {seasonsToShow.map(season => (
              <span
                key={season}
                className="text-lg"
                title={SEASON_LABELS[season]}
              >
                {SEASON_ICONS[season]}
              </span>
            ))}
          </div>
        )}

        {/* Category badge */}
        {category && (
          <div className="mb-3">
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide"
              style={{ color: category.color }}
            >
              {category.icon && <span>{category.icon}</span>}
              {category.name}
              {subcategory && (
                <span className="text-muted-foreground font-normal normal-case tracking-normal">
                  {' '}· {subcategory.name}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Title — editorial display font */}
        <h2 className="font-display text-xl font-semibold italic leading-snug mb-2 pr-8 group-hover:text-primary transition-colors">
          {recipe.title}
        </h2>

        {/* Description */}
        {recipe.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
            {recipe.description}
          </p>
        )}

        {/* Footer meta — time + servings */}
        {(recipe.totalTime || recipe.servings) && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-auto pt-3 border-t border-border">
            {recipe.totalTime && <span>{recipe.totalTime} min</span>}
            {recipe.totalTime && recipe.servings && <span>·</span>}
            {recipe.servings && <span>{recipe.servings} porzioni</span>}
          </div>
        )}
      </article>
    </Link>
  );
}
