'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Recipe } from '@/types';
import { getUserRecipes } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/hooks/useAuth';

/**
 * Hook for fetching and managing user recipes.
 *
 * Uses React Query for caching — navigating away and back within the stale
 * window (2 min, configured globally in QueryClient) returns data instantly
 * without a new Firestore read.
 *
 * API is kept compatible with the previous useState-based version so callers
 * don't need changes: { recipes, loading, error, refreshRecipes }.
 *
 * Query key: ['recipes', user.uid]
 * Use `recipesQueryKey(uid)` in mutation call-sites to invalidate the cache.
 */

/** Returns the query key for a user's recipe list (use at mutation call-sites to invalidate) */
export const recipesQueryKey = (uid: string) => ['recipes', uid] as const;

interface UseRecipesOptions {
  enabled?: boolean;
}

export function useRecipes(options?: UseRecipesOptions) {
  const { user } = useAuth();
  const isQueryEnabled = (options?.enabled ?? true) && !!user;

  const {
    data: recipes = [],
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    // Disable the query while the user is not authenticated — avoids
    // sending an unauthenticated Firestore request on initial render.
    // Callers can also keep the query idle until a specific UI path is active
    // (for example the AI chat tab), reducing unnecessary initial reads.
    enabled: isQueryEnabled,
    queryKey: recipesQueryKey(user?.uid ?? ''),
    queryFn: () => getUserRecipes(user!.uid),
  });

  const error = queryError ? (queryError as Error).message : null;

  /**
   * Manually force a fresh Firestore read.
   *
   * Prefer relying on cache invalidation via `recipesQueryKey` after
   * mutations. Use this only when the cache may be stale for a reason
   * outside the normal mutation flow (e.g., server-side changes).
   */
  const refreshRecipes = async () => {
    await refetch();
  };

  return { recipes: recipes as Recipe[], loading, error, refreshRecipes };
}
