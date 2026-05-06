'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { getMealPlanByWeek, updateMealPlanShoppingState } from '@/lib/firebase/meal-plans';
import { getRecipesByIds } from '@/lib/firebase/firestore';
import { buildContributions, aggregateIngredients } from '@/lib/utils/ingredient-aggregator';
import { MealType, ShoppingItem } from '@/types';

// ---------------------------------------------------------------------------
// localStorage helpers (fallback when no meal plan exists for the week)
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
 * 3. Checked state and custom items are persisted in the MealPlan Firestore document
 *    (fields: shoppingCheckedIds, shoppingCustomItems) so they sync across devices.
 * 4. If no plan exists for the week, localStorage is used as a fallback (rare case).
 *
 * MIGRATION: on first load after this change, if Firestore has no shopping state but
 * localStorage does, the localStorage values are used and immediately migrated to
 * Firestore on the next state change.
 *
 * DEBOUNCE: Firestore writes are debounced 500ms to coalesce rapid checkbox taps.
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

  interface QueryResult {
    items: ShoppingItem[];
    planId: string;
    initialCheckedIds: string[];
    initialCustomItems: ShoppingItem[];
  }

  const {
    data,
    isLoading,
    isFetched,
  } = useQuery<QueryResult | null>({
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
      const items = aggregateIngredients(contributions);

      return {
        items,
        planId: plan.id,
        initialCheckedIds: plan.shoppingCheckedIds ?? [],
        initialCustomItems: plan.shoppingCustomItems ?? [],
      };
    },
  });

  // null means "plan not found"; undefined means "query pending"
  const hasPlan = isFetched && data !== null;
  const planItems: ShoppingItem[] = data?.items ?? [];

  // --------------------------------------------------
  // State — backed by Firestore (or localStorage fallback)
  // --------------------------------------------------

  const [checkedIdsList, setCheckedIdsList] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<ShoppingItem[]>([]);

  // Tracks which lsKey the current state belongs to, so we can guard
  // the persist effect from firing before initialization.
  const stateKeyRef = useRef<string>('');
  // Firestore plan ID for the current week (null when no plan exists).
  const planIdRef = useRef<string | null>(null);
  // Debounce timer for Firestore writes.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state immediately when the week changes so the UI shows
  // empty state while the new week's fetch is in-flight.
  useEffect(() => {
    setCheckedIdsList([]);
    setCustomItems([]);
    stateKeyRef.current = '';
    planIdRef.current = null;
  }, [lsKey]);

  // Once the fetch for the current key is complete, initialise state.
  // Prefers Firestore values; falls back to localStorage (migration path
  // or no-plan case). Runs once per lsKey thanks to stateKeyRef guard.
  useEffect(() => {
    if (!lsKey || !isFetched || stateKeyRef.current === lsKey) return;
    stateKeyRef.current = lsKey;

    if (data) {
      planIdRef.current = data.planId;

      if (data.initialCheckedIds.length > 0 || data.initialCustomItems.length > 0) {
        // Firestore has state — use it.
        setCheckedIdsList(data.initialCheckedIds);
        setCustomItems(data.initialCustomItems);
      } else {
        // Firestore has no shopping state yet — check localStorage for migration.
        const { checkedIds, customItems: saved } = loadPersistedState(lsKey);
        setCheckedIdsList(checkedIds);
        setCustomItems(saved);
        // The persist effect will write these to Firestore on next state change.
      }
    } else {
      // No plan for this week — use localStorage only.
      planIdRef.current = null;
      const { checkedIds, customItems: saved } = loadPersistedState(lsKey);
      setCheckedIdsList(checkedIds);
      setCustomItems(saved);
    }
  }, [lsKey, isFetched, data]);

  // Persist state changes. The stateKeyRef guard prevents writes before
  // initialization (e.g. the week-change reset doesn't clobber Firestore).
  useEffect(() => {
    if (stateKeyRef.current !== lsKey) return;
    if (!lsKey) return;

    const planId = planIdRef.current;
    const snapshot = { checkedIdsList, customItems };

    if (planId) {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        updateMealPlanShoppingState(planId, snapshot.checkedIdsList, snapshot.customItems)
          .catch(() => {
            // Firestore write failed — fall back to localStorage so state is not lost.
            savePersistedState(lsKey, {
              checkedIds: snapshot.checkedIdsList,
              customItems: snapshot.customItems,
            });
          });
      }, 500);
    } else {
      savePersistedState(lsKey, { checkedIds: checkedIdsList, customItems });
    }
  }, [lsKey, checkedIdsList, customItems]);

  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

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
