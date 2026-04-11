'use client';

import { useEffect, useState } from 'react';
import { BarChart3, ChefHat, Clock3 } from 'lucide-react';
import { useAuth } from '@/lib/context/auth-context';
import {
  aggregateCookingHistoryByRecipe,
  getUserCookingHistory,
  RecipeCookingStat,
} from '@/lib/firebase/cooking-history';
import { CookingHistoryEntry } from '@/types';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

function formatHistoryDate(entry: CookingHistoryEntry | null): string {
  const date = entry?.completedAt?.toDate?.();
  if (!date) return 'Non disponibile';

  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatStatDate(stat: RecipeCookingStat | null): string {
  const date = stat?.lastCompletedAt?.toDate?.();
  if (!date) return 'Non disponibile';

  return date.toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function StatistichePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [historyEntries, setHistoryEntries] = useState<CookingHistoryEntry[]>([]);
  const [recipeStats, setRecipeStats] = useState<RecipeCookingStat[]>([]);

  useEffect(() => {
    if (!user) return;

    const loadStats = async () => {
      setLoading(true);

      try {
        const history = await getUserCookingHistory(user.uid);
        setHistoryEntries(history);
        setRecipeStats(aggregateCookingHistoryByRecipe(history));
      } catch (error) {
        console.error('Error loading cooking statistics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  const mostCookedRecipe = recipeStats[0] ?? null;
  const latestCompletion = historyEntries[0] ?? null;

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Statistiche</h1>
          <p className="text-muted-foreground">
            Una vista rapida delle ricette che cucini davvero piu&apos; spesso.
          </p>
        </div>
      </div>

      {historyEntries.length === 0 ? (
        <Card className="p-12 text-center">
          <ChefHat className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-semibold mb-2 text-gray-700">
            Nessuna statistica disponibile
          </h2>
          <p className="text-gray-500">
            Le statistiche compariranno dopo aver terminato almeno una cottura.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Cotture completate</p>
              <p className="text-3xl font-bold">{historyEntries.length}</p>
            </Card>

            <Card className="p-5">
              <p className="text-sm text-muted-foreground mb-1">Piatto piu&apos; cucinato</p>
              <p className="text-xl font-semibold">
                {mostCookedRecipe?.recipeTitle ?? 'Non disponibile'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {mostCookedRecipe?.completionCount ?? 0} volte
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock3 className="w-4 h-4" />
                Ultimo completamento
              </div>
              <p className="text-xl font-semibold">
                {latestCompletion?.recipeTitle ?? 'Non disponibile'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {formatHistoryDate(latestCompletion)}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-6">
            <Card className="p-5">
              <h2 className="text-xl font-semibold mb-4">Piatti preparati di piu&apos;</h2>
              <div className="space-y-3">
                {recipeStats.slice(0, 10).map((stat, index) => (
                  <div
                    key={stat.recipeId}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">#{index + 1}</p>
                      <p className="font-semibold truncate">{stat.recipeTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        Ultima volta: {formatStatDate(stat)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">{stat.completionCount}</p>
                      <p className="text-sm text-muted-foreground">cotture</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-xl font-semibold mb-4">Ultime cotture terminate</h2>
              <div className="space-y-3">
                {historyEntries.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-lg border px-4 py-3">
                    <p className="font-semibold">{entry.recipeTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      Terminata il {formatHistoryDate(entry)}
                    </p>
                    {entry.servings ? (
                      <p className="text-sm text-muted-foreground">
                        Porzioni: {entry.servings}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
