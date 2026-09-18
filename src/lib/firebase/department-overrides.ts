import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { getUserProfile } from './user-profile';

/**
 * "Ingredient → department" overrides ("Sposta in reparto…") on
 * users/{uid}.ingredientDepartmentOverrides — same pattern as
 * familyProfile/adHocShoppingRecipes (see shopping-adhoc.ts): a field on the
 * existing user doc, no new collection, rule or index.
 */

export async function getDepartmentOverrides(userId: string): Promise<Record<string, string>> {
  const profile = await getUserProfile(userId);
  return profile?.ingredientDepartmentOverrides ?? {};
}

/**
 * Writes/updates a single override with a read-modify-write of the ENTIRE map.
 *
 * WHY not a per-key dot-path update: canonical keys contain spaces
 * ("pomodor pelat") and Firestore field paths with special characters
 * require fragile escaping via FieldPath; the map is small and writes are
 * rare, so rewriting it whole is simpler and more robust (same trade-off as
 * updateAdHocShoppingList, shopping-adhoc.ts).
 *
 * WHY a direct write, no debounce: unlike check marks (bursts of taps
 * coalesced at 500ms), moving a department is a rare, deliberate action, one
 * at a time, from a sheet. A debounce would create a THIRD persistence
 * target to register in flushAll() (gotcha "New persistence target
 * forgotten in the flush", AGENTS.md) with no coalescing benefit.
 */
export async function setDepartmentOverride(
  userId: string,
  canonicalKey: string,
  departmentId: string
): Promise<void> {
  const current = await getDepartmentOverrides(userId);
  const next = { ...current, [canonicalKey]: departmentId };
  await updateDoc(doc(db, 'users', userId), { ingredientDepartmentOverrides: next });
}
