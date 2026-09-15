'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Archive, PlusCircle, CalendarDays, ShoppingCart } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { PantryItem } from '@/types/pantry';
import { PantryMatchInfo } from '@/lib/utils/ingredient-matching';
import { CheckedShoppingEntry } from '@/lib/utils/pantry-batch';
import { ShoppingProgressBar } from './ShoppingProgressBar';
import { ShoppingSection } from './ShoppingSection';
import { AdHocRecipeGroup } from './AdHocRecipeGroup';
import { AddCustomItemSheet } from './AddCustomItemSheet';
import { AddCheckedToPantrySheet } from './AddCheckedToPantrySheet';
import { PantryOwnedRow, PantryOwnedSection } from './PantryOwnedSection';
import { ShoppingPantryContext } from './pantry-row-props';
import { EditorialEmptyState } from '@/components/ui/editorial-empty-state';

interface ShoppingListContentProps {
  items: ShoppingItem[];
  checkedIds: Set<string>;
  sectionNames: string[];
  progress: { checked: number; total: number };
  hasPlan: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAddCustom: (name: string, quantity: string, section?: string) => void;
  adHocRecipes: AdHocShoppingRecipe[];
  onToggleAdHocItem: (groupId: string, itemId: string) => void;
  onRemoveAdHocRecipe: (groupId: string) => void;
  onRemoveAdHocItem: (groupId: string, itemId: string) => void;
  pantryInfoById: Map<string, PantryMatchInfo>;
  pantryOwnedIds: Set<string>;
  onTogglePantryIncluded: (id: string, adHocGroupId?: string) => void;
  onConfirmPantryAlias: (pantryItem: PantryItem, ingredientName: string) => Promise<void>;
  onDismissPantrySuggestion: (id: string) => void;
}

/** Sentinel value used in sectionNames for the null section. */
const NULL_SECTION_SENTINEL = '__null__';
const NULL_SECTION_LABEL = 'Senza categoria';

export function ShoppingListContent({
  items,
  checkedIds,
  sectionNames,
  progress,
  hasPlan,
  onToggle,
  onRemove,
  onAddCustom,
  adHocRecipes,
  onToggleAdHocItem,
  onRemoveAdHocRecipe,
  onRemoveAdHocItem,
  pantryInfoById,
  pantryOwnedIds,
  onTogglePantryIncluded,
  onConfirmPantryAlias,
  onDismissPantrySuggestion,
}: ShoppingListContentProps) {
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [pantrySheetOpen, setPantrySheetOpen] = useState(false);
  const [confirmingSuggestionId, setConfirmingSuggestionId] = useState<string | null>(null);
  const hasAdHoc = adHocRecipes.length > 0;
  const isEmpty = items.length === 0 && !hasAdHoc;

  // Mounted in every branch, empty states included: custom items work without a
  // plan (useShoppingList persists them to localStorage when planId is null), so
  // "Aggiungi articolo" must never depend on hasPlan.
  const addItemSheet = (
    <AddCustomItemSheet
      open={addSheetOpen}
      onOpenChange={setAddSheetOpen}
      onAdd={onAddCustom}
    />
  );

  const addItemButton = (
    <Button variant="outline" onClick={() => setAddSheetOpen(true)}>
      <PlusCircle className="w-4 h-4 mr-2" />
      Aggiungi articolo
    </Button>
  );

  // Ad-hoc groups are global (not tied to a plan/week), so they keep the
  // list usable even when neither of these empty states would otherwise apply.
  if (isEmpty) {
    return (
      <>
        {hasPlan ? (
          <EditorialEmptyState
            icon={<ShoppingCart className="h-5 w-5" />}
            eyebrow="Nessun ingrediente"
            title="Questa settimana resta leggera"
            description="Il piano corrente non contiene ingredienti aggregabili. Puoi aggiungere articoli manuali oppure rivedere le ricette del piano."
            action={addItemButton}
          />
        ) : (
          <EditorialEmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            eyebrow="Settimana vuota"
            title="Nessun piano per questa settimana"
            description="Prima definisci i pasti: la lista della spesa si compone da sola a partire da lì."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button asChild>
                  <Link href="/pianificatore">
                    <CalendarDays className="mr-2 h-4 w-4" />
                    Vai al pianificatore
                  </Link>
                </Button>
                {addItemButton}
              </div>
            }
          />
        )}
        {addItemSheet}
      </>
    );
  }

  async function handleConfirmSuggestion(itemId: string, itemName: string, candidate: PantryItem) {
    setConfirmingSuggestionId(itemId);
    try {
      await onConfirmPantryAlias(candidate, itemName);
      toast.success(`Collegato a "${candidate.name}" in dispensa`);
    } catch (err) {
      console.error('Error confirming pantry alias:', err);
      toast.error('Impossibile collegare il prodotto. Riprova.');
    } finally {
      setConfirmingSuggestionId(null);
    }
  }

  const pantryContext: ShoppingPantryContext = {
    infoById: pantryInfoById,
    confirmingSuggestionId,
    onTogglePantryIncluded,
    onConfirmSuggestion: handleConfirmSuggestion,
    onDismissSuggestion: onDismissPantrySuggestion,
  };

  // Partition: items the pantry covers leave their section for "Hai già in casa"
  // (plan rows first, then ad-hoc rows, each in their on-screen order).
  const visibleItems = items.filter(item => !pantryOwnedIds.has(item.id));
  const pantryOwnedRows: PantryOwnedRow[] = [];
  for (const item of items) {
    const info = pantryInfoById.get(item.id);
    if (pantryOwnedIds.has(item.id) && info?.kind === 'in-pantry') {
      pantryOwnedRows.push({
        id: item.id,
        name: item.name,
        quantity: item.displayQuantity,
        pantryItem: info.item,
      });
    }
  }
  for (const group of adHocRecipes) {
    for (const item of group.items) {
      const info = pantryInfoById.get(item.id);
      if (pantryOwnedIds.has(item.id) && info?.kind === 'in-pantry') {
        pantryOwnedRows.push({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          pantryItem: info.item,
          adHocGroupId: group.id,
        });
      }
    }
  }

  // What "Aggiungi alla dispensa" works on: checked rows the user can see.
  // Parked rows are excluded even if checked earlier — they are already at home.
  const checkedForPantry: CheckedShoppingEntry[] = [
    ...visibleItems
      .filter(item => checkedIds.has(item.id))
      .map(item => ({ id: item.id, name: item.name, quantity: item.displayQuantity })),
    ...adHocRecipes.flatMap(group =>
      group.items
        .filter(item => item.checked && !pantryOwnedIds.has(item.id))
        .map(item => ({ id: item.id, name: item.name, quantity: item.quantity }))
    ),
  ];

  return (
    <div className="space-y-4">
      <ShoppingProgressBar checked={progress.checked} total={progress.total} />

      {visibleItems.length > 0 && (
        <div className="space-y-3">
          {sectionNames.map(sectionKey => {
            const isNull = sectionKey === NULL_SECTION_SENTINEL;
            const sectionLabel = isNull ? NULL_SECTION_LABEL : sectionKey;
            const sectionItems = visibleItems.filter(item =>
              isNull ? item.section === null : item.section === sectionKey
            );

            if (sectionItems.length === 0) return null;

            return (
              <ShoppingSection
                key={sectionKey}
                title={sectionLabel}
                items={sectionItems}
                checkedIds={checkedIds}
                onToggle={onToggle}
                onRemove={onRemove}
                pantryContext={pantryContext}
              />
            );
          })}
        </div>
      )}

      <PantryOwnedSection rows={pantryOwnedRows} onNeedAnyway={onTogglePantryIncluded} />

      {hasAdHoc && (
        <div className="space-y-3">
          {adHocRecipes.map(group => (
            <AdHocRecipeGroup
              key={group.id}
              group={group}
              onToggleItem={itemId => onToggleAdHocItem(group.id, itemId)}
              onRemoveItem={itemId => onRemoveAdHocItem(group.id, itemId)}
              onRemoveGroup={() => onRemoveAdHocRecipe(group.id)}
              pantryOwnedIds={pantryOwnedIds}
              pantryContext={pantryContext}
            />
          ))}
        </div>
      )}

      {checkedForPantry.length > 0 && (
        <Button className="w-full" onClick={() => setPantrySheetOpen(true)}>
          <Archive className="w-4 h-4 mr-2" />
          Aggiungi alla dispensa ({checkedForPantry.length})
        </Button>
      )}

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setAddSheetOpen(true)}
      >
        <PlusCircle className="w-4 h-4 mr-2" />
        Aggiungi articolo
      </Button>

      {addItemSheet}
      <AddCheckedToPantrySheet
        open={pantrySheetOpen}
        onOpenChange={setPantrySheetOpen}
        checkedItems={checkedForPantry}
      />
    </div>
  );
}
