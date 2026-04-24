'use client';

import { Users } from 'lucide-react';
import { FamilyProfileCard } from '@/components/family/family-profile-card';
import { useFamilyProfile } from '@/lib/hooks/useFamilyProfile';

export default function FamilyProfilePage() {
  const {
    familyProfile,
    isLoading,
    isSaving,
    save,
  } = useFamilyProfile();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-7 h-7 text-primary" />
        <div>
          <h1 className="font-display text-4xl font-semibold italic">Profilo famiglia</h1>
          <p className="text-muted-foreground">
            Configura i componenti del nucleo e le note generali usate dai flussi AI quando abiliti il contesto famiglia.
          </p>
        </div>
      </div>

      <FamilyProfileCard
        familyProfile={familyProfile}
        isLoading={isLoading}
        isSaving={isSaving}
        onSave={save}
      />
    </div>
  );
}
