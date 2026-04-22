'use client';

import { Recipe, Category, Subcategory } from '@/types';
import Link from 'next/link';
import { Clock, Users } from 'lucide-react';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';
import { cn } from '@/lib/utils/cn';

interface RecipeCardProps {
  recipe: Recipe;
  categories?: Category[];
  subcategories?: Subcategory[];
  /** Stagger index: delays the entrance animation by index × 50ms (max 350ms) */
  index?: number;
}

export function RecipeCard({ recipe, categories = [], subcategories = [], index = 0 }: RecipeCardProps) {
  // Cap stagger delay at 350ms so late cards don't feel laggy on large collections
  const delay = `${Math.min(index * 50, 350)}ms`;
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
    <Link
      href={`/ricette/${recipe.id}`}
      className="group block animate-fade-up motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    >
      <article className={cn(
        'relative h-full rounded-xl border border-border bg-card p-5',
        'transition-[shadow,transform] duration-200 ease-out motion-reduce:transition-none',
        'hover:shadow-md hover:-translate-y-0.5',
        'will-change-transform'
      )}>
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
            {recipe.totalTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-primary/70" />
                {recipe.totalTime} min
              </span>
            )}
            {recipe.totalTime && recipe.servings && <span>·</span>}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3 text-primary/70" />
                {recipe.servings} porz.
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  );
}
