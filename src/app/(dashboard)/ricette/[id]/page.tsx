'use client';

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { getRecipe, deleteRecipe } from '@/lib/firebase/firestore';
import { RecipeDetail } from '@/components/recipe/recipe-detail';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { recipesQueryKey } from '@/lib/hooks/useRecipes';

export default function RecipePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const recipeId = id as string;

  const {
    data: recipe,
    isLoading,
    error,
  } = useQuery({
    enabled: !!user && !!recipeId,
    // Shared query key with the edit and cooking pages — navigating between
    // them reuses the same cached document instead of making extra reads.
    queryKey: ['recipe', recipeId, user?.uid ?? ''],
    queryFn: () => getRecipe(recipeId, user!.uid),
  });

  const handleDelete = async () => {
    if (window.confirm('Sei sicuro di voler eliminare questa ricetta? Le cotture già concluse resteranno nello storico statistiche.')) {
      try {
        await deleteRecipe(recipeId);
        // Invalidate the list so /ricette reflects the deletion immediately.
        if (user) queryClient.invalidateQueries({ queryKey: recipesQueryKey(user.uid) });
        router.push('/ricette');
      } catch {
        alert('Errore nell\'eliminazione della ricetta.');
      }
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;
  }

  if (error) {
    return <p className="text-red-500">Errore nel caricamento della ricetta.</p>;
  }

  if (!recipe) {
    return <p>Ricetta non trovata o non autorizzata.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap justify-end gap-2 sm:gap-4 mb-4">
        <Button asChild size="sm" className="sm:h-10 sm:px-4 sm:py-2">
          <Link href={`/ricette/${id}/edit`}>Modifica</Link>
        </Button>
        <Button variant="destructive" size="sm" className="sm:h-10 sm:px-4 sm:py-2" onClick={handleDelete}>
          Elimina
        </Button>
        <Button asChild variant="secondary" size="sm" className="sm:h-10 sm:px-4 sm:py-2">
          <Link href={`/ricette/${id}/cooking`}>Modalità Cottura</Link>
        </Button>
      </div>
      <RecipeDetail recipe={recipe} />
    </div>
  );
}
