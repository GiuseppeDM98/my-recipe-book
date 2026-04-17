'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FamilyProfile } from '@/types';
import { useAuth } from '@/lib/hooks/useAuth';
import { getUserProfile, saveFamilyProfile } from '@/lib/firebase/user-profile';
import { normalizeFamilyProfile } from '@/lib/utils/family-context';

/**
 * Hook for loading and saving the user's family profile.
 *
 * Stale time for the family profile query is 5 minutes (longer than the global
 * 2-minute default) because it changes infrequently — only when the user
 * explicitly edits it on the /profilo-famiglia page.
 *
 * API is kept compatible with the previous useState-based version:
 * { familyProfile, isLoading, isSaving, hasValidProfile, save, reload }
 *
 * Query key: ['familyProfile', user.uid]
 */

const FAMILY_PROFILE_STALE_MS = 5 * 60 * 1000;

export function useFamilyProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const queryKey = ['familyProfile', user?.uid ?? ''] as const;

  const {
    data: familyProfile = null,
    isLoading,
    refetch,
  } = useQuery({
    enabled: !!user,
    queryKey,
    staleTime: FAMILY_PROFILE_STALE_MS,
    queryFn: async () => {
      const profile = await getUserProfile(user!.uid);
      return profile?.familyProfile ?? null;
    },
  });

  const { mutateAsync: _save, isPending: isSaving } = useMutation({
    mutationFn: async (nextProfile: FamilyProfile) => {
      if (!user) throw new Error('Autenticazione richiesta');

      const normalizedProfile = normalizeFamilyProfile(nextProfile);
      if (!normalizedProfile) {
        throw new Error('Aggiungi almeno un componente valido al profilo famiglia');
      }

      await saveFamilyProfile(user.uid, normalizedProfile);
      return normalizedProfile;
    },
    // Optimistically update the cache so the UI reflects the change immediately
    // without waiting for a subsequent refetch.
    onSuccess: (normalizedProfile) => {
      queryClient.setQueryData(queryKey, normalizedProfile);
    },
  });

  // Wrap to match the expected `(profile) => Promise<void>` signature used by callers.
  const save = async (profile: FamilyProfile): Promise<void> => {
    await _save(profile);
  };

  /** Force a fresh Firestore read — used when external changes may have occurred */
  const reload = async () => {
    await refetch();
  };

  return {
    familyProfile: familyProfile as FamilyProfile | null,
    isLoading,
    isSaving,
    hasValidProfile: normalizeFamilyProfile(familyProfile) !== null,
    save,
    reload,
  };
}
