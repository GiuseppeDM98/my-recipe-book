'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { getRecipe } from '@/lib/firebase/firestore';
import { RecipeForm } from '@/components/recipe/recipe-form';
import { Spinner } from '@/components/ui/spinner';
import { useQuery } from '@tanstack/react-query';

export default function EditRecipePage() {
  const { id } = useParams();
  const { user } = useAuth();

  const recipeId = id as string;

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    enabled: !!user && !!recipeId,
    // Same key as RecipePage and CookingModePage — all three share the cache,
    // so opening edit after viewing the detail page costs zero extra reads.
    queryKey: ['recipe', recipeId, user?.uid ?? ''],
    queryFn: () => getRecipe(recipeId, user!.uid),
  });

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;
  }

  if (error) {
    return <p className="text-red-500">Errore nel caricamento della ricetta.</p>;
  }

  if (!recipe) {
    return <p>Ricetta non trovata.</p>;
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Modifica ricetta</h1>
      <RecipeForm mode="edit" recipe={recipe} />
    </div>
  );
}
