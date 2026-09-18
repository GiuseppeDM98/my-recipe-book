'use client';

import { useState } from 'react';
import { Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { PantryItem } from '@/types/pantry';
import { pantryStockLabel } from './pantry-row-props';

export interface PantryOwnedRow {
  id: string;
  name: string;
  /** Quantity the list would ask for, shown next to the name for comparison. */
  quantity: string;
  pantryItem: PantryItem;
  /** Set for "Voglio preparare questo" items, absent for plan items. */
  adHocGroupId?: string;
}

interface PantryOwnedSectionProps {
  rows: PantryOwnedRow[];
  onNeedAnyway: (itemId: string, adHocGroupId?: string) => void;
}

/**
 * "Hai già in casa" — list items the pantry already covers, parked out of the
 * shopping flow.
 *
 * Collapsed by default and without checkboxes: there is nothing to buy here.
 * Each row can go back to its original section with "Mi serve comunque"
 * (always visible, 44px — used on a phone in the supermarket).
 */
export function PantryOwnedSection({ rows, onNeedAnyway }: PantryOwnedSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-semibold text-sm text-foreground transition-colors hover:bg-muted"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <Archive className="w-4 h-4 flex-shrink-0 text-accent" />
        <span className="flex-1 truncate">Hai già in casa</span>
        <span className="text-xs font-normal text-muted-foreground">{rows.length}</span>
      </button>

      {/* Grid animation — GPU-friendly, niente max-height thrash */}
      <div
        className={cn(
          'grid motion-reduce:transition-none',
          'transition-[grid-template-rows] duration-200 ease-in-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pl-2 pt-1">
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Le scorte in dispensa bastano: non li contiamo nella spesa.
            </p>
            {rows.map(row => (
              <div
                key={row.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{row.name}</span>
                  {row.quantity && (
                    <span className="ml-2 text-sm text-muted-foreground">{row.quantity}</span>
                  )}
                  <p className="mt-0.5 text-xs font-medium text-accent">
                    {pantryStockLabel(row.pantryItem)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNeedAnyway(row.id, row.adHocGroupId)}
                  aria-label={`${row.name}: mi serve comunque, rimetti in lista`}
                  className="min-h-11 flex-shrink-0 rounded-md px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  Mi serve comunque
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
