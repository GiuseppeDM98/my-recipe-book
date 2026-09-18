'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { CheckSquare, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, formatQty } from '@/lib/utils/pantry-utils';
import { parsePantryQty, roundToOneDecimal } from '@/lib/utils/ingredient-matching';
import { FoodInitials } from './FoodInitials';
import { ExpiryBadge } from './ExpiryBadge';
import { usePantry } from '@/lib/hooks/usePantry';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

/**
 * Proportional "Consumato" options for measured units (g/kg/ml/L).
 *
 * WHY chips instead of a number input: nobody types in the kitchen. Three taps
 * cover the real cases; the exact value stays editable from "Modifica prodotto".
 * `remainingRatio` is what is left after consuming (0 = finished).
 */
const PROPORTIONAL_CONSUME_OPTIONS = [
  { label: "Un po' (−25%)", remainingRatio: 0.75 },
  { label: 'Metà (−50%)', remainingRatio: 0.5 },
  { label: 'Tutto', remainingRatio: 0 },
] as const;

export function PantryItemQuickSheet({ item, onClose, onEdit }: PantryItemQuickSheetProps) {
  const { updateItem, deleteItem } = usePantry();
  const [isConsumeExpanded, setIsConsumeExpanded] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  // The sheet is reused across items: never carry an expanded/confirm state over.
  useEffect(() => {
    setIsConsumeExpanded(false);
    setIsConfirmDeleteOpen(false);
  }, [item?.id]);

  if (!item) return null;

  const info = expiryStatus(item.expires);
  // Counts (pz, vasetti, mazzo, testa) are consumed one at a time; measured
  // units can't be — "−1 g" off a 500 g pack is meaningless.
  const isMeasuredUnit = parsePantryQty(item).dimension !== 'count';

  async function updateQty(newQty: number) {
    if (!item) return;
    try {
      await updateItem.mutateAsync({ id: item.id, data: { qty: Math.max(0, newQty) } });
      onClose();
    } catch (err) {
      console.error('Error updating pantry item qty:', err);
      toast.error('Impossibile aggiornare il prodotto. Riprova.');
    }
  }

  function handleConsumeTap() {
    if (!item) return;
    if (isMeasuredUnit) {
      setIsConsumeExpanded(expanded => !expanded);
      return;
    }
    void updateQty(item.qty - 1);
  }

  async function handleMove(position: PantryItem['position']) {
    if (!item || item.position === position) return;
    await updateItem.mutateAsync({ id: item.id, data: { position } });
    onClose();
  }

  async function handleConfirmDelete() {
    if (!item) return;
    try {
      await deleteItem.mutateAsync(item.id);
      setIsConfirmDeleteOpen(false);
      onClose();
    } catch (err) {
      console.error('Error deleting pantry item:', err);
      toast.error('Impossibile eliminare il prodotto. Riprova.');
    }
  }

  return (
    <>
      <Sheet open={!!item} onOpenChange={open => !open && onClose()}>
        {/* Bottom sheet on mobile, centered modal on lg (same pattern as PantryAddSheet).
            NEVER lg:hidden here: rows and the expiring strip open this sheet at every
            width, and a hidden content leaves only the blurred overlay — a dead screen. */}
        <SheetContent
          side="bottom"
          showClose={false}
          className="rounded-t-[1.75rem] border-border/70 lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[480px] lg:rounded-2xl lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
        >
          <SheetHeader>
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90 lg:hidden" />
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
              type="button"
              onClick={handleConsumeTap}
              aria-expanded={isMeasuredUnit ? isConsumeExpanded : undefined}
              disabled={updateItem.isPending || item.qty <= 0}
              className="col-span-2 flex flex-col items-center gap-2 rounded-2xl bg-muted p-4 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
            >
              <CheckSquare className="h-6 w-6 text-accent-foreground" />
              Consumato
            </button>

            {isMeasuredUnit && isConsumeExpanded && (
              <div className="col-span-2 flex gap-2">
                {PROPORTIONAL_CONSUME_OPTIONS.map(option => (
                  <button
                    key={option.label}
                    type="button"
                    disabled={updateItem.isPending}
                    onClick={() => void updateQty(roundToOneDecimal(item.qty * option.remainingRatio))}
                    className={cn(
                      'flex-1 min-h-11 rounded-xl border px-2 py-2.5 text-sm font-medium transition-colors disabled:opacity-50',
                      option.remainingRatio === 0
                        ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
                        : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-primary/5'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            <div className="col-span-2 flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Sposta in:</p>
              <div className="flex gap-2">
                {POSITION_OPTIONS.filter(p => p.id !== item.position).map(pos => (
                  <button
                    key={pos.id}
                    type="button"
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
              type="button"
              onClick={() => { onEdit(item); onClose(); }}
              className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-muted p-3 text-sm font-medium text-foreground hover:bg-muted/80 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Modifica prodotto
            </button>
          </div>

          {/* Delete — destructive, so it always goes through ConfirmDialog */}
          <button
            type="button"
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="mt-3 w-full text-center text-xs text-destructive hover:underline py-2"
          >
            Elimina prodotto
          </button>
        </SheetContent>
      </Sheet>

      {/* Sibling of the Sheet, not a child: Radix stacks the two layers, so the
          dialog sits on top and Esc/outside clicks only dismiss the topmost one. */}
      <ConfirmDialog
        open={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        title={`Eliminare ${item.name}?`}
        description="Il prodotto verrà rimosso dalla dispensa."
        confirmLabel="Elimina"
        isConfirming={deleteItem.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
