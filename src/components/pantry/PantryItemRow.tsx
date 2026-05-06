'use client';

import { ChevronRight, CheckSquare, ShoppingCart, MoveRight, Pencil } from 'lucide-react';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, formatQty, stockLevel } from '@/lib/utils/pantry-utils';
import { FoodInitials } from './FoodInitials';
import { ExpiryBadge, expiryBorderClass } from './ExpiryBadge';
import { StockBar } from './StockBar';
import { cn } from '@/lib/utils/cn';

interface PantryItemRowProps {
  item: PantryItem;
  onClick: (item: PantryItem) => void;
  onConsume?: (item: PantryItem) => void;
  onAddToList?: (item: PantryItem) => void;
  onEdit?: (item: PantryItem) => void;
}

const POSITION_ICONS: Record<PantryItem['position'], string> = {
  frigo: '❄',
  dispensa: '▥',
  freezer: '✻',
};

export function PantryItemRow({ item, onClick, onConsume, onAddToList, onEdit }: PantryItemRowProps) {
  const info = expiryStatus(item.expires);
  const { level } = stockLevel(item);
  const borderClass = expiryBorderClass(info.status);

  return (
    <div
      className={cn(
        'group relative rounded-xl border border-border p-3 transition-colors duration-200 cursor-pointer',
        'hover:border-primary/20 hover:bg-primary/5',
        borderClass
      )}
      onClick={() => onClick(item)}
    >
      {/* Mobile layout: 3-column */}
      <div className="flex items-center gap-3 lg:hidden">
        <FoodInitials name={item.name} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            <span className="text-[10px] text-muted-foreground">{POSITION_ICONS[item.position]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatQty(item)}</p>
          {info.status !== 'nessuna' && (
            <ExpiryBadge info={info} className="mt-1" />
          )}
          {item.min > 0 && (
            <div className="mt-1.5 w-24">
              <StockBar item={item} />
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </div>

      {/* Desktop layout: 4-column */}
      <div className="hidden lg:grid lg:grid-cols-[52px_1fr_120px_auto] lg:items-center lg:gap-4">
        <FoodInitials name={item.name} size={52} />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{item.name}</p>
            <span className="text-xs text-muted-foreground">{POSITION_ICONS[item.position]}</span>
          </div>
          <p className="text-xs text-muted-foreground">{formatQty(item)}</p>
          {item.notes && (
            <p className="text-xs text-muted-foreground italic truncate max-w-[240px]">{item.notes}</p>
          )}
        </div>

        <div>
          {item.min > 0 && (
            <div className="mb-1">
              <StockBar item={item} />
            </div>
          )}
          {level === 'basso' && (
            <p className="text-[10px] text-destructive font-medium">Scorta bassa</p>
          )}
          {level === 'parziale' && (
            <p className="text-[10px] font-medium" style={{ color: 'oklch(45% 0.14 75)' }}>Scorta parziale</p>
          )}
        </div>

        {/* Hover actions on desktop */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {onConsume && (
            <button
              title="Consumato"
              onClick={e => { e.stopPropagation(); onConsume(item); }}
              className="rounded-lg p-2 hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckSquare className="h-4 w-4" />
            </button>
          )}
          {onAddToList && (
            <button
              title="In lista spesa"
              onClick={e => { e.stopPropagation(); onAddToList(item); }}
              className="rounded-lg p-2 hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ShoppingCart className="h-4 w-4" />
            </button>
          )}
          {onEdit && (
            <button
              title="Modifica"
              onClick={e => { e.stopPropagation(); onEdit(item); }}
              className="rounded-lg p-2 hover:bg-accent/20 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {!onConsume && !onAddToList && !onEdit && (
            <ExpiryBadge info={info} />
          )}
        </div>

        {/* Expiry badge shown when not hovering */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 group-hover:opacity-0 transition-opacity duration-200 hidden lg:block">
          <ExpiryBadge info={info} />
        </div>
      </div>
    </div>
  );
}
