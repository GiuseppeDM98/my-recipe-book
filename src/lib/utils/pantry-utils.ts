import { PantryItem, PantryCategory } from '@/types/pantry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PANTRY_CATEGORIES: PantryCategory[] = [
  { id: 'latticini', name: 'Latticini', color: 'oklch(88% 0.04 80)' },
  { id: 'verdura', name: 'Verdura', color: 'oklch(82% 0.09 148)' },
  { id: 'frutta', name: 'Frutta', color: 'oklch(85% 0.10 60)' },
  { id: 'carne', name: 'Carne', color: 'oklch(75% 0.12 25)' },
  { id: 'pesce', name: 'Pesce', color: 'oklch(82% 0.07 230)' },
  { id: 'cereali', name: 'Cereali e farine', color: 'oklch(85% 0.06 85)' },
  { id: 'legumi', name: 'Legumi', color: 'oklch(78% 0.08 60)' },
  { id: 'condimenti', name: 'Condimenti', color: 'oklch(80% 0.10 95)' },
  { id: 'spezie', name: 'Spezie', color: 'oklch(72% 0.13 55)' },
  { id: 'bevande', name: 'Bevande', color: 'oklch(82% 0.07 250)' },
];

export const PANTRY_UNITS = ['g', 'kg', 'ml', 'L', 'pz', 'vasetti', 'mazzo', 'testa'] as const;

export const PANTRY_POSITIONS = [
  { id: 'frigo', label: 'Frigo', icon: '❄' },
  { id: 'dispensa', label: 'Dispensa', icon: '▥' },
  { id: 'freezer', label: 'Freezer', icon: '✻' },
] as const;

// ---------------------------------------------------------------------------
// Expiry Status
// ---------------------------------------------------------------------------

export type ExpiryStatus = 'scaduto' | 'oggi' | 'urgente' | 'presto' | 'ok' | 'lungo' | 'nessuna';

export interface ExpiryInfo {
  status: ExpiryStatus;
  label: string;
  daysLeft: number;
}

export function expiryStatus(expires: string | null): ExpiryInfo {
  if (!expires) {
    return { status: 'nessuna', label: 'Senza scadenza', daysLeft: Infinity };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expires + 'T00:00:00');
  const daysLeft = Math.round((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return { status: 'scaduto', label: 'Scaduto', daysLeft };
  }
  if (daysLeft === 0) {
    return { status: 'oggi', label: 'Scade oggi', daysLeft };
  }
  if (daysLeft <= 3) {
    return { status: 'urgente', label: `Scade in ${daysLeft}g`, daysLeft };
  }
  if (daysLeft <= 7) {
    return { status: 'presto', label: `Scade in ${daysLeft}g`, daysLeft };
  }
  if (daysLeft <= 30) {
    return { status: 'ok', label: `Scade il ${formatItalianDate(expires)}`, daysLeft };
  }
  return { status: 'lungo', label: `Scade il ${formatItalianDate(expires)}`, daysLeft };
}

// ---------------------------------------------------------------------------
// Stock Level
// ---------------------------------------------------------------------------

export type StockLevel = 'basso' | 'parziale' | 'ok';

export interface StockInfo {
  level: StockLevel;
  ratio: number;
}

export function stockLevel(item: PantryItem): StockInfo {
  if (item.min === 0) {
    return { level: 'ok', ratio: 1 };
  }
  const ratio = item.qty / item.min;
  if (ratio < 0.5) return { level: 'basso', ratio };
  if (ratio < 1) return { level: 'parziale', ratio };
  return { level: 'ok', ratio };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const ITALIAN_MONTHS = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
];

export function formatItalianDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00');
  const day = date.getDate();
  const month = ITALIAN_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatQty(item: PantryItem): string {
  const qty = item.qty;
  // Format with Italian decimal separator (comma)
  const formatted = qty % 1 === 0 ? qty.toString() : qty.toFixed(1).replace('.', ',');
  return `${formatted} ${item.unit}`;
}

// ---------------------------------------------------------------------------
// Helper: get category by id
// ---------------------------------------------------------------------------

export function getPantryCategory(categoryId: string): PantryCategory | undefined {
  return PANTRY_CATEGORIES.find(c => c.id === categoryId);
}
