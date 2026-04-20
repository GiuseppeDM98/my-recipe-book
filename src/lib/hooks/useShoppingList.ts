'use client';

import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { getMealPlanByWeek } from '@/lib/firebase/meal-plans';
import { getRecipesByIds } from '@/lib/firebase/firestore';
import { buildContributions, aggregateIngredients } from '@/lib/utils/ingredient-aggregator';
import { MealType, ShoppingItem } from '@/types';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function storageKey(userId: string, weekStartDate: string): string {
  return `shopping_list:${userId}:${weekStartDate}`;
}

interface PersistedState {
  checkedIds: string[];
  customItems: ShoppingItem[];
}

function loadPersistedState(key: string): PersistedState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { checkedIds: [], customItems: [] };
    return JSON.parse(raw) as PersistedState;
  } catch {
    return { checkedIds: [], customItems: [] };
  }
}

function savePersistedState(key: string, state: PersistedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or unavailable — silently skip.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseShoppingListReturn {
  items: ShoppingItem[];
  checkedIds: Set<string>;
  isLoading: boolean;
  hasPlan: boolean;
  toggleItem: (id: string) => void;
  addCustomItem: (name: string, quantity: string, section?: string) => void;
  removeCustomItem: (id: string) => void;
  clearChecked: () => void;
  sectionNames: string[];
  progress: { checked: number; total: number };
}

/**
 * Provides the weekly shopping list for a given weekStartDate.
 *
 * DATA FLOW:
 * 1. React Query fetches the MealPlan + all referenced recipes (batch, deduped).
 * 2. buildContributions + aggregateIngredients derive the computed ShoppingItem[].
 * 3. localStorage stores checked state and user-added custom items, keyed by
 *    {userId}:{weekStartDate} to prevent cross-week and cross-user contamination.
 *
 * SECTIONS: named sections sort alphabetically; null section ("Senza categoria")
 * is placed last so named groups appear at the top.
 */
export function useShoppingList(weekStartDate: string): UseShoppingListReturn {
  const { user } = useAuth();

  const lsKey = user ? storageKey(user.uid, weekStartDate) : '';

  // --------------------------------------------------
  // React Query: fetch plan + recipes → computed items
  // --------------------------------------------------
  const {
    data: computedItems = [],
    isLoading,
    isFetched,
  } = useQuery({
    enabled: !!user,
    queryKey: ['shoppingList', user?.uid ?? '', weekStartDate],
    queryFn: async () => {
      const plan = await getMealPlanByWeek(user!.uid, weekStartDate);
      if (!plan) return null; // null signals "no plan for this week"

      const existingIds = plan.slots
        .map(s => s.existingRecipeId)
        .filter((id): id is string => !!id);

      const recipesById = await getRecipesByIds(existingIds, user!.uid);

      const contributions = buildContributions(plan, recipesById);
      return aggregateIngredients(contributions);
    },
  });

  // null means "plan not found"; undefined means "query pending"
  const hasPlan = isFetched && computedItems !== null;
  const planItems: ShoppingItem[] = computedItems ?? [];

  // --------------------------------------------------
  // localStorage-backed state
  // --------------------------------------------------
  const [checkedIdsList, setCheckedIdsList] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<ShoppingItem[]>([]);

  // Initialise from localStorage when the key is ready.
  useEffect(() => {
    if (!lsKey) return;
    const { checkedIds, customItems: saved } = loadPersistedState(lsKey);
    setCheckedIdsList(checkedIds);
    setCustomItems(saved);
  }, [lsKey]);

  // Persist whenever checked/custom state changes.
  useEffect(() => {
    if (!lsKey) return;
    savePersistedState(lsKey, { checkedIds: checkedIdsList, customItems });
  }, [lsKey, checkedIdsList, customItems]);

  // --------------------------------------------------
  // Merged items: computed + custom, sorted by section → name
  // --------------------------------------------------
  const items = useMemo<ShoppingItem[]>(() => {
    const all = [...planItems, ...customItems];
    return all.sort((a, b) => {
      // null section last
      if (a.section === null && b.section !== null) return 1;
      if (a.section !== null && b.section === null) return -1;
      if (a.section !== b.section) {
        return (a.section ?? '').localeCompare(b.section ?? '', 'it');
      }
      return a.name.localeCompare(b.name, 'it');
    });
  }, [planItems, customItems]);

  // --------------------------------------------------
  // Derived: sectionNames
  // --------------------------------------------------
  const sectionNames = useMemo<string[]>(() => {
    const named = new Set<string>();
    let hasNull = false;

    for (const item of items) {
      if (item.section === null) hasNull = true;
      else named.add(item.section);
    }

    const sorted = [...named].sort((a, b) => a.localeCompare(b, 'it'));
    if (hasNull) sorted.push('__null__'); // sentinel for null section
    return sorted;
  }, [items]);

  const checkedIds = useMemo(() => new Set(checkedIdsList), [checkedIdsList]);

  const progress = useMemo(
    () => ({ checked: checkedIdsList.length, total: items.length }),
    [checkedIdsList, items.length]
  );

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  function toggleItem(id: string) {
    setCheckedIdsList(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function addCustomItem(name: string, quantity: string, section?: string) {
    const newItem: ShoppingItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      displayQuantity: quantity.trim(),
      section: section?.trim() || null,
      recipeSource: [],
      isMerged: false,
      isCustom: true,
    };
    setCustomItems(prev => [...prev, newItem]);
  }

  function removeCustomItem(id: string) {
    setCustomItems(prev => prev.filter(item => item.id !== id));
    setCheckedIdsList(prev => prev.filter(x => x !== id));
  }

  function clearChecked() {
    setCheckedIdsList([]);
  }

  return {
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
  };
}
