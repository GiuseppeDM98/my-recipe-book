'use client';

import { useState } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentWeekMonday, addWeeksToDateString } from '@/lib/constants/seasons';
import { useShoppingList } from '@/lib/hooks/useShoppingList';
import { ShoppingListContent } from '@/components/shopping-list/ShoppingListContent';
import { Skeleton } from '@/components/ui/skeleton';

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;
}

export default function ListaSpesaPage() {
  const [weekStartDate, setWeekStartDate] = useState(getCurrentWeekMonday);

  const {
    items,
    checkedIds,
    isLoading,
    hasPlan,
    toggleItem,
    addCustomItem,
    removeCustomItem,
    clearChecked,
    sectionNames,
    progress,
  } = useShoppingList(weekStartDate);

  function goToPrevWeek() {
    setWeekStartDate(prev => addWeeksToDateString(prev, -1));
  }

  function goToNextWeek() {
    setWeekStartDate(prev => addWeeksToDateString(prev, 1));
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-primary flex-shrink-0" />
          <div>
            <h1 className="font-display text-4xl font-semibold italic">Lista della spesa</h1>
            <p className="text-muted-foreground">
              Ingredienti aggregati dal piano pasti settimanale.
            </p>
          </div>
        </div>

        {progress.checked > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearChecked}
            className="flex-shrink-0"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Azzera spunti
          </Button>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <Button variant="ghost" size="icon" onClick={goToPrevWeek} aria-label="Settimana precedente">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Settimana del</p>
          <p className="font-medium text-sm">{formatWeekLabel(weekStartDate)}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={goToNextWeek} aria-label="Settimana successiva">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4 py-2">
          <div className="rounded-[1.5rem] border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2 w-2/3 rounded-full" />
          </div>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[1.4rem] border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <div key={rowIndex} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded-md" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <ShoppingListContent
          items={items}
          checkedIds={checkedIds}
          sectionNames={sectionNames}
          progress={progress}
          hasPlan={hasPlan}
          onToggle={toggleItem}
          onRemove={removeCustomItem}
          onAddCustom={addCustomItem}
        />
      )}
    </div>
  );
}
