'use client';

import { useMemo } from 'react';
import { ChefHat } from 'lucide-react';
import { PantryItem } from '@/types/pantry';
import { Recipe } from '@/types';
import { cn } from '@/lib/utils/cn';

interface CookableSuggestionsProps {
  pantryItems: PantryItem[];
  recipes: Recipe[];
}

type CookableStatus = 'completa' | 'quasi' | 'parziale';

interface CookableRecipe {
  recipe: Recipe;
  have: number;
  total: number;
  status: CookableStatus;
}

function getStatus(have: number, total: number): CookableStatus {
  if (have === total) return 'completa';
  if (have >= total - 1) return 'quasi';
  return 'parziale';
}

const STATUS_LABELS: Record<CookableStatus, string> = {
  completa: 'Hai tutto',
  quasi: 'Quasi completa',
  parziale: 'Parziale',
};

const STATUS_COLORS: Record<CookableStatus, string> = {
  completa: 'text-accent-foreground',
  quasi: 'text-foreground',
  parziale: 'text-muted-foreground',
};

export function CookableSuggestions({ pantryItems, recipes }: CookableSuggestionsProps) {
  const pantryNames = useMemo(
    () => new Set(pantryItems.filter(i => i.qty > 0).map(i => i.name.toLowerCase().trim())),
    [pantryItems]
  );

  const cookable = useMemo<CookableRecipe[]>(() => {
    return recipes
      .map(recipe => {
        const total = recipe.ingredients.length;
        if (total === 0) return null;
        const have = recipe.ingredients.filter(ing =>
          pantryNames.has(ing.name.toLowerCase().trim())
        ).length;
        if (have === 0) return null;
        return { recipe, have, total, status: getStatus(have, total) };
      })
      .filter((r): r is CookableRecipe => r !== null)
      .sort((a, b) => b.have / b.total - a.have / a.total)
      .slice(0, 4);
  }, [recipes, pantryNames]);

  if (cookable.length === 0) return null;

  return (
    <div className="rounded-2xl bg-accent/10 border border-accent/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <ChefHat className="h-4 w-4 text-accent-foreground" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-accent-foreground">
          Con quello che hai
        </h2>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cookable.map(({ recipe, have, total, status }) => (
          <div
            key={recipe.id}
            className="rounded-xl bg-background/70 border border-border p-3 flex flex-col gap-1.5"
          >
            <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
              {recipe.title}
            </p>
            <div className="flex items-center justify-between gap-1 mt-auto">
              <span className="text-[10px] text-muted-foreground">
                {have}/{total} ingredienti
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold rounded-full px-1.5 py-0.5',
                  status === 'completa' && 'bg-accent/20 text-accent-foreground',
                  status === 'quasi' && 'bg-primary/10 text-primary',
                  status === 'parziale' && 'bg-muted text-muted-foreground'
                )}
              >
                {STATUS_LABELS[status]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
