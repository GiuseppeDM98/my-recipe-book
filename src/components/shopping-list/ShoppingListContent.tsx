'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusCircle, CalendarDays, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { ShoppingProgressBar } from './ShoppingProgressBar';
import { ShoppingSection } from './ShoppingSection';
import { AdHocRecipeGroup } from './AdHocRecipeGroup';
import { AddCustomItemSheet } from './AddCustomItemSheet';
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
}: ShoppingListContentProps) {
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const hasAdHoc = adHocRecipes.length > 0;

  // Ad-hoc groups are global (not tied to a plan/week), so they keep the
  // list usable even when neither of these empty states would otherwise apply.
  if (!hasPlan && items.length === 0 && !hasAdHoc) {
    return (
      <EditorialEmptyState
        icon={<CalendarDays className="h-5 w-5" />}
        eyebrow="Settimana vuota"
        title="Nessun piano per questa settimana"
        description="Prima definisci i pasti: la lista della spesa si compone da sola a partire da lì."
        action={
          <Button asChild>
            <Link href="/pianificatore">
              <CalendarDays className="mr-2 h-4 w-4" />
              Vai al pianificatore
            </Link>
          </Button>
        }
      />
    );
  }

  if (hasPlan && items.length === 0 && !hasAdHoc) {
    return (
      <EditorialEmptyState
        icon={<ShoppingCart className="h-5 w-5" />}
        eyebrow="Nessun ingrediente"
        title="Questa settimana resta leggera"
        description="Il piano corrente non contiene ingredienti aggregabili. Puoi aggiungere articoli manuali oppure rivedere le ricette del piano."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ShoppingProgressBar checked={progress.checked} total={progress.total} />

      {items.length > 0 && (
        <div className="space-y-3">
          {sectionNames.map(sectionKey => {
            const isNull = sectionKey === NULL_SECTION_SENTINEL;
            const sectionLabel = isNull ? NULL_SECTION_LABEL : sectionKey;
            const sectionItems = items.filter(item =>
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
              />
            );
          })}
        </div>
      )}

      {hasAdHoc && (
        <div className="space-y-3">
          {adHocRecipes.map(group => (
            <AdHocRecipeGroup
              key={group.id}
              group={group}
              onToggleItem={itemId => onToggleAdHocItem(group.id, itemId)}
              onRemoveItem={itemId => onRemoveAdHocItem(group.id, itemId)}
              onRemoveGroup={() => onRemoveAdHocRecipe(group.id)}
            />
          ))}
        </div>
      )}

      {hasPlan && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setAddSheetOpen(true)}
        >
          <PlusCircle className="w-4 h-4 mr-2" />
          Aggiungi articolo
        </Button>
      )}

      <AddCustomItemSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onAdd={onAddCustom}
      />
    </div>
  );
}
