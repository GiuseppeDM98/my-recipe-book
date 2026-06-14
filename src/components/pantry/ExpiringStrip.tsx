'use client';

import { PantryItem } from '@/types/pantry';
import { expiryStatus, formatQty } from '@/lib/utils/pantry-utils';
import { FoodInitials } from './FoodInitials';
import { ExpiryBadge } from './ExpiryBadge';

interface ExpiringStripProps {
  items: PantryItem[];
  onItemClick: (item: PantryItem) => void;
}

export function ExpiringStrip({ items, onItemClick }: ExpiringStripProps) {
  const urgentItems = items.filter(item => {
    const { status } = expiryStatus(item.expires);
    return status === 'scaduto' || status === 'oggi' || status === 'urgente';
  });

  if (urgentItems.length === 0) return null;

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-destructive mb-3">
        Da usare subito
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
        {urgentItems.map(item => {
          const info = expiryStatus(item.expires);
          return (
            <button
              key={item.id}
              onClick={() => onItemClick(item)}
              className="flex-shrink-0 flex flex-col items-center gap-2 p-3 rounded-2xl bg-card border border-border hover:border-destructive/30 hover:bg-destructive/5 transition-colors duration-200 text-center min-w-[88px] max-w-[100px]"
            >
              <FoodInitials name={item.name} size={44} />
              <div className="w-full">
                <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">{formatQty(item)}</p>
              </div>
              <ExpiryBadge info={info} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
