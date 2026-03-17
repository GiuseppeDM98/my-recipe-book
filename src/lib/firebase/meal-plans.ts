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
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import { MealPlan, MealSlot } from '@/types';

/**
 * Meal Plan CRUD Operations for Firestore (collection: meal_plans)
 *
 * Security Model:
 * - All operations require userId for data ownership
 * - Read operations validate userId matches document owner
 * - Write operations embed userId in document
 *
 * Data Strategy:
 * - weekStartDate is always a Monday in "YYYY-MM-DD" format
 * - slots is a flat array (Firestore handles array serialization cleanly)
 * - null for optional fields, never undefined (Firestore strips undefined)
 */

const COLLECTION = 'meal_plans';

/**
 * Create a new meal plan in Firestore.
 *
 * @returns Document ID of created plan
 */
export async function createMealPlan(
  userId: string,
  planData: Omit<MealPlan, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const plansRef = collection(db, COLLECTION);

  const docRef = await addDoc(plansRef, {
    ...planData,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return docRef.id;
}

/**
 * Fetch a single meal plan, validating ownership.
 *
 * Returns null for both non-existent plans and unauthorized access
 * to avoid leaking information about plan existence.
 */
export async function getMealPlan(planId: string, userId: string): Promise<MealPlan | null> {
  const planRef = doc(db, COLLECTION, planId);
  const planSnap = await getDoc(planRef);

  if (!planSnap.exists() || planSnap.data().userId !== userId) {
    return null;
  }

  return { id: planSnap.id, ...planSnap.data() } as MealPlan;
}

/**
 * Fetch all meal plans for a user, ordered by weekStartDate descending (newest first).
 *
 * WHY weekStartDate (string) ORDER:
 * ISO date strings sort lexicographically in the same order as chronologically,
 * so ordering by weekStartDate DESC correctly surfaces the most recent week first.
 */
export async function getUserMealPlans(userId: string): Promise<MealPlan[]> {
  const plansRef = collection(db, COLLECTION);
  const q = query(
    plansRef,
    where('userId', '==', userId),
    orderBy('weekStartDate', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as MealPlan[];
}

/**
 * Fetch the most recent meal plan for a user.
 *
 * Used on page mount to restore the last session without loading all plans.
 * Returns null if the user has never created a plan.
 */
export async function getLatestMealPlan(userId: string): Promise<MealPlan | null> {
  const plansRef = collection(db, COLLECTION);
  const q = query(
    plansRef,
    where('userId', '==', userId),
    orderBy('weekStartDate', 'desc'),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as MealPlan;
}

/**
 * Fetch a plan by weekStartDate for the given user.
 *
 * Used before creation to check for a duplicate plan for the same week.
 * Returns null if no plan exists for that week.
 */
export async function getMealPlanByWeek(
  userId: string,
  weekStartDate: string
): Promise<MealPlan | null> {
  const plansRef = collection(db, COLLECTION);
  const q = query(
    plansRef,
    where('userId', '==', userId),
    where('weekStartDate', '==', weekStartDate),
    limit(1)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const d = snapshot.docs[0];
  return { id: d.id, ...d.data() } as MealPlan;
}

/**
 * Update the slots array of a plan and bump updatedAt.
 *
 * Called after every slot edit (manual assignment, AI generation, clear).
 * Partial update keeps the rest of the plan document unchanged.
 *
 * Security Note: Does NOT validate userId — caller must verify ownership.
 */
export async function updateMealPlanSlots(planId: string, slots: MealSlot[]): Promise<void> {
  const planRef = doc(db, COLLECTION, planId);
  await updateDoc(planRef, {
    slots,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Generic update for any plan fields.
 *
 * Security Note: Does NOT validate userId — caller must verify ownership.
 */
export async function updateMealPlan(
  planId: string,
  updates: Partial<Omit<MealPlan, 'id' | 'userId' | 'createdAt'>>
): Promise<void> {
  const planRef = doc(db, COLLECTION, planId);
  await updateDoc(planRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Delete a meal plan.
 *
 * Does NOT cascade — AI-generated recipes embedded in slots are lost.
 * Caller must save any desired new recipes to the cookbook before deleting.
 */
export async function deleteMealPlan(planId: string): Promise<void> {
  const planRef = doc(db, COLLECTION, planId);
  await deleteDoc(planRef);
}
