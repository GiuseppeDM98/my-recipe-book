'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PlusCircle, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingItem } from '@/types';
import { ShoppingProgressBar } from './ShoppingProgressBar';
import { ShoppingSection } from './ShoppingSection';
import { AddCustomItemSheet } from './AddCustomItemSheet';

interface ShoppingListContentProps {
  items: ShoppingItem[];
  checkedIds: Set<string>;
  sectionNames: string[];
  progress: { checked: number; total: number };
  hasPlan: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAddCustom: (name: string, quantity: string, section?: string) => void;
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
}: ShoppingListContentProps) {
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  if (!hasPlan) {
    return (
      <Card className="p-12 text-center">
        <CalendarDays className="w-16 h-16 mx-auto mb-4 text-gray-400" />
        <h2 className="text-xl font-semibold mb-2 text-gray-700">
          Nessun piano per questa settimana
        </h2>
        <p className="text-gray-500 mb-6">
          Crea un piano pasti per generare automaticamente la lista della spesa.
        </p>
        <Button asChild>
          <Link href="/pianificatore">
            <CalendarDays className="w-4 h-4 mr-2" />
            Vai al pianificatore
          </Link>
        </Button>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-gray-500">Il piano non contiene ricette con ingredienti.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ShoppingProgressBar checked={progress.checked} total={progress.total} />

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

      <Button
        variant="outline"
        className="w-full"
        onClick={() => setAddSheetOpen(true)}
      >
        <PlusCircle className="w-4 h-4 mr-2" />
        Aggiungi articolo
      </Button>

      <AddCustomItemSheet
        open={addSheetOpen}
        onOpenChange={setAddSheetOpen}
        onAdd={onAddCustom}
      />
    </div>
  );
}
