'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { addRecipeToAdHocShoppingList } from '@/lib/firebase/shopping-adhoc';
import { Recipe } from '@/types';

/**
 * Adds a recipe's ingredients to the global ad-hoc shopping list
 * ("Voglio preparare questo" on the recipe detail page).
 *
 * Invalidates both the ad-hoc query and the shopping list query (partial
 * match across all weeks) so an already-open lista della spesa reflects the
 * new group immediately.
 */
export function useAddToAdHocShoppingList() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (recipe: Recipe) => {
      if (!user) throw new Error('Autenticazione richiesta');
      return addRecipeToAdHocShoppingList(user.uid, recipe);
    },
    onSuccess: (result) => {
      if (!user) return;
      queryClient.invalidateQueries({ queryKey: ['adHocShopping', user.uid] });
      queryClient.invalidateQueries({ queryKey: ['shoppingList', user.uid] });
      toast.success(
        result === 'added'
          ? 'Ingredienti aggiunti alla lista della spesa'
          : 'Lista della spesa aggiornata'
      );
    },
    onError: () => {
      toast.error('Impossibile aggiungere gli ingredienti alla lista della spesa.');
    },
  });
}
