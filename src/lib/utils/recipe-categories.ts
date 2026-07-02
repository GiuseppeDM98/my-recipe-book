import type { Recipe } from '@/types';

/**
 * Dual-read categoria: preferisce categoryIds[]; fallback al legacy categoryId
 * per ricette pre-migrazione. Da usare OVUNQUE si legga la categoria di una ricetta.
 */
export function getRecipeCategoryIds(
  recipe: Pick<Recipe, 'categoryIds' | 'categoryId'>,
): string[] {
  if (recipe.categoryIds?.length) return recipe.categoryIds;
  return recipe.categoryId ? [recipe.categoryId] : [];
}
