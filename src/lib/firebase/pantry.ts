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
} from 'firebase/firestore';
import { db } from './config';
import { PantryItem } from '@/types/pantry';

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

export async function deletePantryItem(itemId: string): Promise<void> {
  const ref = doc(db, 'pantry_items', itemId);
  await deleteDoc(ref);
}
