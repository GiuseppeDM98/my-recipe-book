import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { db } from './config';
import { PantryBatchOp, PantryItem } from '@/types/pantry';

/**
 * Applies creations and updates to pantry_items in ONE atomic commit.
 *
 * WHY a batch: the pantry is either fully updated or untouched, never half
 * done, which makes a retry after an error safe. Callers must already have
 * merged several changes to the same document into one op: two updates on the
 * same doc inside a batch would silently keep only the last one.
 *
 * Firestore caps a batch at 500 writes — far above any shopping list or recipe.
 */
export async function applyPantryBatch(userId: string, ops: PantryBatchOp[]): Promise<void> {
  if (ops.length === 0) return;

  const batch = writeBatch(db);
  const itemsRef = collection(db, 'pantry_items');

  for (const op of ops) {
    if (op.kind === 'create') {
      batch.set(doc(itemsRef), {
        ...op.data,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(db, 'pantry_items', op.itemId), {
        ...op.data,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

/**
 * Writes end-of-cooking stock deductions atomically.
 *
 * @param updates one final qty per entry, already clamped to ≥ 0 by the caller
 *                (buildPantryDeductionUpdates); an entry is never deleted here
 */
export async function applyPantryDeductions(
  userId: string,
  updates: Array<{ itemId: string; qty: number }>
): Promise<void> {
  await applyPantryBatch(
    userId,
    updates.map(({ itemId, qty }) => ({ kind: 'update', itemId, data: { qty } }))
  );
}

/**
 * Pantry CRUD Operations for Firestore
 *
 * Collection: pantry_items
 * Security: All operations require userId; security rules enforce ownership.
 */

export async function getPantryItems(userId: string): Promise<PantryItem[]> {
  const ref = collection(db, 'pantry_items');
  const q = query(ref, where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PantryItem));
}

export async function createPantryItem(
  userId: string,
  data: Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = collection(db, 'pantry_items');
  const docRef = await addDoc(ref, {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updatePantryItem(
  itemId: string,
  data: Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>>
): Promise<void> {
  const ref = doc(db, 'pantry_items', itemId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Records a user-confirmed "this ingredient is this pantry entry" link.
 *
 * WHY arrayUnion instead of writing the merged array: the caller's copy of
 * `aliases` comes from a React Query cache up to 2 minutes old, so rewriting
 * the whole array could drop an alias confirmed meanwhile on another device.
 * arrayUnion merges server-side and is idempotent (no duplicates).
 *
 * @param alias canonicalIngredientKey() of the ingredient name, never raw text
 */
export async function addPantryItemAlias(itemId: string, alias: string): Promise<void> {
  const ref = doc(db, 'pantry_items', itemId);
  await updateDoc(ref, {
    aliases: arrayUnion(alias),
    updatedAt: serverTimestamp(),
  });
}

export async function deletePantryItem(itemId: string): Promise<void> {
  const ref = doc(db, 'pantry_items', itemId);
  await deleteDoc(ref);
}
