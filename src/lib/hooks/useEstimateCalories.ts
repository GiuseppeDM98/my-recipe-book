'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { updateRecipe } from '@/lib/firebase/firestore';
import { getAICalorieEstimateForRecipe } from '@/lib/utils/recipe-parser';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';
import { Recipe } from '@/types';

/**
 * Estimates and stores kcal per serving for a recipe that doesn't have a figure yet
 * ("Stima calorie" on the recipe detail page).
 *
 * A null estimate is a legitimate outcome, not a failure: the recipe is too vague to
 * estimate, so nothing is written and the user is told. Persisting a fabricated number
 * would be worse than leaving the field empty, because nothing downstream would ever
 * mark it as untrustworthy.
 *
 * Invalidates both the single-recipe and the recipe-list queries — the list cards show
 * calories too, and a stale list would keep displaying a recipe as un-estimated.
 */
export function useEstimateCalories() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipe: Recipe) => {
      if (!user) throw new Error('Autenticazione richiesta');

      const caloriesPerServing = await getAICalorieEstimateForRecipe(
        recipe.title,
        recipe.ingredients,
        recipe.servings
      );

      if (caloriesPerServing === null) {
        return { recipeId: recipe.id, caloriesPerServing: null };
      }

      await updateRecipe(recipe.id, { caloriesPerServing });
      return { recipeId: recipe.id, caloriesPerServing };
    },
    onSuccess: ({ recipeId, caloriesPerServing }) => {
      if (!user) return;

      if (caloriesPerServing === null) {
        toast('Ingredienti troppo vaghi per una stima affidabile. Puoi inserirla a mano in modifica.', {
          icon: 'ℹ️',
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId, user.uid] });
      queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });
      toast.success(`Stima: ${caloriesPerServing} kcal a porzione`);
    },
    onError: () => {
      toast.error('Impossibile stimare le calorie in questo momento.');
    },
  });
}
