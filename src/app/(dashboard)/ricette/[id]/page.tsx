'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { getRecipe, deleteRecipe } from '@/lib/firebase/firestore';
import { Recipe } from '@/types';
import { RecipeDetail } from '@/components/recipe/recipe-detail';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function RecipePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const router = useRouter();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && id) {
      const fetchRecipe = async () => {
        try {
          const fetchedRecipe = await getRecipe(id as string, user.uid);
          if (fetchedRecipe) {
            setRecipe(fetchedRecipe);
          } else {
            setError('Ricetta non trovata o non autorizzata.');
          }
        } catch (err) {
          setError('Errore nel caricamento della ricetta.');
        } finally {
          setLoading(false);
        }
      };
      fetchRecipe();
    }
  }, [id, user]);

  const handleDelete = async () => {
    if (window.confirm('Sei sicuro di voler eliminare questa ricetta? Le cotture già concluse resteranno nello storico statistiche.')) {
      try {
        await deleteRecipe(id as string);
        router.push('/ricette');
      } catch (err) {
        alert('Errore nell\'eliminazione della ricetta.');
      }
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-full"><Spinner size="lg" /></div>;
  }

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  if (!recipe) {
    return <p>Ricetta non trovata.</p>;
  }

  return (
    <div>
      <div className="flex justify-end gap-4 mb-4">
        <Button asChild>
          <Link href={`/ricette/${id}/edit`}>Modifica</Link>
        </Button>
        <Button variant="destructive" onClick={handleDelete}>
          Elimina
        </Button>
        <Button asChild variant="secondary">
          <Link href={`/ricette/${id}/cooking`}>Modalità Cottura</Link>
        </Button>
      </div>
      <RecipeDetail recipe={recipe} />
    </div>
  );
}
