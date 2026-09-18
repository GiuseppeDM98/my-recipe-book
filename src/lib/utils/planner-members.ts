import { FamilyProfile } from '@/types';
import { normalizeFamilyProfile, resolveFamilyMemberLabel } from '@/lib/utils/family-context';

/**
 * Family members as the meal planner sees them.
 *
 * WHY A SEPARATE, ALREADY-RESOLVED SHAPE:
 * The planner needs only an id (what MealSlotVariant.memberIds points at) and a name to
 * show. Resolving the "Componente N" fallback once, here, keeps the pure planner
 * functions (nutrition totals, variant chips) free of profile-normalization rules, and
 * guarantees that a member dropped by normalizeFamilyProfile() — invalid age, empty id —
 * is absent everywhere at once instead of showing up in one surface and not another.
 */
export interface PlannerMember {
  id: string;
  /** Never empty: the saved label or the "Componente N" fallback. */
  label: string;
}

/** People a meal is planned for when the user has no (valid) family profile. */
export const FALLBACK_SERVINGS_PLANNED = 2;

/** Bounds of MealSlot.servingsPlanned, shared by the stepper and the hook clamp. */
export const MIN_SERVINGS_PLANNED = 1;
export const MAX_SERVINGS_PLANNED = 20;

/** Resolves the planner members from the saved profile; [] without a valid profile. */
export function resolvePlannerMembers(
  familyProfile: FamilyProfile | null | undefined
): PlannerMember[] {
  const normalized = normalizeFamilyProfile(familyProfile);
  if (!normalized) return [];

  return normalized.members.map((member, index) => ({
    id: member.id,
    label: resolveFamilyMemberLabel(member.label, index),
  }));
}

/** Default MealSlot.servingsPlanned for new slots: the family size, or the fallback. */
export function resolveDefaultServingsPlanned(
  familyProfile: FamilyProfile | null | undefined
): number {
  const memberCount = resolvePlannerMembers(familyProfile).length;
  return memberCount > 0
    ? clampServingsPlanned(memberCount)
    : FALLBACK_SERVINGS_PLANNED;
}

/** Clamps a people count to the supported range, rounding to a whole person. */
export function clampServingsPlanned(value: number): number {
  if (!Number.isFinite(value)) return FALLBACK_SERVINGS_PLANNED;
  return Math.min(MAX_SERVINGS_PLANNED, Math.max(MIN_SERVINGS_PLANNED, Math.round(value)));
}

/** Label shown for a variant member who is no longer in the family profile. */
export const REMOVED_MEMBER_LABEL = 'Componente rimosso';

/** Compact, non-interactive marker of one variant on a calendar cell. */
export interface VariantChip {
  /** Variant id — stable React key. */
  key: string;
  /** Initial of the first known member, "+n" for the others; "?" when nobody is known. */
  text: string;
  /** Full wording for the tooltip and for screen readers: who eats what. */
  description: string;
  /** true when at least one member of the variant left the family profile. */
  hasRemovedMember: boolean;
}

/** The label of a variant member, or null when they are no longer in the profile. */
export function findMemberLabel(memberId: string, members: PlannerMember[]): string | null {
  return members.find(member => member.id === memberId)?.label ?? null;
}

/**
 * Builds the chips a calendar cell shows for its variants.
 *
 * The initial comes from the first member still in the profile, so a variant shared by
 * a removed member and a current one keeps a readable letter; only a variant whose
 * members are ALL gone falls back to "?". Two members sharing an initial (or two
 * unnamed "Componente N") produce the same letter — accepted: the description
 * disambiguates, and the cell must stay calm.
 *
 * @param maxChips - Chips shown before the rest collapses into `overflowCount`
 */
export function buildVariantChips(
  variants: Array<{ id: string; memberIds: string[]; recipeTitle: string | null }>,
  members: PlannerMember[],
  maxChips = 3
): { chips: VariantChip[]; overflowCount: number } {
  const chips = variants
    .filter(variant => variant.memberIds.length > 0)
    .map((variant): VariantChip => {
      const labels = variant.memberIds.map(memberId => findMemberLabel(memberId, members));
      const firstKnownLabel = labels.find((label): label is string => label !== null);
      const othersCount = variant.memberIds.length - 1;

      return {
        key: variant.id,
        text:
          (firstKnownLabel ? firstKnownLabel.charAt(0).toUpperCase() : '?') +
          (othersCount > 0 ? `+${othersCount}` : ''),
        description: `${labels.map(label => label ?? REMOVED_MEMBER_LABEL).join(', ')}: ${
          variant.recipeTitle ?? 'ricetta non disponibile'
        }`,
        hasRemovedMember: labels.some(label => label === null),
      };
    });

  return {
    chips: chips.slice(0, maxChips),
    overflowCount: Math.max(0, chips.length - maxChips),
  };
}
