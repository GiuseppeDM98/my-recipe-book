import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
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
}

export interface RecipeCookingStat {
  recipeId: string;
  recipeTitle: string;
  completionCount: number;
  lastCompletedAt: CookingHistoryEntry['completedAt'];
}

export async function createCookingHistoryEntry({
  userId,
  recipeId,
  recipeTitle,
  servings,
}: CreateCookingHistoryEntryInput): Promise<string> {
  const historyRef = collection(db, 'cooking_history');

  const docRef = await addDoc(historyRef, {
    userId,
    recipeId,
    recipeTitle,
    servings: servings ?? null,
    completedAt: serverTimestamp(),
  });

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
