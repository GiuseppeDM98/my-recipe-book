'use client';

import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface ShoppingItemRowProps {
  name: string;
  quantity?: string;
  checked: boolean;
  /** Small caption under the name (e.g. recipe/day source, or "Aggiunto manualmente"). */
  footnote?: string;
  /** Pantry stock caption ("In dispensa: 500 g"), shown as a sage pill after the footnote. */
  pantryBadge?: string;
  /** Unobtrusive text action at the end of the row (e.g. "Ce l'ho già"). */
  secondaryAction?: { label: string; ariaLabel: string; onClick: () => void };
  /** Pantry match proposal, shown under the row until confirmed or dismissed. */
  suggestion?: {
    candidateName: string;
    isConfirming: boolean;
    onConfirm: () => void;
    onDismiss: () => void;
  };
  onToggle: () => void;
  onRemove?: () => void;
}

/**
 * Renders a single checkable row. Deliberately generic (name/quantity/footnote
 * instead of a `ShoppingItem`) so it serves both plan-derived/custom items
 * (ShoppingSection) and ad-hoc "Voglio preparare questo" items
 * (AdHocRecipeGroup) without branching on item shape.
 *
 * Every action is always visible and at least 44px tall: the list is used
 * one-handed on a phone while shopping, where hover never fires.
 */
export function ShoppingItemRow({
  name,
  quantity,
  checked,
  footnote,
  pantryBadge,
  secondaryAction,
  suggestion,
  onToggle,
  onRemove,
}: ShoppingItemRowProps) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        checked ? 'opacity-50 bg-muted' : 'bg-background hover:bg-secondary'
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-checked={checked}
          role="checkbox"
          aria-label={`${checked ? 'Deseleziona' : 'Segna come acquistato'}: ${name}`}
          className={cn(
            'mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center',
            checked
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-input hover:border-primary'
          )}
        >
          {checked && (
            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <span className={cn('font-medium', checked && 'line-through text-muted-foreground')}>
            {name}
          </span>
          {quantity && (
            <span className="ml-2 text-sm text-muted-foreground">{quantity}</span>
          )}
          {(footnote || pantryBadge) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              {footnote && <span className="min-w-0 max-w-full truncate">{footnote}</span>}
              {pantryBadge && (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
                  {pantryBadge}
                </span>
              )}
            </div>
          )}
        </div>

        {secondaryAction && (
          // Negative margin keeps the 44px hit area without making the row taller.
          <button
            type="button"
            onClick={secondaryAction.onClick}
            aria-label={secondaryAction.ariaLabel}
            className="-my-3 flex min-h-11 flex-shrink-0 items-center px-2 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {secondaryAction.label}
          </button>
        )}

        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Rimuovi ${name}`}
            className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Hidden once checked: the item is already in the cart, nothing to decide.
          It comes back if the item is unchecked. */}
      {suggestion && !checked && (
        <div className="flex flex-wrap items-center gap-x-2 border-t border-border/60 pl-12 pr-2 text-xs text-muted-foreground">
          <span className="py-2">
            {'Forse ce l’hai già: '}
            <span className="font-semibold text-foreground">{suggestion.candidateName}</span>
            {' — è lo stesso?'}
          </span>
          <span className="flex items-center">
            <button
              type="button"
              onClick={suggestion.onConfirm}
              disabled={suggestion.isConfirming}
              className="min-h-11 rounded-md px-2 font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
            >
              Sì, è lo stesso
            </button>
            <button
              type="button"
              onClick={suggestion.onDismiss}
              disabled={suggestion.isConfirming}
              className="min-h-11 rounded-md px-3 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              No
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
