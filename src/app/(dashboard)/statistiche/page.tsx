'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/context/auth-context';
import {
  aggregateCookingHistoryByRecipe,
  getUserCookingHistory,
} from '@/lib/firebase/cooking-history';
import { CookingHistoryEntry } from '@/types';
import { Spinner } from '@/components/ui/spinner';

function formatDate(entry: { completedAt?: { toDate?: () => Date } } | null): string {
  const date = entry?.completedAt?.toDate?.();
  if (!date) return '—';
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function StatistichePage() {
  const { user } = useAuth();

  const { data: historyEntries = [], isLoading } = useQuery({
    enabled: !!user,
    queryKey: ['cookingHistory', user?.uid ?? ''],
    queryFn: () => getUserCookingHistory(user!.uid),
  });

  const recipeStats = aggregateCookingHistoryByRecipe(historyEntries);
  const mostCooked = recipeStats[0] ?? null;
  const latest = historyEntries[0] ?? null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      <div>
        <h1 className="font-display text-4xl font-semibold italic">Statistiche</h1>
        <p className="text-muted-foreground mt-1">Le tue abitudini in cucina</p>
      </div>

      {historyEntries.length === 0 ? (
        <div className="py-16 text-center rounded-xl bg-muted/30 border border-dashed border-border">
          <p className="text-5xl mb-4">📊</p>
          <h2 className="font-display text-2xl font-semibold italic mb-2">Nessuna statistica ancora</h2>
          <p className="text-muted-foreground">
            Le statistiche compariranno dopo aver terminato almeno una cottura.
          </p>
        </div>
      ) : (
        <>
          {/* Sommario editoriale — senza card identiche */}
          <div className="border-b pb-8 space-y-4">
            <div>
              <span className="text-7xl font-bold tabular-nums">{historyEntries.length}</span>
              <p className="text-muted-foreground mt-1 text-lg">
                {historyEntries.length === 1 ? 'cottura completata' : 'cotture completate'}
              </p>
            </div>

            {mostCooked && (
              <p className="text-lg text-foreground">
                Il piatto che prepari più spesso è{' '}
                <strong className="text-primary">{mostCooked.recipeTitle}</strong>
                {mostCooked.completionCount > 1 && (
                  <span className="text-muted-foreground"> — cucinato {mostCooked.completionCount} volte</span>
                )}
                .
              </p>
            )}

            {latest && (
              <p className="text-sm text-muted-foreground">
                Ultima cottura:{' '}
                <span className="font-medium text-foreground">{latest.recipeTitle}</span>
                {' '}· {formatDate(latest)}
              </p>
            )}
          </div>

          {/* Liste dettagliate */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-8">
            <div>
              <h2 className="font-display text-xl font-semibold italic mb-4">Piatti più preparati</h2>
              <div className="space-y-2">
                {recipeStats.slice(0, 10).map((stat, index) => (
                  <div
                    key={stat.recipeId}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">#{index + 1}</p>
                      <p className="font-semibold truncate">{stat.recipeTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        Ultima volta: {formatDate(stat as unknown as CookingHistoryEntry)}
                      </p>
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      <p className="text-2xl font-bold">{stat.completionCount}</p>
                      <p className="text-xs text-muted-foreground">
                        {stat.completionCount === 1 ? 'cottura' : 'cotture'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="font-display text-xl font-semibold italic mb-4">Ultime cotture</h2>
              <div className="space-y-2">
                {historyEntries.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="rounded-lg border px-4 py-3">
                    <p className="font-semibold">{entry.recipeTitle}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(entry)}</p>
                    {entry.servings ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {entry.servings} {entry.servings === 1 ? 'porzione' : 'porzioni'}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
