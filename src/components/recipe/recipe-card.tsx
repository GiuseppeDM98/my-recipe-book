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
      className="group block animate-fade-up motion-reduce:animate-none scroll-reveal"
      style={{ animationDelay: delay }}
    >
      <article className={cn(
        'shell-panel relative h-full rounded-[1.5rem] p-5',
        'transition-[shadow,transform,border-color] duration-300 ease-out motion-reduce:transition-none',
        'hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_28px_54px_-34px_oklch(var(--foreground)/0.38)]',
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
          <div className="relative z-10 mb-3">
            <span
              className="editorial-kicker inline-flex items-center gap-1 text-[0.68rem] font-semibold uppercase"
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
        <h2 className="relative z-10 mb-2 pr-8 font-display text-xl font-semibold italic leading-snug transition-colors group-hover:text-primary">
          {recipe.title}
        </h2>

        {/* Description */}
        {recipe.description && (
          <p className="relative z-10 mb-4 text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {recipe.description}
          </p>
        )}

        {/* Footer meta — time + servings */}
        {(recipe.totalTime || recipe.servings) && (
          <div className="relative z-10 mt-auto flex items-center gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
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
