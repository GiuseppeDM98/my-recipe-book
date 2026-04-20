import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './config';
import { Recipe } from '@/types';

/**
 * Recipe CRUD Operations for Firestore
 *
 * Security Model:
 * - All operations require userId for data ownership
 * - Read operations validate userId matches document owner
 * - Write operations embed userId in document
 * - Security rules in Firestore enforce these checks server-side
 *
 * Timestamp Strategy:
 * - Uses serverTimestamp() instead of client Date.now() to:
 *   1. Ensure consistent timezone (UTC)
 *   2. Prevent client clock manipulation
 *   3. Guarantee ordering accuracy across distributed systems
 */

/**
 * Create a new recipe in Firestore
 *
 * @param userId - Owner's user ID (embedded for security)
 * @param recipeData - Recipe data without id/userId/timestamps
 * @returns Document ID of created recipe
 *
 * Security: userId is embedded in document to enable Firestore security rules
 * that restrict access to recipe owners only.
 */
export async function createRecipe(userId: string, recipeData: Omit<Recipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const recipesRef = collection(db, 'recipes');

  const docRef = await addDoc(recipesRef, {
    ...recipeData,
    userId,
    // Use serverTimestamp() instead of Date.now() to ensure:
    // 1. Consistent UTC timezone across all clients
    // 2. Accurate ordering (client clocks can be wrong)
    // 3. Protection against time-based manipulation
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Fetch a single recipe, validating ownership
 *
 * @param recipeId - Recipe document ID
 * @param userId - Requesting user's ID
 * @returns Recipe if exists and user owns it, null otherwise
 *
 * Security: Returns null for both non-existent recipes and unauthorized access
 * to prevent information disclosure about recipe existence.
 */
export async function getRecipe(recipeId: string, userId: string): Promise<Recipe | null> {
  const recipeRef = doc(db, 'recipes', recipeId);
  const recipeSnap = await getDoc(recipeRef);

  // Check ownership: return null for both missing docs and unauthorized access
  // to prevent leaking information about recipe existence
  if (!recipeSnap.exists() || recipeSnap.data().userId !== userId) {
    return null;
  }

  return {
    id: recipeSnap.id,
    ...recipeSnap.data(),
  } as Recipe;
}

/**
 * Fetch all recipes owned by a user
 *
 * @param userId - User ID to filter by
 * @returns Array of user's recipes, ordered newest first
 *
 * Query strategy: Firestore index on (userId, createdAt) enables efficient
 * filtering and sorting in a single compound query.
 */
export async function getUserRecipes(userId: string): Promise<Recipe[]> {
  const recipesRef = collection(db, 'recipes');
  const q = query(
    recipesRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  const querySnapshot = await getDocs(q);

  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Recipe[];
}

/**
 * Update an existing recipe
 *
 * @param recipeId - Recipe document ID
 * @param updates - Partial recipe fields to update
 *
 * Security Note: Does NOT validate userId - caller must verify ownership
 * before calling (typically done by getRecipe first). This allows batch
 * updates without redundant reads.
 *
 * Timestamp: updatedAt is automatically set to serverTimestamp() to track
 * modification time accurately.
 */
export async function updateRecipe(recipeId: string, updates: Partial<Recipe>): Promise<void> {
  const recipeRef = doc(db, 'recipes', recipeId);

  await updateDoc(recipeRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Batch-fetch multiple recipes by ID in parallel, validating ownership for each.
 *
 * Returns a Map<recipeId, Recipe> for O(1) lookups. Silently skips IDs that
 * do not exist or belong to another user.
 *
 * Deduplicates the input IDs to avoid redundant reads (typical meal plan has
 * 5-15 unique recipes across 21 slots).
 */
export async function getRecipesByIds(
  recipeIds: string[],
  userId: string
): Promise<Map<string, Recipe>> {
  const uniqueIds = [...new Set(recipeIds)];
  const results = await Promise.all(uniqueIds.map(id => getRecipe(id, userId)));

  const map = new Map<string, Recipe>();
  results.forEach((recipe, i) => {
    if (recipe) map.set(uniqueIds[i], recipe);
  });

  return map;
}

/**
 * Delete a recipe from Firestore
 *
 * @param recipeId - Recipe document ID
 *
 * Security Note: Does NOT validate userId - caller must verify ownership.
 * Firestore security rules provide the final authorization layer.
 *
 * Related Data: Does NOT cascade delete. Related cooking sessions must be
 * cleaned up separately, and historical completions in cooking_history are
 * intentionally preserved as append-only analytics snapshots.
 */
export async function deleteRecipe(recipeId: string): Promise<void> {
  const recipeRef = doc(db, 'recipes', recipeId);
  await deleteDoc(recipeRef);
}
