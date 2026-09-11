'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { updateRecipe } from '@/lib/firebase/firestore';
import { getAISectionProposalForRecipe } from '@/lib/utils/recipe-parser';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';
import {
  applySectionAssignments,
  SectionProposal,
} from '@/lib/utils/section-assignments';
import { Recipe } from '@/types';

/**
 * Drives the "Organizza in sezioni" action on the recipe detail page.
 *
 * TWO STEPS ON PURPOSE:
 * `propose` asks the model how the recipe could be split and shows the answer; `apply`
 * writes it only after the user confirms. The AI is rearranging a recipe the user
 * already owns and may have cooked from, so the split gets reviewed before it lands —
 * unlike the calorie estimate, which is an isolated number.
 *
 * "Not reorganizable" is a success, not an error: some recipes really are single-
 * component, and the user is told so without anything being written.
 */
export function useReorganizeRecipe() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // The proposal under review, held between the two mutations. Non-null means the
  // preview dialog is open.
  const [pendingProposal, setPendingProposal] = useState<SectionProposal | null>(null);

  const propose = useMutation({
    mutationFn: async (recipe: Recipe) => {
      if (!user) throw new Error('Autenticazione richiesta');
      return getAISectionProposalForRecipe(recipe);
    },
    onSuccess: result => {
      if (result.reorganized === 'error') {
        toast.error('Impossibile organizzare la ricetta in questo momento.');
        return;
      }

      if (!result.reorganized) {
        toast('La ricetta è già ben organizzata così com\'è.', { icon: 'ℹ️' });
        return;
      }

      setPendingProposal(result.proposal);
    },
    onError: () => {
      toast.error('Impossibile organizzare la ricetta in questo momento.');
    },
  });

  const apply = useMutation({
    mutationFn: async ({ recipe, proposal }: { recipe: Recipe; proposal: SectionProposal }) => {
      if (!user) throw new Error('Autenticazione richiesta');

      const { ingredients, steps } = applySectionAssignments(
        recipe.ingredients,
        recipe.steps,
        proposal
      );

      await updateRecipe(recipe.id, { ingredients, steps });

      const sectionCount = new Set(proposal.ingredientSections.map(a => a.section)).size;
      return { recipeId: recipe.id, sectionCount };
    },
    onSuccess: ({ recipeId, sectionCount }) => {
      if (!user) return;

      // Both queries feed a view of this recipe: the detail page reads the single-recipe
      // key, the cookbook grid reads the list.
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId, user.uid] });
      queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });

      setPendingProposal(null);
      toast.success(`Ricetta organizzata in ${sectionCount} sezioni`);
    },
    onError: () => {
      toast.error('Impossibile salvare le sezioni in questo momento.');
    },
  });

  return {
    propose,
    apply,
    pendingProposal,
    /** Closes the preview without writing. Ignored while the write is in flight. */
    dismissProposal: () => {
      if (!apply.isPending) setPendingProposal(null);
    },
  };
}
