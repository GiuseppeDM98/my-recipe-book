'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { updateRecipe } from '@/lib/firebase/firestore';
import { getAINutritionEstimateForRecipe } from '@/lib/utils/recipe-parser';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';
import { Recipe } from '@/types';

/**
 * Estimates and stores kcal, serving weight and macronutrients per serving for a recipe
 * ("Stima valori nutrizionali" on the recipe detail page).
 *
 * Fill-the-gaps: writes only the fields the recipe doesn't already have, so a re-estimate
 * (e.g. after adding macros to a recipe that already has manual kcal) never overwrites a
 * value already present. A field the model couldn't estimate is a legitimate outcome, not
 * a failure — nothing is written for it.
 *
 * Invalidates both the single-recipe and the recipe-list queries — the list cards show
 * calories too, and a stale list would keep displaying a recipe as un-estimated.
 */
export function useEstimateNutrition() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipe: Recipe) => {
      if (!user) throw new Error('Autenticazione richiesta');

      const estimate = await getAINutritionEstimateForRecipe(
        recipe.title,
        recipe.ingredients,
        recipe.servings
      );

      // Only fields missing on the recipe AND present in the estimate.
      // CAUTION: `== null` gate, never truthiness — 0 g of fat is legitimate.
      const updates: Partial<Recipe> = {};
      if (recipe.caloriesPerServing == null && estimate?.caloriesPerServing != null) {
        updates.caloriesPerServing = estimate.caloriesPerServing;
      }
      if (recipe.servingWeightGrams == null && estimate?.servingWeightGrams != null) {
        updates.servingWeightGrams = estimate.servingWeightGrams;
      }
      if (recipe.macrosPerServing == null && estimate?.macrosPerServing != null) {
        updates.macrosPerServing = estimate.macrosPerServing;
      }

      if (Object.keys(updates).length === 0) {
        return { recipeId: recipe.id, updates: null };
      }

      await updateRecipe(recipe.id, updates);
      return { recipeId: recipe.id, updates };
    },
    onSuccess: ({ recipeId, updates }) => {
      if (!user) return;

      if (updates === null) {
        toast('Ingredienti troppo vaghi per una stima affidabile. Puoi inserire i valori a mano in modifica.', {
          icon: 'ℹ️',
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId, user.uid] });
      queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });
      toast.success(
        updates.caloriesPerServing != null
          ? `Stima: ${updates.caloriesPerServing} kcal a porzione`
          : 'Valori nutrizionali stimati'
      );
    },
    onError: () => {
      toast.error('Impossibile stimare i valori nutrizionali in questo momento.');
    },
  });
}
