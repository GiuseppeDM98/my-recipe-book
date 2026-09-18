'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePantry, pantryQueryKey } from '@/lib/hooks/usePantry';
import { getMealPlanByWeek, updateMealPlanShoppingState } from '@/lib/firebase/meal-plans';
import { getRecipesByIds } from '@/lib/firebase/firestore';
import { getAdHocShoppingList, updateAdHocShoppingList } from '@/lib/firebase/shopping-adhoc';
import { addPantryItemAlias } from '@/lib/firebase/pantry';
import {
  buildContributions,
  aggregateIngredients,
  collectPlanRecipeIds,
} from '@/lib/utils/ingredient-aggregator';
import {
  canonicalIngredientKey,
  classifyPantryAvailability,
  PantryMatchInfo,
} from '@/lib/utils/ingredient-matching';
import { AdHocShoppingItem, AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { PantryItem } from '@/types/pantry';

// ---------------------------------------------------------------------------
// localStorage helpers (fallback when no meal plan exists for the week)
// ---------------------------------------------------------------------------

function storageKey(userId: string, weekStartDate: string): string {
  return `shopping_list:${userId}:${weekStartDate}`;
}

interface PersistedState {
  checkedIds: string[];
  customItems: ShoppingItem[];
  pantryIncludedIds: string[];
}

function emptyPersistedState(): PersistedState {
  return { checkedIds: [], customItems: [], pantryIncludedIds: [] };
}

function loadPersistedState(key: string): PersistedState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return emptyPersistedState();
    // Every field defaulted: JSON saved before Spec D has no pantryIncludedIds.
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      checkedIds: parsed.checkedIds ?? [],
      customItems: parsed.customItems ?? [],
      pantryIncludedIds: parsed.pantryIncludedIds ?? [],
    };
  } catch {
    return emptyPersistedState();
  }
}

function savePersistedState(key: string, state: PersistedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage quota exceeded or unavailable — silently skip.
  }
}

/**
 * Returns a copy of an ad-hoc item with the "re-included despite the pantry"
 * flag set or removed. The key is dropped rather than set to false/undefined:
 * the item lives inside an array written to Firestore, which rejects undefined.
 */
function withPantryIncluded(item: AdHocShoppingItem, isIncluded: boolean): AdHocShoppingItem {
  const next: AdHocShoppingItem = { ...item };
  if (isIncluded) {
    next.pantryIncluded = true;
  } else {
    delete next.pantryIncluded;
  }
  return next;
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
  /** Excludes items parked in "Hai già in casa", so 100% stays reachable. */
  progress: { checked: number; total: number };
  /** "Voglio preparare questo" groups — global, independent of weekStartDate. */
  adHocRecipes: AdHocShoppingRecipe[];
  toggleAdHocItem: (groupId: string, itemId: string) => void;
  removeAdHocRecipe: (groupId: string) => void;
  removeAdHocItem: (groupId: string, itemId: string) => void;
  /** Pantry classification of plan and ad-hoc items (custom items are never classified). */
  pantryInfoById: Map<string, PantryMatchInfo>;
  /** Plan item ids re-included despite a pantry match ("Mi serve comunque"). */
  pantryIncludedIds: Set<string>;
  /** Plan and ad-hoc item ids currently shown in "Hai già in casa" instead of the list. */
  pantryOwnedIds: Set<string>;
  /** Plan item when adHocGroupId is omitted, ad-hoc item otherwise. */
  togglePantryIncluded: (id: string, adHocGroupId?: string) => void;
  confirmPantryAlias: (pantryItem: PantryItem, ingredientName: string) => Promise<void>;
  /** Hides a suggestion for this session only (not persisted). */
  dismissPantrySuggestion: (id: string) => void;
}

/**
 * Provides the weekly shopping list for a given weekStartDate.
 *
 * DATA FLOW:
 * 1. React Query fetches the MealPlan + all referenced recipes (batch, deduped).
 * 2. buildContributions + aggregateIngredients derive the computed ShoppingItem[].
 * 3. Checked state, custom items and pantry re-includes are persisted in the
 *    MealPlan Firestore document (shoppingCheckedIds, shoppingCustomItems,
 *    shoppingPantryIncludedIds) so they sync across devices.
 * 4. If no plan exists for the week, localStorage is used as a fallback (rare case).
 *
 * MIGRATION: on first load after this change, if Firestore has no shopping state but
 * localStorage does, the localStorage values are used and immediately migrated to
 * Firestore on the next state change.
 *
 * DEBOUNCE: Firestore writes are debounced 500ms to coalesce rapid checkbox taps.
 *
 * PANTRY: plan and ad-hoc items are classified against the pantry query
 * (usePantry, staleTime 2min). Changes made on another device may show up with
 * that delay; local mutations (alias, batch add, cooking deduction) invalidate
 * the pantry key and recategorize immediately. No onSnapshot, by design.
 *
 * CHECKLIST — every plan-level shopping field (checked, custom, pantry
 * re-includes) must go through ALL of: useState, latestStateRef + its sync
 * effect, flushPendingShoppingState, the week-change reset, the init effect
 * (both the "Firestore has state" test and the localStorage branch), the React
 * Query cache sync effect, the persist effect, PersistedState/loadPersistedState
 * and updateMealPlanShoppingState. Missing one silently loses that field only.
 *
 * SECTIONS: named sections sort alphabetically; null section ("Senza categoria")
 * is placed last so named groups appear at the top.
 */
export function useShoppingList(weekStartDate: string): UseShoppingListReturn {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { items: pantryItems } = usePantry();

  const lsKey = user ? storageKey(user.uid, weekStartDate) : '';

  // --------------------------------------------------
  // React Query: fetch plan + recipes → computed items
  // --------------------------------------------------

  interface QueryResult {
    items: ShoppingItem[];
    planId: string;
    initialCheckedIds: string[];
    initialCustomItems: ShoppingItem[];
    initialPantryIncludedIds: string[];
  }

  const shoppingListQueryKey = ['shoppingList', user?.uid ?? '', weekStartDate] as const;

  const {
    data,
    isLoading,
    isFetched,
  } = useQuery<QueryResult | null>({
    enabled: !!user,
    queryKey: shoppingListQueryKey,
    queryFn: async () => {
      const plan = await getMealPlanByWeek(user!.uid, weekStartDate);
      if (!plan) return null; // null signals "no plan for this week"

      const recipesById = await getRecipesByIds(collectPlanRecipeIds(plan), user!.uid);

      const contributions = buildContributions(plan, recipesById);
      const items = aggregateIngredients(contributions);

      return {
        items,
        planId: plan.id,
        initialCheckedIds: plan.shoppingCheckedIds ?? [],
        initialCustomItems: plan.shoppingCustomItems ?? [],
        initialPantryIncludedIds: plan.shoppingPantryIncludedIds ?? [],
      };
    },
  });

  // null means "plan not found"; undefined means "query pending"
  const hasPlan = isFetched && data !== null;
  const planItems: ShoppingItem[] = data?.items ?? [];

  // --------------------------------------------------
  // React Query: ad-hoc groups ("Voglio preparare questo")
  //
  // Global on users/{uid}, independent of weekStartDate — unlike the plan
  // query above this is not re-fetched per week.
  // --------------------------------------------------

  const {
    data: adHocQueryData,
    isFetched: isAdHocFetched,
  } = useQuery<AdHocShoppingRecipe[]>({
    enabled: !!user,
    queryKey: ['adHocShopping', user?.uid ?? ''],
    queryFn: () => getAdHocShoppingList(user!.uid),
  });

  // --------------------------------------------------
  // State — backed by Firestore (or localStorage fallback)
  // --------------------------------------------------

  const [checkedIdsList, setCheckedIdsList] = useState<string[]>([]);
  const [customItems, setCustomItems] = useState<ShoppingItem[]>([]);
  // Third field of the SAME plan persistence target (not a new target): it
  // rides the existing debounce/flush — see the CHECKLIST in the doc comment.
  const [pantryIncludedIdsList, setPantryIncludedIdsList] = useState<string[]>([]);

  // Tracks which lsKey the current state belongs to, so we can guard
  // the persist effect from firing before initialization.
  const stateKeyRef = useRef<string>('');
  // Firestore plan ID for the current week (null when no plan exists).
  const planIdRef = useRef<string | null>(null);
  // Debounce timer for Firestore writes.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current snapshot used by flushPendingShoppingState so it never reads
  // a stale closure when fired from an unmount/visibility handler.
  const latestStateRef = useRef<{
    lsKey: string;
    planId: string | null;
    checkedIdsList: string[];
    customItems: ShoppingItem[];
    pantryIncludedIdsList: string[];
  }>({ lsKey: '', planId: null, checkedIdsList: [], customItems: [], pantryIncludedIdsList: [] });

  // Keep the snapshot in sync after every commit.
  useEffect(() => {
    latestStateRef.current = {
      lsKey,
      planId: planIdRef.current,
      checkedIdsList,
      customItems,
      pantryIncludedIdsList,
    };
  });

  /**
   * Persist any pending (debounced) shopping state immediately.
   *
   * WHY: the debounce delays Firestore writes by 500ms to coalesce rapid taps.
   * If the component unmounts (navigation) or the tab/app is hidden before the
   * timer fires, the pending write must not be discarded — otherwise a checkbox
   * tapped right before leaving is silently lost and reappears unchecked later.
   * We flush from the latest-state ref because handlers run with stale closures.
   */
  const flushPendingShoppingState = useCallback(() => {
    if (!persistTimerRef.current) return;
    clearTimeout(persistTimerRef.current);
    persistTimerRef.current = null;

    const {
      lsKey: key,
      planId,
      checkedIdsList: checked,
      customItems: custom,
      pantryIncludedIdsList: included,
    } = latestStateRef.current;
    if (!key) return;

    const snapshot: PersistedState = {
      checkedIds: checked,
      customItems: custom,
      pantryIncludedIds: included,
    };

    if (planId) {
      // Fire-and-forget: on unmount/hide we cannot await, but issuing the write
      // now (instead of cancelling it) is what prevents the lost-check bug.
      updateMealPlanShoppingState(planId, checked, custom, included).catch(() => {
        savePersistedState(key, snapshot);
      });
    } else {
      savePersistedState(key, snapshot);
    }
  }, []);

  // --------------------------------------------------
  // Ad-hoc state — SECOND, independent persistence target (users/{uid}).
  //
  // Kept fully separate from the plan's checked/custom state above: own local
  // state, own init guard, own debounce timer/ref, own flush function. It must
  // not be tied to weekStartDate (adHocInitRef is keyed by uid, not lsKey) and
  // must not share a debounce timer with the plan writes above, since the two
  // targets (meal_plans doc vs users doc) are written independently.
  //
  // The ad-hoc "re-included despite the pantry" flag lives on each item
  // (AdHocShoppingItem.pantryIncluded), so it is persisted by this circuit as is.
  // --------------------------------------------------

  const [adHocRecipesList, setAdHocRecipesList] = useState<AdHocShoppingRecipe[]>([]);
  const adHocInitRef = useRef<string>('');
  const adHocPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestAdHocStateRef = useRef<{ uid: string; recipes: AdHocShoppingRecipe[] }>({
    uid: '',
    recipes: [],
  });

  useEffect(() => {
    latestAdHocStateRef.current = { uid: user?.uid ?? '', recipes: adHocRecipesList };
  });

  /** Mirrors flushPendingShoppingState above, for the ad-hoc persistence target. */
  const flushPendingAdHocState = useCallback(() => {
    if (!adHocPersistTimerRef.current) return;
    clearTimeout(adHocPersistTimerRef.current);
    adHocPersistTimerRef.current = null;

    const { uid, recipes } = latestAdHocStateRef.current;
    if (!uid) return;

    updateAdHocShoppingList(uid, recipes).catch(() => {
      // Best-effort — no localStorage fallback here (cross-device sync is the point).
    });
  }, []);

  // Reset + re-init once per uid (not per week — ad-hoc groups are global).
  useEffect(() => {
    setAdHocRecipesList([]);
    adHocInitRef.current = '';
  }, [user?.uid]);

  useEffect(() => {
    const uid = user?.uid ?? '';
    if (!uid || !isAdHocFetched || adHocInitRef.current === uid) return;
    adHocInitRef.current = uid;
    setAdHocRecipesList(adHocQueryData ?? []);
  }, [user?.uid, isAdHocFetched, adHocQueryData]);

  // Debounced write, mirroring the plan's persist effect below.
  useEffect(() => {
    const uid = user?.uid ?? '';
    if (!uid || adHocInitRef.current !== uid) return;

    if (adHocPersistTimerRef.current) clearTimeout(adHocPersistTimerRef.current);
    adHocPersistTimerRef.current = setTimeout(() => {
      adHocPersistTimerRef.current = null;
      updateAdHocShoppingList(uid, adHocRecipesList).catch(() => {
        // Best-effort — no localStorage fallback here (cross-device sync is the point).
      });
    }, 500);
  }, [user?.uid, adHocRecipesList]);

  // Reset local state immediately when the week changes so the UI shows
  // empty state while the new week's fetch is in-flight.
  useEffect(() => {
    setCheckedIdsList([]);
    setCustomItems([]);
    setPantryIncludedIdsList([]);
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

      // Any one field counts: a plan where the user only re-included an item
      // (nothing checked yet) must not be mistaken for "no Firestore state" and
      // overwritten by an empty localStorage fallback.
      const hasFirestoreState =
        data.initialCheckedIds.length > 0 ||
        data.initialCustomItems.length > 0 ||
        data.initialPantryIncludedIds.length > 0;

      if (hasFirestoreState) {
        setCheckedIdsList(data.initialCheckedIds);
        setCustomItems(data.initialCustomItems);
        setPantryIncludedIdsList(data.initialPantryIncludedIds);
      } else {
        // Firestore has no shopping state yet — check localStorage for migration.
        const saved = loadPersistedState(lsKey);
        setCheckedIdsList(saved.checkedIds);
        setCustomItems(saved.customItems);
        setPantryIncludedIdsList(saved.pantryIncludedIds);
        // The persist effect will write these to Firestore on next state change.
      }
    } else {
      // No plan for this week — use localStorage only.
      planIdRef.current = null;
      const saved = loadPersistedState(lsKey);
      setCheckedIdsList(saved.checkedIds);
      setCustomItems(saved.customItems);
      setPantryIncludedIdsList(saved.pantryIncludedIds);
    }
  }, [lsKey, isFetched, data]);

  // Keep the React Query cache in sync with local state as it changes.
  //
  // WHY: this hook lives inside the shopping-list page component, so leaving
  // that page and coming back (SPA navigation, not a full reload) unmounts
  // and remounts it. The plan query has a 2min staleTime, so a remount within
  // that window reuses the cached fetch result instead of hitting Firestore
  // again — and the init effect below trusts that cached `data` blindly. Without
  // this sync, the cache still held the checked ids from the ORIGINAL fetch,
  // so remounting silently reverted any items (un)checked since then, even
  // though the Firestore write itself had already succeeded. Updating the
  // cache eagerly (not waiting on the debounced Firestore write) means the
  // cache always reflects what's on screen, independent of write timing.
  useEffect(() => {
    if (stateKeyRef.current !== lsKey || !lsKey || !planIdRef.current) return;
    queryClient.setQueryData<QueryResult | null>(shoppingListQueryKey, old =>
      old
        ? {
            ...old,
            initialCheckedIds: checkedIdsList,
            initialCustomItems: customItems,
            initialPantryIncludedIds: pantryIncludedIdsList,
          }
        : old
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lsKey, checkedIdsList, customItems, pantryIncludedIdsList]);

  // Persist state changes. The stateKeyRef guard prevents writes before
  // initialization (e.g. the week-change reset doesn't clobber Firestore).
  useEffect(() => {
    if (stateKeyRef.current !== lsKey) return;
    if (!lsKey) return;

    const planId = planIdRef.current;
    const snapshot: PersistedState = {
      checkedIds: checkedIdsList,
      customItems,
      pantryIncludedIds: pantryIncludedIdsList,
    };

    if (planId) {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      persistTimerRef.current = setTimeout(() => {
        // Mark as no longer pending so a later flush doesn't re-issue this write.
        persistTimerRef.current = null;
        updateMealPlanShoppingState(
          planId,
          snapshot.checkedIds,
          snapshot.customItems,
          snapshot.pantryIncludedIds
        ).catch(() => {
          // Firestore write failed — fall back to localStorage so state is not lost.
          savePersistedState(lsKey, snapshot);
        });
      }, 500);
    } else {
      savePersistedState(lsKey, snapshot);
    }
  }, [lsKey, checkedIdsList, customItems, pantryIncludedIdsList]);

  // Flush pending writes when leaving: on unmount (navigation) and when the
  // page is hidden or unloaded. `visibilitychange` → hidden is the reliable
  // signal on mobile when the app is backgrounded or closed, where React's
  // unmount cleanup may never run.
  useEffect(() => {
    function flushAll() {
      flushPendingShoppingState();
      flushPendingAdHocState();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        flushAll();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', flushAll);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [flushPendingShoppingState, flushPendingAdHocState]);

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

  // --------------------------------------------------
  // Derived: pantry classification
  // --------------------------------------------------

  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<Set<string>>(
    () => new Set()
  );

  // Custom items are deliberately never classified: the user typed them on
  // purpose. Plan item ids (slugs) and ad-hoc ids (UUIDs) never collide, so one
  // map serves both. Cost is items × pantry entries per recomputation — both
  // stay well under 100 in practice, no index needed.
  const pantryInfoById = useMemo(() => {
    const infoById = new Map<string, PantryMatchInfo>();
    if (pantryItems.length === 0) return infoById;

    const classify = (id: string, name: string, quantity: string) => {
      const info = classifyPantryAvailability(name, quantity, pantryItems);
      const isDismissed = info.kind === 'suggestion' && dismissedSuggestionIds.has(id);
      infoById.set(id, isDismissed ? { kind: 'none' } : info);
    };

    for (const item of planItems) classify(item.id, item.name, item.displayQuantity);
    for (const group of adHocRecipesList) {
      for (const item of group.items) classify(item.id, item.name, item.quantity);
    }
    return infoById;
  }, [planItems, adHocRecipesList, pantryItems, dismissedSuggestionIds]);

  const pantryIncludedIds = useMemo(
    () => new Set(pantryIncludedIdsList),
    [pantryIncludedIdsList]
  );

  const pantryOwnedIds = useMemo(() => {
    const ownedIds = new Set<string>();
    const isCoveredByPantry = (id: string) => pantryInfoById.get(id)?.kind === 'in-pantry';

    for (const item of planItems) {
      if (isCoveredByPantry(item.id) && !pantryIncludedIds.has(item.id)) ownedIds.add(item.id);
    }
    for (const group of adHocRecipesList) {
      for (const item of group.items) {
        if (isCoveredByPantry(item.id) && item.pantryIncluded !== true) ownedIds.add(item.id);
      }
    }
    return ownedIds;
  }, [planItems, adHocRecipesList, pantryInfoById, pantryIncludedIds]);

  // Counts only rows the user can actually check. Parked items leave both
  // counters, and so do inert checked ids (items no longer in the list), which
  // previously could push `checked` above `total`.
  const progress = useMemo(() => {
    let checked = 0;
    let total = 0;

    for (const item of items) {
      if (pantryOwnedIds.has(item.id)) continue;
      total += 1;
      if (checkedIds.has(item.id)) checked += 1;
    }
    for (const group of adHocRecipesList) {
      for (const item of group.items) {
        if (pantryOwnedIds.has(item.id)) continue;
        total += 1;
        if (item.checked) checked += 1;
      }
    }

    return { checked, total };
  }, [items, checkedIds, adHocRecipesList, pantryOwnedIds]);

  // --------------------------------------------------
  // Actions
  // --------------------------------------------------
  function toggleItem(id: string) {
    setCheckedIdsList(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleAdHocItem(groupId: string, itemId: string) {
    setAdHocRecipesList(prev =>
      prev.map(group =>
        group.id === groupId
          ? {
              ...group,
              items: group.items.map(item =>
                item.id === itemId ? { ...item, checked: !item.checked } : item
              ),
            }
          : group
      )
    );
  }

  function removeAdHocRecipe(groupId: string) {
    setAdHocRecipesList(prev => prev.filter(group => group.id !== groupId));
  }

  function removeAdHocItem(groupId: string, itemId: string) {
    setAdHocRecipesList(prev =>
      prev.map(group =>
        group.id === groupId
          ? { ...group, items: group.items.filter(item => item.id !== itemId) }
          : group
      )
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

  // Re-includes are a separate decision from "bought": clearing checks keeps them.
  function clearChecked() {
    setCheckedIdsList([]);
  }

  function togglePantryIncluded(id: string, adHocGroupId?: string) {
    if (adHocGroupId) {
      setAdHocRecipesList(prev =>
        prev.map(group =>
          group.id === adHocGroupId
            ? {
                ...group,
                items: group.items.map(item =>
                  item.id === id ? withPantryIncluded(item, item.pantryIncluded !== true) : item
                ),
              }
            : group
        )
      );
      return;
    }

    setPantryIncludedIdsList(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  /**
   * Persists "this ingredient is that pantry entry" and recategorizes at once.
   * The optimistic cache write avoids waiting for the refetch roundtrip; the
   * invalidation then realigns with Firestore. Errors propagate to the caller,
   * which owns the user feedback.
   */
  async function confirmPantryAlias(pantryItem: PantryItem, ingredientName: string) {
    if (!user) return;
    const alias = canonicalIngredientKey(ingredientName);

    await addPantryItemAlias(pantryItem.id, alias);

    const key = pantryQueryKey(user.uid);
    queryClient.setQueryData<PantryItem[]>(key, old =>
      old?.map(item =>
        item.id === pantryItem.id
          ? { ...item, aliases: [...new Set([...(item.aliases ?? []), alias])] }
          : item
      )
    );
    void queryClient.invalidateQueries({ queryKey: key });
  }

  function dismissPantrySuggestion(id: string) {
    setDismissedSuggestionIds(prev => new Set(prev).add(id));
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
    adHocRecipes: adHocRecipesList,
    toggleAdHocItem,
    removeAdHocRecipe,
    removeAdHocItem,
    pantryInfoById,
    pantryIncludedIds,
    pantryOwnedIds,
    togglePantryIncluded,
    confirmPantryAlias,
    dismissPantrySuggestion,
  };
}
