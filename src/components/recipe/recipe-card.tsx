'use client';

import { Recipe, Category } from '@/types';
import Link from 'next/link';
import { Clock, Users, Flame } from 'lucide-react';
import { SEASON_ICONS, SEASON_LABELS } from '@/lib/constants/seasons';
import { cn } from '@/lib/utils/cn';
import { getRecipeCategoryIds } from '@/lib/utils/recipe-categories';

// Cap visible category badges so 3+ categories don't overflow the card on mobile.
const MAX_VISIBLE_CATEGORY_BADGES = 2;

interface RecipeCardProps {
  recipe: Recipe;
  categories?: Category[];
  /** Stagger index: delays the entrance animation by index × 50ms (max 350ms) */
  index?: number;
}

export function RecipeCard({ recipe, categories = [], index = 0 }: RecipeCardProps) {
  // Cap stagger delay at 350ms so late cards don't feel laggy on large collections
  const delay = `${Math.min(index * 50, 350)}ms`;
  const recipeCategories = getRecipeCategoryIds(recipe)
    .map(id => categories.find(cat => cat.id === id))
    .filter((cat): cat is Category => Boolean(cat));
  const visibleCategories = recipeCategories.slice(0, MAX_VISIBLE_CATEGORY_BADGES);
  const hiddenCategoryCount = recipeCategories.length - visibleCategories.length;

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
        'shell-panel relative h-full rounded-[1.5rem] p-5',
        'transition-[transform,border-color] duration-300 ease-out motion-reduce:transition-none',
        'hover:-translate-y-1 hover:border-primary/20 hover:shadow-[0_28px_54px_-34px_oklch(var(--foreground)/0.38)]',
        // will-change activated only on hover so we don't create a compositing layer per card at rest.
        // On mobile (no hover), this never fires — avoids GPU memory pressure from 20+ idle layers.
        'group-hover:will-change-transform'
      )}>
        {/* Season badges — top-right corner */}
        {seasonsToShow.length > 0 && (
          <div className="absolute top-4 right-4 flex gap-1">
            {seasonsToShow.map(season => (
              <span
                key={season}
                className="text-lg"
                role="img"
                aria-label={`Stagione: ${SEASON_LABELS[season]}`}
                title={SEASON_LABELS[season]}
              >
                {SEASON_ICONS[season]}
              </span>
            ))}
          </div>
        )}

        {/* Category badges — cap at 2 visible + "+N" so 3+ categories don't overflow on mobile */}
        {visibleCategories.length > 0 && (
          <div className="relative z-10 mb-3 flex flex-wrap items-center gap-1.5">
            {visibleCategories.map(category => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide"
                style={{
                  color: category.color,
                  backgroundColor: category.color ? `${category.color}1a` : undefined,
                }}
              >
                {category.icon && <span>{category.icon}</span>}
                {category.name}
              </span>
            ))}
            {hiddenCategoryCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[0.68rem] font-semibold text-muted-foreground">
                +{hiddenCategoryCount}
              </span>
            )}
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

        {/* Footer meta — time + servings + calories. Calories are simply absent when
            unknown: the whole card is a <Link>, so an estimate button here would nest
            an interactive element inside an anchor. Estimating happens on the detail page. */}
        {(recipe.totalTime || recipe.servings || recipe.caloriesPerServing) && (
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
            {(recipe.totalTime || recipe.servings) && recipe.caloriesPerServing && <span>·</span>}
            {recipe.caloriesPerServing && (
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-primary/70" />
                {recipe.caloriesPerServing} kcal
              </span>
            )}
          </div>
        )}
      </article>
    </Link>
  );
}
