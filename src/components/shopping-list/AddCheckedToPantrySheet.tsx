'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePantry, pantryQueryKey } from '@/lib/hooks/usePantry';
import { applyPantryBatch } from '@/lib/firebase/pantry';
import { formatLocalDate } from '@/lib/constants/seasons';
import { PANTRY_CATEGORIES, PANTRY_POSITIONS, PANTRY_UNITS } from '@/lib/utils/pantry-utils';
import {
  buildPantryBatchOps,
  buildPantryDraftRows,
  CheckedShoppingEntry,
  describePantryBatchResult,
  describePantryIncrement,
  FALLBACK_PANTRY_CATEGORY_ID,
  PantryDraftRow,
} from '@/lib/utils/pantry-batch';
import { PantryItem } from '@/types/pantry';

interface AddCheckedToPantrySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Checked items currently visible in the list (plan, custom and ad-hoc). */
  checkedItems: CheckedShoppingEntry[];
}

// Spec E adds 'altro' to PANTRY_CATEGORIES: don't list it twice when it does.
const CATEGORY_OPTIONS = PANTRY_CATEGORIES.some(category => category.id === FALLBACK_PANTRY_CATEGORY_ID)
  ? PANTRY_CATEGORIES
  : [...PANTRY_CATEGORIES, { id: FALLBACK_PANTRY_CATEGORY_ID, name: 'Altro', color: '' }];

const FIELD_CLASS =
  'w-full rounded-xl border border-border bg-background text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 disabled:opacity-60';

/**
 * "Aggiungi alla dispensa" — the end-of-shopping batch flow.
 *
 * One card per checked item, prefilled (buildPantryDraftRows) and editable;
 * confirming writes everything in one atomic batch. Checked items stay checked:
 * the check means "bought", not "archived".
 */
export function AddCheckedToPantrySheet({ open, onOpenChange, checkedItems }: AddCheckedToPantrySheetProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { items: pantryItems } = usePantry();
  const [rows, setRows] = useState<PantryDraftRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Build the rows once per opening. checkedItems/pantryItems get new identities
  // on every parent render, so rebuilding on each change would wipe the user's
  // edits while the sheet is open.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setRows(buildPantryDraftRows(checkedItems, pantryItems));
    }
    wasOpenRef.current = open;
  }, [open, checkedItems, pantryItems]);

  const includedCount = rows.filter(row => row.include).length;
  const hasNamelessCreation = rows.some(row => row.include && !row.existingItem && !row.name.trim());

  function updateRow(sourceId: string, changes: Partial<PantryDraftRow>) {
    setRows(prev => prev.map(row => (row.sourceId === sourceId ? { ...row, ...changes } : row)));
  }

  function handleOpenChange(next: boolean) {
    // The batch is atomic but still in flight: keep the sheet until it settles.
    if (!isSaving) onOpenChange(next);
  }

  async function handleSave() {
    if (!user || includedCount === 0) return;
    const ops = buildPantryBatchOps(rows, formatLocalDate(new Date()));

    setIsSaving(true);
    try {
      await applyPantryBatch(user.uid, ops);
      void queryClient.invalidateQueries({ queryKey: pantryQueryKey(user.uid) });
      const createdCount = ops.filter(op => op.kind === 'create').length;
      toast.success(describePantryBatchResult(createdCount, ops.length - createdCount));
      onOpenChange(false);
    } catch (err) {
      // The sheet stays open with the user's edits: the batch wrote nothing, so
      // retrying is safe.
      console.error('Error applying pantry batch:', err);
      toast.error('Impossibile aggiornare la dispensa. Riprova.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="max-h-[92dvh] rounded-t-[1.75rem] border-border/70 flex flex-col overflow-hidden lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[540px] lg:rounded-2xl lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
      >
        <SheetHeader className="px-1">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90 lg:hidden" />
          <SheetTitle className="font-display text-2xl font-semibold italic">
            Aggiungi alla dispensa
          </SheetTitle>
          <SheetDescription>
            Gli articoli spuntati, pronti da salvare. Controlla e conferma.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-3 pb-4">
          {rows.map(row => (
            <DraftRowCard
              key={row.sourceId}
              row={row}
              onChange={changes => updateRow(row.sourceId, changes)}
            />
          ))}
        </div>

        <div className="pt-3 border-t border-border/60 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={isSaving}
            onClick={() => handleOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={isSaving || includedCount === 0 || hasNamelessCreation}
            onClick={handleSave}
          >
            {isSaving ? 'Salvataggio…' : `Salva in dispensa (${includedCount})`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface DraftRowCardProps {
  row: PantryDraftRow;
  onChange: (changes: Partial<PantryDraftRow>) => void;
}

function DraftRowCard({ row, onChange }: DraftRowCardProps) {
  const existingItem: PantryItem | null = row.existingItem;
  const label = existingItem ? existingItem.name : row.name || 'Nuovo prodotto';

  // Increments get a live caption, so editing the quantity updates "→ diventa…".
  const caption = existingItem
    ? describePantryIncrement(existingItem, Math.max(0, row.qty))
    : row.note;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', !row.include && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <label className="-m-1 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={row.include}
            onChange={e => onChange({ include: e.target.checked })}
            aria-label={`Includi ${label}`}
            className="h-5 w-5 accent-primary"
          />
        </label>

        <div className="flex-1 min-w-0 space-y-2 pt-1.5">
          {existingItem ? (
            <p className="font-medium text-foreground">
              {existingItem.name}
              <span className="ml-2 text-xs font-normal text-muted-foreground">aggiorna la scorta</span>
            </p>
          ) : (
            <input
              type="text"
              value={row.name}
              onChange={e => onChange({ name: e.target.value })}
              disabled={!row.include}
              aria-label="Nome prodotto"
              placeholder="Nome prodotto"
              className={FIELD_CLASS}
            />
          )}

          {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
          {existingItem && !row.isUnitComparable && (
            <p className="text-xs text-primary">Unità non confrontabili: imposta tu l’incremento.</p>
          )}

          <fieldset disabled={!row.include} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                step={0.1}
                value={row.qty}
                onChange={e => onChange({ qty: parseFloat(e.target.value) || 0 })}
                aria-label={existingItem ? 'Quantità da aggiungere' : 'Quantità'}
                className={FIELD_CLASS}
              />
              {existingItem ? (
                // Locked: the update adds to that document's qty in its own unit.
                <p className="flex items-center px-3 text-sm text-muted-foreground">{row.unit}</p>
              ) : (
                <select
                  value={row.unit}
                  onChange={e => onChange({ unit: e.target.value })}
                  aria-label="Unità"
                  className={FIELD_CLASS}
                >
                  {PANTRY_UNITS.map(unit => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={row.categoryId}
                onChange={e => onChange({ categoryId: e.target.value })}
                aria-label="Categoria"
                className={FIELD_CLASS}
              >
                {CATEGORY_OPTIONS.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={row.expires}
                onChange={e => onChange({ expires: e.target.value })}
                aria-label="Scadenza (facoltativa)"
                className={FIELD_CLASS}
              />
            </div>

            <div className="flex gap-2">
              {PANTRY_POSITIONS.map(position => (
                <button
                  key={position.id}
                  type="button"
                  onClick={() => onChange({ position: position.id as PantryItem['position'] })}
                  aria-pressed={row.position === position.id}
                  className={cn(
                    'flex-1 min-h-11 flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium border transition-colors',
                    row.position === position.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:border-primary/40'
                  )}
                >
                  <span>{position.icon}</span>
                  <span>{position.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
