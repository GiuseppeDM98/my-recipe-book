import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { CookingHistoryEntry } from '@/types';
import { db } from './config';

/**
 * Historical cooking completions used by statistics and activity views.
 *
 * We store one document per explicit "Termina cottura" action. This keeps
 * analytics append-only and decoupled from the lifecycle of active sessions.
 */

interface CreateCookingHistoryEntryInput {
  userId: string;
  recipeId: string;
  recipeTitle: string;
  servings?: number | null;
  /**
   * Deterministic document id (the cooking session id). When set, a retry of
   * "Termina cottura" overwrites the same entry instead of adding a duplicate.
   */
  entryId?: string;
}

export interface RecipeCookingStat {
  recipeId: string;
  recipeTitle: string;
  completionCount: number;
  lastCompletedAt: CookingHistoryEntry['completedAt'];
}

/**
 * Records one completed cooking.
 *
 * IDEMPOTENCY: with `entryId` the write is a setDoc on that id, so it can be
 * safely repeated — this closes the old duplicate-history bug where the
 * history write succeeded, deleting the session failed, and the retry added a
 * second entry. Without `entryId` it falls back to addDoc (random id).
 * The document shape is identical either way, so statistics are unaffected.
 *
 * @returns the document id
 */
export async function createCookingHistoryEntry({
  userId,
  recipeId,
  recipeTitle,
  servings,
  entryId,
}: CreateCookingHistoryEntryInput): Promise<string> {
  const entryData = {
    userId,
    recipeId,
    recipeTitle,
    servings: servings ?? null,
    completedAt: serverTimestamp(),
  };

  if (entryId) {
    await setDoc(doc(db, 'cooking_history', entryId), entryData);
    return entryId;
  }

  const docRef = await addDoc(collection(db, 'cooking_history'), entryData);
  return docRef.id;
}

export async function getUserCookingHistory(userId: string): Promise<CookingHistoryEntry[]> {
  const historyRef = collection(db, 'cooking_history');
  const q = query(
    historyRef,
    where('userId', '==', userId),
    orderBy('completedAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as CookingHistoryEntry[];
}

export function aggregateCookingHistoryByRecipe(
  historyEntries: CookingHistoryEntry[]
): RecipeCookingStat[] {
  const statsByRecipe = new Map<string, RecipeCookingStat>();

  historyEntries.forEach(entry => {
    const existing = statsByRecipe.get(entry.recipeId);

    if (existing) {
      existing.completionCount += 1;
      existing.lastCompletedAt = entry.completedAt;
      return;
    }

    statsByRecipe.set(entry.recipeId, {
      recipeId: entry.recipeId,
      recipeTitle: entry.recipeTitle,
      completionCount: 1,
      lastCompletedAt: entry.completedAt,
    });
  });

  return Array.from(statsByRecipe.values()).sort((a, b) => {
    if (b.completionCount !== a.completionCount) {
      return b.completionCount - a.completionCount;
    }

    const aDate = a.lastCompletedAt?.toDate?.()?.getTime?.() ?? 0;
    const bDate = b.lastCompletedAt?.toDate?.()?.getTime?.() ?? 0;
    return bDate - aDate;
  });
}
