'use client';

import { useState, useMemo } from 'react';
import { Archive, Bell, Plus, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { usePantry } from '@/lib/hooks/usePantry';
import { useRecipes } from '@/lib/hooks/useRecipes';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, stockLevel, PANTRY_CATEGORIES } from '@/lib/utils/pantry-utils';
import {
  PantryHero,
  ExpiringStrip,
  CookableSuggestions,
  PantrySearchFilters,
  PantryItemRow,
  PantryAddSheet,
  PantryItemQuickSheet,
  PantryNotificationsSheet,
  PantryDesktopSidebar,
} from '@/components/pantry';

type PositionFilter = 'all' | 'frigo' | 'dispensa' | 'freezer';
type ActiveSheet = 'add' | 'notifications' | null;

interface CategorySectionProps {
  categoryId: string;
  categoryName: string;
  items: PantryItem[];
  onItemClick: (item: PantryItem) => void;
  onEdit: (item: PantryItem) => void;
}

function CategorySection({ categoryId, categoryName, items, onItemClick, onEdit }: CategorySectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="flex items-center justify-between w-full py-2 text-left group"
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">
          {categoryName} <span className="font-normal">({items.length})</span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            isOpen ? 'rotate-0' : '-rotate-90'
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-in-out motion-reduce:transition-none',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pb-4">
            {items.map(item => (
              <PantryItemRow
                key={item.id}
                item={item}
                onClick={onItemClick}
                onEdit={onEdit}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DispensaPage() {
  const { items, isLoading } = usePantry();
  const { recipes } = useRecipes();

  const [search, setSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<PositionFilter>('all');
  const [onlyExpiring, setOnlyExpiring] = useState(false);
  const [openItem, setOpenItem] = useState<PantryItem | null>(null);
  const [editItem, setEditItem] = useState<PantryItem | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  const expiringCount = useMemo(
    () =>
      items.filter(item => {
        const { status } = expiryStatus(item.expires);
        return status === 'scaduto' || status === 'oggi' || status === 'urgente' || status === 'presto';
      }).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (positionFilter !== 'all' && item.position !== positionFilter) return false;
      if (search && !item.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (onlyExpiring) {
        const { status } = expiryStatus(item.expires);
        if (status !== 'scaduto' && status !== 'oggi' && status !== 'urgente' && status !== 'presto') return false;
      }
      return true;
    });
  }, [items, positionFilter, search, onlyExpiring]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, PantryItem[]>();
    for (const item of filteredItems) {
      if (!map.has(item.categoryId)) map.set(item.categoryId, []);
      map.get(item.categoryId)!.push(item);
    }
    return map;
  }, [filteredItems]);

  function handleEditItem(item: PantryItem) {
    setEditItem(item);
    setActiveSheet('add');
  }

  function handleAddSheetClose(isOpen: boolean) {
    if (!isOpen) {
      setEditItem(null);
      setActiveSheet(null);
    }
  }

  return (
    <>
      <div className="max-w-5xl mx-auto">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-3">
            <Archive className="w-8 h-8 text-primary flex-shrink-0" />
            <div>
              <h1 className="font-display text-4xl font-semibold italic">Dispensa</h1>
              {!isLoading && (
                <p className="text-muted-foreground text-sm">
                  {items.length} {items.length === 1 ? 'alimento' : 'alimenti'}
                  {expiringCount > 0 && (
                    <> — <span className="text-destructive font-medium">{expiringCount} da usare presto</span></>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveSheet('notifications')}
              className="relative"
            >
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Avvisi</span>
              {expiringCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {expiringCount > 9 ? '9+' : expiringCount}
                </span>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => { setEditItem(null); setActiveSheet('add'); }}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1.5">Aggiungi</span>
            </Button>
          </div>
        </div>

        {/* Main layout */}
        <div className="lg:flex lg:gap-8">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                <div className="rounded-full bg-muted p-6">
                  <Archive className="h-12 w-12 text-muted-foreground" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-semibold italic text-foreground">
                    Cominciamo dalla tua cucina
                  </h2>
                  <p className="text-muted-foreground mt-2 max-w-sm mx-auto text-sm leading-relaxed">
                    Aggiungi i prodotti che hai in frigo, dispensa e freezer. Ti aiuteremo a non sprecare nulla.
                  </p>
                </div>
                <Button onClick={() => { setEditItem(null); setActiveSheet('add'); }}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Aggiungi il primo prodotto
                </Button>
              </div>
            ) : (
              <>
                <PantryHero items={items} />

                <ExpiringStrip items={items} onItemClick={setOpenItem} />

                <CookableSuggestions pantryItems={items} recipes={recipes} />

                <PantrySearchFilters
                  search={search}
                  onSearchChange={setSearch}
                  positionFilter={positionFilter}
                  onPositionChange={setPositionFilter}
                  onlyExpiring={onlyExpiring}
                  onOnlyExpiringChange={setOnlyExpiring}
                />

                {/* Category groups */}
                {filteredItems.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Nessun prodotto corrisponde ai filtri selezionati.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {PANTRY_CATEGORIES.filter(cat => itemsByCategory.has(cat.id)).map(cat => (
                      <CategorySection
                        key={cat.id}
                        categoryId={cat.id}
                        categoryName={cat.name}
                        items={itemsByCategory.get(cat.id)!}
                        onItemClick={setOpenItem}
                        onEdit={handleEditItem}
                      />
                    ))}
                    {/* Items with unknown category */}
                    {(() => {
                      const knownIds = new Set(PANTRY_CATEGORIES.map(c => c.id));
                      const unknownItems = filteredItems.filter(item => !knownIds.has(item.categoryId));
                      if (unknownItems.length === 0) return null;
                      return (
                        <CategorySection
                          categoryId="altro"
                          categoryName="Altro"
                          items={unknownItems}
                          onItemClick={setOpenItem}
                          onEdit={handleEditItem}
                        />
                      );
                    })()}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Desktop sidebar */}
          <PantryDesktopSidebar items={items} />
        </div>
      </div>

      {/* Sheets */}
      <PantryAddSheet
        open={activeSheet === 'add'}
        onOpenChange={handleAddSheetClose}
        editItem={editItem}
      />

      <PantryNotificationsSheet
        open={activeSheet === 'notifications'}
        onOpenChange={open => !open && setActiveSheet(null)}
        items={items}
      />

      <PantryItemQuickSheet
        item={openItem}
        onClose={() => setOpenItem(null)}
        onEdit={handleEditItem}
      />
    </>
  );
}
