'use client';

import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ShoppingItemRowProps {
  name: string;
  quantity?: string;
  checked: boolean;
  /** Small caption under the name (e.g. recipe/day source, or "Aggiunto manualmente"). */
  footnote?: string;
  onToggle: () => void;
  onRemove?: () => void;
}

/**
 * Renders a single checkable row. Deliberately generic (name/quantity/footnote
 * instead of a `ShoppingItem`) so it serves both plan-derived/custom items
 * (ShoppingSection) and ad-hoc "Voglio preparare questo" items
 * (AdHocRecipeGroup) without branching on item shape.
 */
export function ShoppingItemRow({ name, quantity, checked, footnote, onToggle, onRemove }: ShoppingItemRowProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border transition-colors',
        checked ? 'opacity-50 bg-muted' : 'bg-background hover:bg-secondary'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-checked={checked}
        role="checkbox"
        aria-label={`${checked ? 'Deseleziona' : 'Segna come acquistato'}: ${name}`}
        className={cn(
          'mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 transition-colors flex items-center justify-center',
          checked
            ? 'bg-primary border-primary text-white'
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
        {footnote && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{footnote}</p>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Rimuovi ${name}`}
          className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
