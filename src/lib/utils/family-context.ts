import { FamilyProfile } from '@/types';

export interface ValidatedFamilyProfile {
  members: Array<{
    id: string;
    age: number;
    label: string | null;
  }>;
  notes: string | null;
}

export function normalizeFamilyProfile(
  familyProfile: FamilyProfile | null | undefined
): ValidatedFamilyProfile | null {
  if (!familyProfile || !Array.isArray(familyProfile.members)) {
    return null;
  }

  const members = familyProfile.members
    .map((member) => ({
      id: String(member.id ?? '').trim(),
      age: Number(member.age),
      label: typeof member.label === 'string' && member.label.trim().length > 0
        ? member.label.trim()
        : null,
    }))
    .filter((member) => member.id.length > 0 && Number.isFinite(member.age) && member.age >= 0 && member.age <= 120);

  if (members.length === 0) {
    return null;
  }

  return {
    members,
    notes: typeof familyProfile.notes === 'string' && familyProfile.notes.trim().length > 0
      ? familyProfile.notes.trim()
      : null,
  };
}

export function buildFamilyContextPrompt(
  familyProfile: FamilyProfile | null | undefined,
  useFamilyContext: boolean
): string {
  if (!useFamilyContext) {
    return '';
  }

  const normalizedProfile = normalizeFamilyProfile(familyProfile);
  if (!normalizedProfile) {
    return '';
  }

  const memberLines = normalizedProfile.members.map((member, index) => {
    const label = member.label ?? `Componente ${index + 1}`;
    return `- ${label}: ${member.age} anni`;
  });

  const notesBlock = normalizedProfile.notes
    ? `\nNote famiglia: ${normalizedProfile.notes}`
    : '';

  return `CONTESTO FAMIGLIA DELL'UTENTE:
${memberLines.join('\n')}${notesBlock}

Usa questo contesto solo come euristica pratica per calibrare porzioni e quantità complessive delle ricette.
- Tieni conto della composizione del nucleo (età diverse = appetiti e porzioni diverse).
- Non trasformare questo contesto in consigli medici, nutrizionali clinici o prescrizioni dietetiche.
- Se proponi ricette o piani, adatta quantità e numero di porzioni in modo plausibile per questa famiglia.

`;
}

export function validateFamilyContextUsage(
  useFamilyContext: boolean,
  familyProfile: FamilyProfile | null | undefined
): string | null {
  if (!useFamilyContext) {
    return null;
  }

  if (!normalizeFamilyProfile(familyProfile)) {
    return 'Per usare il contesto famiglia devi prima salvare almeno un componente valido nel profilo famiglia.';
  }

  return null;
}
