'use client';

import { useAuth } from '@/lib/context/auth-context';
import { getUserCookingSessions, deleteCookingSession } from '@/lib/firebase/cooking-sessions';
import { getRecipe } from '@/lib/firebase/firestore';
import { CookingSession, Recipe } from '@/types';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import Link from 'next/link';
import { Trash2, ChefHat } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Active Cooking Sessions Dashboard
 *
 * Data pattern: Enrichment (sessions + joined recipe data)
 * - Sessions store only recipeId, not full recipe details
 * - We fetch recipe details separately to prevent data duplication
 * - Single source of truth: Recipe might be updated independently
 *
 * Why manual join: Firebase doesn't support joins, so we fetch related data
 * using Promise.all for parallel requests.
 *
 * Actions: Resume cooking or delete session
 */

interface CookingSessionWithRecipe extends CookingSession {
  recipe?: Recipe;
}

/**
 * Dashboard showing all active cooking sessions with progress tracking.
 *
 * Data loading: Fetches sessions then enriches with recipe details in parallel.
 *
 * Actions: Resume cooking (navigate to cooking mode) or delete session.
 */
export default function CottureInCorsoPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: sessions = [],
    isLoading,
  } = useQuery<CookingSessionWithRecipe[]>({
    enabled: !!user,
    queryKey: ['cookingSessions', user?.uid ?? ''],
    queryFn: async () => {
      const userSessions = await getUserCookingSessions(user!.uid);

      // Sessions store only recipeId, not full recipe data.
      // Reasons:
      // - Prevents data duplication (recipe might be updated)
      // - Keeps session documents small
      // - Single source of truth for recipe data
      //
      // Promise.all fetches all recipe details in parallel to minimise latency.
      return Promise.all(
        userSessions.map(async (session) => {
          const recipe = await getRecipe(session.recipeId, user!.uid);
          return { ...session, recipe: recipe || undefined };
        })
      );
    },
  });

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa sessione di cottura?')) {
      return;
    }

    try {
      await deleteCookingSession(sessionId);
      // Invalidate to reload the sessions list after deletion.
      queryClient.invalidateQueries({ queryKey: ['cookingSessions', user?.uid ?? ''] });
    } catch (error) {
      console.error('Error deleting cooking session:', error);
    }
  };

  /**
   * Computes completion percentage from checked items.
   *
   * Formula: (checkedIngredients + checkedSteps) / (totalIngredients + totalSteps) * 100
   *
   * Progress = completed items / total items. Both ingredients and steps count equally.
   * Example: Recipe with 10 ingredients + 5 steps = 15 total items.
   *
   * Returns: Rounded integer percentage (0-100) for display.
   */
  const calculateProgress = (session: CookingSessionWithRecipe) => {
    if (!session.recipe) return 0;

    const totalItems = session.recipe.ingredients.length + session.recipe.steps.length;
    if (totalItems === 0) return 0;

    const completedItems = session.checkedIngredients.length + session.checkedSteps.length;
    return Math.round((completedItems / totalItems) * 100);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ChefHat className="w-8 h-8 text-primary" />
        <h1 className="text-3xl font-bold">Cotture in Corso</h1>
      </div>

      {/* === EMPTY STATE === */}
      {sessions.length === 0 ? (
        <Card className="p-12 text-center">
          <ChefHat className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2 text-gray-600">
            Nessuna cottura in corso
          </h2>
          <p className="text-gray-500 mb-6">
            Inizia una nuova cottura dalla pagina di una ricetta
          </p>
          <Button asChild>
            <Link href="/ricette">Vai alle ricette</Link>
          </Button>
        </Card>
      ) : (
        /* === SESSION CARDS === */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sessions.map((session) => {
            const progress = calculateProgress(session);
            const recipe = session.recipe;

            if (!recipe) {
              return (
                <Card key={session.id} className="p-6">
                  <p className="text-gray-500">Ricetta non trovata</p>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteSession(session.id)}
                    className="mt-4"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Elimina
                  </Button>
                </Card>
              );
            }

            return (
              <Card key={session.id} className="p-6 hover:shadow-lg transition-shadow">
                <div className="mb-4">
                  <h3 className="text-xl font-semibold mb-2">{recipe.title}</h3>
                  <p className="text-sm text-gray-500">
                    Iniziata il{' '}
                    {session.startedAt?.toDate?.().toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium text-gray-700">Progresso</span>
                    <span className="text-sm font-semibold text-primary">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-primary h-2.5 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                  <div>
                    <p className="text-gray-600">Ingredienti</p>
                    <p className="font-semibold">
                      {session.checkedIngredients.length} / {recipe.ingredients.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-600">Step</p>
                    <p className="font-semibold">
                      {session.checkedSteps.length} / {recipe.steps.length}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button asChild className="flex-1">
                    <Link href={`/ricette/${recipe.id}/cooking`}>Continua</Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleDeleteSession(session.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
