'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getCurrentWeekMonday, addWeeksToDateString } from '@/lib/constants/seasons';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePantry } from '@/lib/hooks/usePantry';
import { useDepartmentOverrides } from '@/lib/hooks/useDepartmentOverrides';
import { useShoppingList } from '@/lib/hooks/useShoppingList';
import { canonicalIngredientKey } from '@/lib/utils/ingredient-matching';
import { ShoppingListContent } from '@/components/shopping-list/ShoppingListContent';
import { ShoppingViewMode } from '@/components/shopping-list/ShoppingViewToggle';
import { Skeleton } from '@/components/ui/skeleton';

const DEFAULT_VIEW_MODE: ShoppingViewMode = 'reparto';

function viewModeStorageKey(uid: string): string {
  return `shopping_list_view:${uid}`;
}

function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.getDate()}-${end.getDate()} ${end.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}`;
}

export default function ListaSpesaPage() {
  const [weekStartDate, setWeekStartDate] = useState(getCurrentWeekMonday);
  const { user } = useAuth();
  const { items: pantryItems } = usePantry();
  const { overrides: departmentOverrides, setOverride } = useDepartmentOverrides();

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
    adHocRecipes,
    toggleAdHocItem,
    removeAdHocRecipe,
    removeAdHocItem,
    pantryInfoById,
    pantryOwnedIds,
    togglePantryIncluded,
    confirmPantryAlias,
    dismissPantrySuggestion,
  } = useShoppingList(weekStartDate);

  // Pure presentation preference: per-device localStorage, not Firestore (see
  // ShoppingViewToggle doc). SSR always renders the default; the saved value
  // is applied post-mount so there is no hydration mismatch (ThemePicker's
  // `mounted` pattern, AGENTS.md).
  const [viewMode, setViewMode] = useState<ShoppingViewMode>(DEFAULT_VIEW_MODE);
  useEffect(() => {
    if (!user) return;
    try {
      const saved = localStorage.getItem(viewModeStorageKey(user.uid));
      if (saved === 'reparto' || saved === 'ricetta') setViewMode(saved);
    } catch {
      // Storage unavailable — keep the default.
    }
  }, [user]);

  function handleViewModeChange(mode: ShoppingViewMode) {
    setViewMode(mode);
    if (!user) return;
    try {
      localStorage.setItem(viewModeStorageKey(user.uid), mode);
    } catch {
      // Storage quota exceeded or unavailable — the choice just won't persist.
    }
  }

  // The custom-item sheet's optional department select reuses the override
  // mechanism (chain link 2, §4.2): no new field on ShoppingItem.
  function handleAddCustom(name: string, quantity: string, section?: string, departmentId?: string) {
    addCustomItem(name, quantity, section);
    if (departmentId) {
      setOverride.mutate({ canonicalKey: canonicalIngredientKey(name), departmentId });
    }
  }

  function handleSetDepartmentOverride(canonicalKey: string, departmentId: string) {
    setOverride.mutate({ canonicalKey, departmentId });
  }

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
          onAddCustom={handleAddCustom}
          adHocRecipes={adHocRecipes}
          onToggleAdHocItem={toggleAdHocItem}
          onRemoveAdHocRecipe={removeAdHocRecipe}
          onRemoveAdHocItem={removeAdHocItem}
          pantryInfoById={pantryInfoById}
          pantryOwnedIds={pantryOwnedIds}
          onTogglePantryIncluded={togglePantryIncluded}
          onConfirmPantryAlias={confirmPantryAlias}
          onDismissPantrySuggestion={dismissPantrySuggestion}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          pantryItems={pantryItems}
          departmentOverrides={departmentOverrides}
          onSetDepartmentOverride={handleSetDepartmentOverride}
        />
      )}
    </div>
  );
}
