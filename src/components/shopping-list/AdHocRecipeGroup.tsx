'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { AdHocShoppingRecipe } from '@/types';
import { ShoppingItemRow } from './ShoppingItemRow';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { buildPantryRowProps, ShoppingPantryContext } from './pantry-row-props';

interface AdHocRecipeGroupProps {
  group: AdHocShoppingRecipe;
  onToggleItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onRemoveGroup: () => void;
  /** Ids shown in "Hai già in casa": hidden here and left out of the counter. */
  pantryOwnedIds?: Set<string>;
  pantryContext?: ShoppingPantryContext;
}

/**
 * One "Voglio preparare questo" section — a recipe's ingredients added ad-hoc
 * to the shopping list, independent of the weekly plan sections above it.
 *
 * "Rimuovi ricetta" removes the whole group, so it goes through ConfirmDialog
 * (destructive); per-item removal doesn't need confirmation, same as custom
 * plan items in ShoppingItemRow.
 */
export function AdHocRecipeGroup({
  group,
  onToggleItem,
  onRemoveItem,
  onRemoveGroup,
  pantryOwnedIds,
  pantryContext,
}: AdHocRecipeGroupProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const visibleItems = group.items.filter(item => !pantryOwnedIds?.has(item.id));
  const checkedCount = visibleItems.filter(item => item.checked).length;
  const allChecked = checkedCount === visibleItems.length && visibleItems.length > 0;
  // The header stays even when the pantry covers every ingredient, so the
  // group can still be removed.
  const isFullyCoveredByPantry = group.items.length > 0 && visibleItems.length === 0;

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-sm',
          allChecked ? 'text-accent bg-accent/8 border border-accent/30' : 'text-foreground bg-muted/60'
        )}
      >
        <span className="flex-1 truncate">
          {allChecked && '✓ '}
          {group.recipeTitle}
        </span>
        <span className={cn('text-xs font-normal', allChecked ? 'text-accent' : 'text-muted-foreground')}>
          {checkedCount}/{visibleItems.length}
        </span>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          aria-label={`Rimuovi ricetta ${group.recipeTitle} dalla lista della spesa`}
          className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1 pl-2 pt-1">
        {isFullyCoveredByPantry && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Hai già tutto in casa: trovi gli ingredienti in “Hai già in casa”.
          </p>
        )}
        {visibleItems.map(item => (
          <ShoppingItemRow
            key={item.id}
            name={item.name}
            quantity={item.quantity}
            checked={item.checked}
            {...buildPantryRowProps(item.id, item.name, pantryContext, group.id)}
            onToggle={() => onToggleItem(item.id)}
            onRemove={() => onRemoveItem(item.id)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Rimuovere "${group.recipeTitle}" dalla lista della spesa?`}
        description="Tutti gli ingredienti di questa ricetta verranno rimossi dalla sezione dedicata."
        confirmLabel="Rimuovi ricetta"
        onConfirm={() => {
          onRemoveGroup();
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}
