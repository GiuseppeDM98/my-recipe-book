'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { CheckSquare, ShoppingCart, MoveRight, Pencil, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, formatQty } from '@/lib/utils/pantry-utils';
import { FoodInitials } from './FoodInitials';
import { ExpiryBadge } from './ExpiryBadge';
import { usePantry } from '@/lib/hooks/usePantry';
import { cn } from '@/lib/utils/cn';

interface PantryItemQuickSheetProps {
  item: PantryItem | null;
  onClose: () => void;
  onEdit: (item: PantryItem) => void;
}

const POSITION_OPTIONS: Array<{ id: PantryItem['position']; label: string; icon: string }> = [
  { id: 'frigo', label: 'Frigo', icon: '❄' },
  { id: 'dispensa', label: 'Dispensa', icon: '▥' },
  { id: 'freezer', label: 'Freezer', icon: '✻' },
];

export function PantryItemQuickSheet({ item, onClose, onEdit }: PantryItemQuickSheetProps) {
  const { updateItem, deleteItem } = usePantry();

  if (!item) return null;

  const info = expiryStatus(item.expires);

  async function handleConsume() {
    if (!item) return;
    const newQty = Math.max(0, item.qty - 1);
    await updateItem.mutateAsync({ id: item.id, data: { qty: newQty } });
    onClose();
  }

  async function handleMove(position: PantryItem['position']) {
    if (!item || item.position === position) return;
    await updateItem.mutateAsync({ id: item.id, data: { position } });
    onClose();
  }

  return (
    <Sheet open={!!item} onOpenChange={open => !open && onClose()}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="rounded-t-[1.75rem] border-border/70 lg:hidden"
      >
        <SheetHeader>
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90" />
          {/* Item header */}
          <div className="flex items-center gap-3">
            <FoodInitials name={item.name} size={52} />
            <div className="flex-1 min-w-0 text-left">
              <SheetTitle className="text-base font-semibold text-foreground">
                {item.name}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">{formatQty(item)}</p>
              {info.status !== 'nessuna' && <ExpiryBadge info={info} className="mt-1" />}
            </div>
          </div>
          <SheetDescription className="sr-only">
            Azioni rapide per {item.name}
          </SheetDescription>
        </SheetHeader>

        {/* Actions grid */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={handleConsume}
            className="flex flex-col items-center gap-2 rounded-2xl bg-muted p-4 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
          >
            <CheckSquare className="h-6 w-6 text-accent-foreground" />
            Consumato
          </button>

          <button
            onClick={onClose}
            className="flex flex-col items-center gap-2 rounded-2xl bg-muted p-4 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
          >
            <ShoppingCart className="h-6 w-6 text-muted-foreground" />
            Aggiungi a lista
          </button>

          <div className="col-span-2 flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Sposta in:</p>
            <div className="flex gap-2">
              {POSITION_OPTIONS.filter(p => p.id !== item.position).map(pos => (
                <button
                  key={pos.id}
                  onClick={() => handleMove(pos.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-medium text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <span>{pos.icon}</span>
                  <span>{pos.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => { onEdit(item); onClose(); }}
            className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-muted p-3 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Modifica prodotto
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={async () => {
            await deleteItem.mutateAsync(item.id);
            onClose();
          }}
          className="mt-3 w-full text-center text-xs text-destructive hover:underline py-2"
        >
          Elimina prodotto
        </button>
      </SheetContent>
    </Sheet>
  );
}
