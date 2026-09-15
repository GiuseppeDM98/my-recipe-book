import { Timestamp } from 'firebase/firestore';

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  qty: number;
  unit: string; // 'g' | 'kg' | 'ml' | 'L' | 'pz' | 'vasetti' | 'mazzo' | 'testa'
  categoryId: string; // pantry category slug
  position: 'frigo' | 'dispensa' | 'freezer';
  purchased: string | null; // YYYY-MM-DD or null
  expires: string | null;   // YYYY-MM-DD or null
  min: number;              // minimum threshold (0 = no threshold)
  notes: string | null;
  /**
   * Canonical keys (canonicalIngredientKey) confirmed by the user as
   * "this ingredient is this pantry entry". Written only by the suggestion
   * confirmation flow; never undefined on Firestore (omitted or array).
   */
  aliases?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * One write of an atomic pantry batch (applyPantryBatch). Discriminated on
 * `kind` so an update can never be built without its itemId.
 */
export type PantryBatchOp =
  | { kind: 'create'; data: Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'> }
  | { kind: 'update'; itemId: string; data: Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>> };

export interface PantryCategory {
  id: string;
  name: string;
  color: string;
}
