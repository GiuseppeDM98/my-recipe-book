import type { PantryMatchInfo } from '@/lib/utils/ingredient-matching';
import { formatQty } from '@/lib/utils/pantry-utils';
import type { PantryItem } from '@/types/pantry';
import type { ShoppingItemRowProps } from './ShoppingItemRow';

/**
 * Everything a shopping list group needs to render pantry information on its
 * rows. Built once in ShoppingListContent and handed to both the plan sections
 * and the ad-hoc groups, so the two never diverge on what a badge means.
 */
export interface ShoppingPantryContext {
  infoById: Map<string, PantryMatchInfo>;
  /** Row whose "Sì, è lo stesso" is being saved (disables its buttons). */
  confirmingSuggestionId: string | null;
  onTogglePantryIncluded: (itemId: string, adHocGroupId?: string) => void;
  onConfirmSuggestion: (itemId: string, itemName: string, candidate: PantryItem) => void;
  onDismissSuggestion: (itemId: string) => void;
}

export function pantryStockLabel(item: PantryItem): string {
  return `In dispensa: ${formatQty(item)}`;
}

/**
 * Pantry-derived props for a row VISIBLE in the normal list. Rows parked in
 * "Hai già in casa" never reach this function, so a visible 'in-pantry' row is
 * necessarily one the user re-included: it gets "Ce l'ho già" to send it back.
 */
export function buildPantryRowProps(
  itemId: string,
  itemName: string,
  context: ShoppingPantryContext | undefined,
  adHocGroupId?: string
): Pick<ShoppingItemRowProps, 'pantryBadge' | 'secondaryAction' | 'suggestion'> {
  const info = context?.infoById.get(itemId);
  if (!context || !info) return {};

  switch (info.kind) {
    case 'in-pantry':
      return {
        pantryBadge: pantryStockLabel(info.item),
        secondaryAction: {
          label: 'Ce l’ho già',
          ariaLabel: `${itemName}: ce l’ho già, togli dalla spesa`,
          onClick: () => context.onTogglePantryIncluded(itemId, adHocGroupId),
        },
      };
    case 'badge':
      // "mancano 50 g" answers the question the bare stock caption left open:
      // the row quantity is what the recipes need, not what to buy.
      return {
        pantryBadge: info.missingQuantity
          ? `${pantryStockLabel(info.item)} · ${info.missingQuantity.startsWith('1 ') ? 'manca' : 'mancano'} ${info.missingQuantity}`
          : pantryStockLabel(info.item),
      };
    case 'suggestion': {
      // Only the most similar candidate: one clear yes/no, no carousel.
      const candidate = info.candidates[0];
      return {
        suggestion: {
          candidateName: candidate.name,
          isConfirming: context.confirmingSuggestionId === itemId,
          onConfirm: () => context.onConfirmSuggestion(itemId, itemName, candidate),
          onDismiss: () => context.onDismissSuggestion(itemId),
        },
      };
    }
    case 'none':
      return {};
  }
}
