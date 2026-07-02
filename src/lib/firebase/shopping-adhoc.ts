import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { getUserProfile } from './user-profile';
import { AdHocShoppingItem, AdHocShoppingRecipe, Recipe } from '@/types';

/**
 * Ad-hoc shopping list ("Voglio preparare questo") — CRUD on users/{uid}.adHocShoppingRecipes.
 *
 * WHY users/{uid} (not a new collection):
 * Same pattern as familyProfile (see user-profile.ts) — the list is global per
 * user, not tied to a meal_plan/week, so the existing owner-based rules on the
 * user doc are enough; no new Firestore rules or indexes needed.
 */

export type AddAdHocResult = 'added' | 'updated';

export async function getAdHocShoppingList(userId: string): Promise<AdHocShoppingRecipe[]> {
  const profile = await getUserProfile(userId);
  return profile?.adHocShoppingRecipes ?? [];
}

export async function updateAdHocShoppingList(
  userId: string,
  recipes: AdHocShoppingRecipe[]
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { adHocShoppingRecipes: recipes });
}

/**
 * Add a recipe's ingredients as a new ad-hoc shopping group, or refresh it if
 * the recipe was already added.
 *
 * DEDUP: matches on recipeId. Re-adding the same recipe replaces its group
 * in place (same group id, fresh items) instead of creating a duplicate —
 * this is how a re-click on "Voglio preparare questo" behaves.
 */
export async function addRecipeToAdHocShoppingList(
  userId: string,
  recipe: Recipe
): Promise<AddAdHocResult> {
  const existing = await getAdHocShoppingList(userId);
  const existingIndex = recipe.id ? existing.findIndex(g => g.recipeId === recipe.id) : -1;

  const group: AdHocShoppingRecipe = {
    id: existingIndex >= 0 ? existing[existingIndex].id : crypto.randomUUID(),
    recipeId: recipe.id ?? null,
    recipeTitle: recipe.title,
    addedAt: Date.now(),
    items: recipe.ingredients.map((ingredient): AdHocShoppingItem => ({
      id: crypto.randomUUID(),
      name: ingredient.name,
      quantity: ingredient.quantity,
      checked: false,
    })),
  };

  const nextList = existingIndex >= 0
    ? existing.map((g, i) => (i === existingIndex ? group : g))
    : [...existing, group];

  await updateAdHocShoppingList(userId, nextList);
  return existingIndex >= 0 ? 'updated' : 'added';
}
