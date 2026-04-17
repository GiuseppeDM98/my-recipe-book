'use client';

import { useCallback, useEffect, useState } from 'react';
import { FamilyProfile } from '@/types';
import { useAuth } from '@/lib/hooks/useAuth';
import { getUserProfile, saveFamilyProfile } from '@/lib/firebase/user-profile';
import { normalizeFamilyProfile } from '@/lib/utils/family-context';

export function useFamilyProfile() {
  const { user } = useAuth();
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(user?.familyProfile ?? null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!user) {
      setFamilyProfile(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const profile = await getUserProfile(user.uid);
      setFamilyProfile(profile?.familyProfile ?? null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (nextProfile: FamilyProfile) => {
    if (!user) {
      throw new Error('Autenticazione richiesta');
    }

    const normalizedProfile = normalizeFamilyProfile(nextProfile);
    if (!normalizedProfile) {
      throw new Error('Aggiungi almeno un componente valido al profilo famiglia');
    }

    setIsSaving(true);

    try {
      await saveFamilyProfile(user.uid, normalizedProfile);
      setFamilyProfile(normalizedProfile);
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  return {
    familyProfile,
    isLoading,
    isSaving,
    hasValidProfile: normalizeFamilyProfile(familyProfile) !== null,
    save,
    reload,
  };
}
