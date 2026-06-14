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
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PantryCategory {
  id: string;
  name: string;
  color: string;
}
