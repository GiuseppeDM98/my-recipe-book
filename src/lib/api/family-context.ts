import { FamilyProfile } from '@/types';
import { buildFamilyContextPrompt, validateFamilyContextUsage } from '@/lib/utils/family-context';

export function resolveFamilyContextInput(body: Record<string, unknown> | null | undefined): {
  useFamilyContext: boolean;
  familyProfile: FamilyProfile | null;
  validationError: string | null;
  promptContext: string;
} {
  const useFamilyContext = body?.useFamilyContext === true;
  const familyProfile = (body?.familyProfile as FamilyProfile | null | undefined) ?? null;
  const validationError = validateFamilyContextUsage(useFamilyContext, familyProfile);

  return {
    useFamilyContext,
    familyProfile,
    validationError,
    promptContext: validationError ? '' : buildFamilyContextPrompt(familyProfile, useFamilyContext),
  };
}
