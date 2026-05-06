'use client';

import { PantryItem } from '@/types/pantry';
import { stockLevel } from '@/lib/utils/pantry-utils';

interface StockBarProps {
  item: PantryItem;
}

export function StockBar({ item }: StockBarProps) {
  const { level, ratio } = stockLevel(item);
  if (item.min === 0) return null;

  const pct = Math.min(100, Math.max(4, ratio * 100));
  const color =
    level === 'basso'
      ? 'var(--destructive)'
      : level === 'parziale'
      ? 'oklch(68% 0.15 75)'
      : 'var(--accent)';

  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        style={{ width: `${pct}%`, background: color }}
        className="h-full rounded-full transition-[width] duration-300"
      />
    </div>
  );
}
