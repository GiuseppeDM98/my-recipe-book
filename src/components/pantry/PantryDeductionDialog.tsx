'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils/cn';
import { formatQty } from '@/lib/utils/pantry-utils';
import type { PantryIncomparableReason } from '@/lib/utils/ingredient-matching';
import {
  ConfirmedDeduction,
  PantryDeductionRow,
  proposeDeductQty,
} from '@/lib/utils/pantry-deduction';
import type { PantryItem } from '@/types/pantry';

interface PantryDeductionDialogProps {
  open: boolean;
  /** Dismissing (Esc, backdrop, ✕) only closes the dialog: cooking is not finished. */
  onOpenChange: (open: boolean) => void;
  rows: PantryDeductionRow[];
  isSubmitting: boolean;
  /** "Aggiorna e termina": deduct the selected rows, then finish cooking. */
  onConfirm: (deductions: ConfirmedDeduction[]) => void;
  /** "Salta": finish cooking without touching the pantry. */
  onSkip: () => void;
}

const EXCLUDED_REASON_LABELS: Record<PantryIncomparableReason, string> = {
  unparsable: 'Quantità non quantificabile (es. q.b.)',
  'dimension-mismatch': 'Unità non confrontabili',
  'unit-mismatch': 'Unità non confrontabili',
  empty: 'Scorta già a zero',
};

interface RowDraft {
  include: boolean;
  /** Deduction in the entry's unit; null when a suggestion can't be compared. */
  qty: number | null;
}

function initialDraft(row: PantryDeductionRow): RowDraft {
  switch (row.kind) {
    case 'proposed':
      return { include: true, qty: row.deductQty };
    case 'suggestion':
      // Off by default: an unconfirmed match must never deduct on its own.
      return { include: false, qty: proposeDeductQty(row.scaledQuantity, row.candidate) };
    case 'excluded':
      return { include: false, qty: null };
  }
}

/**
 * "Scala la dispensa" — proposed at "Termina cottura" when the recipe's
 * ingredients match pantry entries.
 *
 * A dedicated dialog rather than ConfirmDialog: the rows are editable, and the
 * action is not binary-destructive (stock is clamped to 0, never deleted).
 */
export function PantryDeductionDialog({
  open,
  onOpenChange,
  rows,
  isSubmitting,
  onConfirm,
  onSkip,
}: PantryDeductionDialogProps) {
  const [drafts, setDrafts] = useState<RowDraft[]>([]);

  // Reset the drafts once per opening, not on every parent render.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) setDrafts(rows.map(initialDraft));
    wasOpenRef.current = open;
  }, [open, rows]);

  function updateDraft(index: number, changes: Partial<RowDraft>) {
    setDrafts(prev => prev.map((draft, i) => (i === index ? { ...draft, ...changes } : draft)));
  }

  function handleConfirm() {
    const deductions: ConfirmedDeduction[] = [];

    rows.forEach((row, index) => {
      const draft = drafts[index];
      if (!draft?.include) return;

      if (row.kind === 'proposed') {
        deductions.push({ pantryItem: row.pantryItem, deductQty: clampToStock(draft.qty, row.pantryItem), aliasIngredientName: null });
      } else if (row.kind === 'suggestion') {
        if (draft.qty === null) {
          console.warn(
            `Pantry deduction: "${row.ingredientName}" linked to "${row.candidate.name}" but units are not comparable, nothing deducted`
          );
        }
        // The link is saved either way: the user confirmed it is the same product.
        deductions.push({
          pantryItem: row.candidate,
          deductQty: clampToStock(draft.qty, row.candidate),
          aliasIngredientName: row.ingredientName,
        });
      }
    });

    onConfirm(deductions);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] flex-col gap-4 overflow-hidden rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-semibold italic">Scala la dispensa</DialogTitle>
          <DialogDescription>Hai usato questi ingredienti: aggiorno le scorte?</DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 space-y-2 overflow-y-auto px-6">
          {rows.map((row, index) => (
            <DeductionRowCard
              key={`${row.kind}-${row.ingredientName}-${index}`}
              row={row}
              draft={drafts[index] ?? initialDraft(row)}
              disabled={isSubmitting}
              onChange={changes => updateDraft(index, changes)}
            />
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onSkip} disabled={isSubmitting}>
            Salta
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Aggiornamento…' : 'Aggiorna e termina'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function clampToStock(qty: number | null, item: PantryItem): number {
  return Math.min(Math.max(0, qty ?? 0), item.qty);
}

interface DeductionRowCardProps {
  row: PantryDeductionRow;
  draft: RowDraft;
  disabled: boolean;
  onChange: (changes: Partial<RowDraft>) => void;
}

function DeductionRowCard({ row, draft, disabled, onChange }: DeductionRowCardProps) {
  if (row.kind === 'excluded') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 opacity-70">
        <span className="min-w-11" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-foreground">
            {row.ingredientName} <span className="text-muted-foreground">→ {row.pantryItem.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">{EXCLUDED_REASON_LABELS[row.reason]}</p>
        </div>
      </div>
    );
  }

  const pantryItem = row.kind === 'proposed' ? row.pantryItem : row.candidate;
  const deductQty = clampToStock(draft.qty, pantryItem);
  const label = row.kind === 'proposed' ? `${row.ingredientName} → ${pantryItem.name}` : row.ingredientName;

  return (
    <div className={cn('flex items-start gap-2 rounded-xl border border-border bg-card p-3', !draft.include && 'opacity-70')}>
      <label className="-m-1 flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={draft.include}
          disabled={disabled}
          onChange={e => onChange({ include: e.target.checked })}
          aria-label={`Scala ${label}`}
          className="h-5 w-5 accent-primary"
        />
      </label>

      <div className="min-w-0 flex-1 space-y-2 pt-2 text-sm">
        {row.kind === 'proposed' ? (
          <p className="text-foreground">
            {row.ingredientName} <span className="text-muted-foreground">→ {pantryItem.name}</span>
          </p>
        ) : (
          <p className="text-foreground">
            Forse è <span className="font-semibold">{pantryItem.name}</span>
            <span className="text-muted-foreground"> — conferma per scalare</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {row.kind === 'suggestion' && `${row.ingredientName} · `}
          Usati: {row.scaledQuantity || 'quantità non indicata'}
        </p>

        {draft.qty !== null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label className="flex items-center gap-2">
              <span className="sr-only">Quantità da scalare da {pantryItem.name}</span>
              <input
                type="number"
                min={0}
                max={pantryItem.qty}
                step={0.1}
                value={draft.qty}
                disabled={disabled || !draft.include}
                onChange={e => onChange({ qty: parseFloat(e.target.value) || 0 })}
                className="w-24 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              <span className="text-muted-foreground">{pantryItem.unit}</span>
            </label>
            <span className="text-xs text-muted-foreground">
              {formatQty(pantryItem)} → {formatQty({ ...pantryItem, qty: roundForDisplay(pantryItem.qty - deductQty) })}
            </span>
          </div>
        )}

        {row.kind === 'suggestion' && draft.include && draft.qty === null && (
          <p className="text-xs text-primary">
            Unità non confrontabili: collego il prodotto, ma la scorta resta invariata.
          </p>
        )}
      </div>
    </div>
  );
}

function roundForDisplay(value: number): number {
  return Math.max(0, Math.round(value * 1000) / 1000);
}
