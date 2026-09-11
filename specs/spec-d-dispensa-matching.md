# Spec D — Ingredient matching engine + shopping list ↔ pantry ↔ cooking integration

> Notes covered: 1 (trivial ingredients, check→pantry, duplicates, end-of-cooking deduction, matching) | Dependencies: none (Spec E depends on this one) | Branch: `feature/pantry-shopping-integration`

Read together with `specs/00-roadmap.md` (binding contract, in particular "Cross-spec contracts §2" and "Product decisions §1–3").

---

## 1. Goal

Today the shopping list and the pantry are two separate worlds: the list suggests buying water and ingredients the user already has at home, checked-off shopping never ends up in the pantry, and at the end of cooking the stock stays unchanged. This spec introduces a shared **ingredient↔pantry matching engine** (`ingredient-matching.ts`) and uses it in three places:

1. the shopping list **never shows** trivial ingredients (water, ice) and moves ingredients matched in the pantry with sufficient stock into a collapsed **"Hai già in casa"** section, re-includable with one tap;
2. an **"Aggiungi alla dispensa"** button turns the checked items into pantry entries in batch (creating or incrementing the existing entry), with position/quantity/expiry prefilled;
3. on tapping **"Termina cottura"** a dialog proposes **deducting the stock** used, with quantities already adapted to the servings cooked, every row editable or excludable.

Uncertain matches never do anything on their own: the app **proposes**, the user confirms once, and the confirmation becomes a **persistent alias** on the pantry entry (valid forever, both in the list and in the deduction). Includes four micro-fixes ("Aggiungi articolo" button without a plan, ConfirmDialog on pantry delete, a sensible "Consumato" per unit, removal of dead stubs).

## 2. Current state (verified references)

### 2.1 Shopping list aggregation

- `src/lib/utils/ingredient-aggregator.ts:19` — `buildContributions(plan, recipesById)` flattens all plan slots into `IngredientContribution[]` (no filter).
- `src/lib/utils/ingredient-aggregator.ts:75` — `aggregateIngredients(contributions)` groups by canonical key; at line 89: `const key = canonicalIngredientKey(c.name);`.
- `src/lib/utils/ingredient-aggregator.ts:164` — the key function is **private**:
  ```ts
  function canonicalIngredientKey(name: string): string {
  ```
  (NFD accent-strip, lowercase, `singularizeWord` per word — line 184; conservative: words <4 characters untouched, multi-word never collapsed).
- `src/lib/utils/ingredient-aggregator.ts:218` — `NON_SCALABLE_RE` (`q.b.`, `un pizzico`, `a piacere`…): affects only quantity parsing, it does **not** exclude items.
- `src/lib/utils/ingredient-aggregator.ts:224` — private `UNIT_ALIASES` (mass base g, volume base ml, Italian aliases `etti`, `chili`, `lt`…).
- `src/lib/utils/ingredient-aggregator.ts:298` — private `parseQuantity(quantity): ParsedQuantity | null`; `ParsedQuantity` (line 210) = `{ baseValue, dimension: 'mass'|'volume'|'count', unit }`.
- `src/lib/utils/ingredient-aggregator.ts:322` — private `formatQuantity(baseValue, dimension)` (g↔kg, ml↔l, Italian decimal comma).
- `src/lib/utils/ingredient-aggregator.ts:127` — plan item id = `toSlug(key)` (stable across recomputations).
- **No trivial-ingredient filter exists** (verified: no reference to acqua/ghiaccio in the aggregator, the hook or the components).

### 2.2 Shopping list hook and persistence

- `src/lib/hooks/useShoppingList.ts:84` — full orchestration. Query `['shoppingList', uid, weekStartDate]` (line 106) → `getMealPlanByWeek` + `getRecipesByIds` + aggregation. Separate query `['adHocShopping', uid]` (line 145).
- Persistence to **two independent targets**: plan on `meal_plans` (500 ms debounce lines 315–339, flush `flushPendingShoppingState` line 191) and ad-hoc on `users/{uid}` (debounce lines 261–272, flush `flushPendingAdHocState` line 234). `flushAll` (lines 345–365) on `visibilitychange:hidden`, `pagehide`, unmount.
- `src/lib/hooks/useShoppingList.ts:20` — localStorage fallback: `interface PersistedState { checkedIds: string[]; customItems: ShoppingItem[]; }`.
- `src/lib/firebase/meal-plans.ts:181` — plan state write, which this spec extends:
  ```ts
  export async function updateMealPlanShoppingState(
    planId: string,
    checkedIds: string[],
    customItems: ShoppingItem[]
  ): Promise<void> {
    const planRef = doc(db, COLLECTION, planId);
    await updateDoc(planRef, {
      shoppingCheckedIds: checkedIds,
      shoppingCustomItems: customItems,
    });
  }
  ```
  Only call site: `useShoppingList.ts` (lines 203 and 327).
- `src/lib/firebase/shopping-adhoc.ts:38` — `addRecipeToAdHocShoppingList` copies ingredients **verbatim** (lines 50–55):
  ```ts
  items: recipe.ingredients.map((ingredient): AdHocShoppingItem => ({
    id: crypto.randomUUID(),
    name: ingredient.name,
    quantity: ingredient.quantity,
    checked: false,
  })),
  ```
- `src/components/shopping-list/ShoppingListContent.tsx:125–134` — the "Aggiungi articolo" button is gated on `hasPlan`:
  ```tsx
  {hasPlan && (
    <Button variant="outline" className="w-full" onClick={() => setAddSheetOpen(true)}>
      <PlusCircle className="w-4 h-4 mr-2" />
      Aggiungi articolo
    </Button>
  )}
  ```
  and the "no plan" empty state (lines 52–69) returns before mounting the sheet.
- `src/components/shopping-list/ShoppingSection.tsx:28` — collapsible section (`grid-rows` animation), `ShoppingItemRow.tsx:22` — generic row with explicit props (`name`/`quantity`/`checked`/`footnote`/`onToggle`/`onRemove`).

### 2.3 Pantry

- `src/types/pantry.ts:3–17` — `PantryItem` (qty `number`, `unit: string` with the `PANTRY_UNITS` vocabulary, `categoryId` slug, `position`, `purchased`/`expires` strings `YYYY-MM-DD` or null, `min`, `notes`). **No `aliases` field**.
- `src/lib/firebase/pantry.ts:22/29/43/54` — `getPantryItems` (only `where('userId','==',userId)`, no orderBy), `createPantryItem`, `updatePantryItem(itemId, partial)`, `deletePantryItem`. No batch helper.
- `src/lib/hooks/usePantry.ts:13–24` — `pantryQueryKey(uid) = ['pantryItems', uid]`, `staleTime: 2min`, `enabled: !!user`; mutations invalidate the key.
- `src/lib/utils/pantry-utils.ts:7–18` — `PANTRY_CATEGORIES` (10 hardcoded slugs); line 20 `PANTRY_UNITS = ['g','kg','ml','L','pz','vasetti','mazzo','testa']`; line 106 `formatQty(item)`.
- `src/components/pantry/PantryItemQuickSheet.tsx:38–43` — "Consumato" always decrements by 1 regardless of the unit:
  ```ts
  async function handleConsume() {
    if (!item) return;
    const newQty = Math.max(0, item.qty - 1);
    await updateItem.mutateAsync({ id: item.id, data: { qty: newQty } });
    onClose();
  }
  ```
- `src/components/pantry/PantryItemQuickSheet.tsx:120–128` — delete **without ConfirmDialog** (violates the project rule):
  ```tsx
  <button
    onClick={async () => {
      await deleteItem.mutateAsync(item.id);
      onClose();
    }}
    ...
  >
    Elimina prodotto
  </button>
  ```
- `src/components/pantry/PantryItemQuickSheet.tsx:86–92` — "Aggiungi a lista" is a no-op (`onClick={onClose}`).
- `src/components/pantry/PantryAddSheet.tsx:18` — `type Tab = 'manuale' | 'voce' | 'lista';`; lines 100–104 tab array; lines 276–310 the two "In arrivo" stub tabs.
- `src/components/pantry/PantryItemRow.tsx:90–121` — hover-only desktop actions `onConsume`/`onAddToList`/`onEdit`; the page (`dispensa/page.tsx:63–69`) passes **only** `onEdit`: consume/add-to-list are dead on desktop too.
- `src/components/pantry/PantryDesktopSidebar.tsx:54–71` — "Dalla lista spesa" card with promissory copy ("Segna gli acquisti come completati…") and a link to `/lista-spesa`.
- `firebase/firestore.rules:70–75` — ownership on `pantry_items`; `firebase/firestore.indexes.json` already has `(userId ASC, createdAt DESC)` for `pantry_items` (unused, no change).

### 2.4 Cooking

- `src/app/(dashboard)/ricette/[id]/cooking/page.tsx:278–298` — the function to hook into:
  ```ts
  const handleFinishCooking = async () => {
    if (!user || !cookingSession || !recipe) return;

    try {
      await createCookingHistoryEntry({
        userId: user.uid,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        servings: servings || null,
      });
      await deleteCookingSession(cookingSession.id);
      queryClient.invalidateQueries({ queryKey: ['cookingSessions', user.uid] });
      toast.success('Piatto completato. Bel lavoro in cucina!');
      router.push('/cotture-in-corso');
    } catch (err) {
      console.error('Error finishing cooking session:', err);
      setSessionError('Errore durante la chiusura della cottura.');
    }
  };
  ```
  In scope at tap time: the full `recipe`, `servings` (servings cooked), `scaledIngredients` (effect lines 162–173 via `scaleQuantity`), `cookingSession`. Button at lines 518–525, enabled only at 100% progress.
- **Documented latent bug**: `createCookingHistoryEntry` (`src/lib/firebase/cooking-history.ts:34–51`) uses `addDoc`; if `deleteCookingSession` fails after the history write, retrying "Termina cottura" **duplicates the entry** in `cooking_history`.
- Abandon path: `src/app/(dashboard)/cotture-in-corso/page.tsx:73–87` (`handleConfirmDeleteSession`) deletes the session **without** history — it must NEVER be touched by the deduction.
- `src/lib/utils/ingredient-scaler.ts:29` — `scaleQuantity(quantity, originalServings, newServings)`: string-in/string-out, pass-through for q.b. and parse failures, **never** unit conversion.

## 3. Product decisions (constraints from the roadmap)

1. **Hybrid matching** (decision 1): automatic match only when conservative (existing canonical key, accents + singular/plural); uncertain cases → proposal + one-time user confirmation → **persistent alias on `PantryItem.aliases`**, valid for the shopping list AND the cooking deduction. Philosophy unchanged: **the non-match is the safe failure** — a false "already in the pantry" is worse than a false negative.
2. **Check → pantry in batch** (decision 2): no interruption while shopping; one button opens a single flow with all checked items, each with position/quantity/expiry prefilled and editable.
3. **Trivial items and duplicates** (decision 3): a fixed curated list **never** shown in the list; match with sufficient stock → collapsed "Hai già in casa" section, re-includable with one tap; non-quantifiable match → stays in the list with an informational badge ("In dispensa: 500 g").
4. Cross-spec contract §2: the module is called **`src/lib/utils/ingredient-matching.ts`** and exports at least `canonicalIngredientKey`, `isTrivialIngredient`, `matchIngredientToPantry` with the signatures defined there; `PantryItem.aliases?: string[]`; `parseQuantity`/unit conversions exported and reusable. Spec E will import from here: **do not change these names**.

## 4. Proposed design

### 4.1 Data model (before/after)

**`src/types/pantry.ts`** — `PantryItem` gains one field (no migration: absent = no alias):

```ts
export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  qty: number;
  unit: string;
  categoryId: string;
  position: 'frigo' | 'dispensa' | 'freezer';
  purchased: string | null;
  expires: string | null;
  min: number;
  notes: string | null;
  /**
   * Canonical keys (canonicalIngredientKey) confirmed by the user as
   * "this ingredient is this pantry entry". Written only by the suggestion
   * confirmation flow; never undefined on Firestore (omitted or array).
   */
  aliases?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**`src/types/index.ts`** — `MealPlan` (after line 442) gains:

```ts
  /** Shopping list state stored here to sync across devices. */
  shoppingCheckedIds?: string[] | null;
  shoppingCustomItems?: ShoppingItem[] | null;
  /**
   * Item ids (ShoppingItem.id) the user re-included in the list despite having
   * the ingredient in the pantry ("Mi serve comunque"). Persisted together with
   * checked/custom in the same write (no new persistence target).
   */
  shoppingPantryIncludedIds?: string[] | null;
```

**`AdHocShoppingItem`** (`src/types/index.ts:496`) gains the equivalent flag — it travels inside the array already persisted on `users/{uid}`, so it reuses the existing ad-hoc debounce/flush:

```ts
export interface AdHocShoppingItem {
  id: string;
  name: string;
  quantity: string;
  checked: boolean;
  /** true = re-included in the list despite the pantry match. Absent = false. */
  pantryIncluded?: boolean;
}
```

Firestore caution: when rewriting the ad-hoc array, `pantryIncluded` must be written as a boolean or **omitted** (never `undefined` inside the object — use a conditional spread when building the updated item).

### 4.2 Module `src/lib/utils/ingredient-matching.ts` (contract 2 — binding)

**Dependency layout** (to avoid cycles): the quantity machinery **stays defined** in `ingredient-aggregator.ts`, which goes from `function` to `export function` / `export const`; `ingredient-matching.ts` imports from there and **re-exports** what the contract requires. Single direction `matching → aggregator`, zero churn on existing tests.

**Changes to `ingredient-aggregator.ts`** — these become exported (keyword only, no body change):
- `export function canonicalIngredientKey(...)` (line 164) and, for tests, `export function singularizeWord(...)` (line 184);
- `export function parseQuantity(...)` (line 298);
- `export const UNIT_ALIASES` (line 224), `export const NON_SCALABLE_RE` (line 218);
- `export function formatQuantity(...)` (line 322) and `export function formatItalianNumber(...)` (line 332);
- `export type QuantityDimension` (line 208) and `export interface ParsedQuantity` (line 210).

**Contents of `ingredient-matching.ts`**:

```ts
import { PantryItem } from '@/types/pantry';
import {
  canonicalIngredientKey,
  parseQuantity,
  UNIT_ALIASES,
  ParsedQuantity,
  QuantityDimension,
} from './ingredient-aggregator';

// Re-export for Spec E and for the contract's consumers (roadmap §2).
export { canonicalIngredientKey, parseQuantity, UNIT_ALIASES };
export type { ParsedQuantity, QuantityDimension };
```

#### 4.2.1 `isTrivialIngredient(name: string): boolean`

List criterion: **only things nobody buys** — tap water in all its temperatures/forms and homemade ice. Salt, oil, pepper, sugar are **not** trivial: they get bought, and the pantry match handles them. The list is made of **whole phrases** in readable Italian; the keys are derived once with `canonicalIngredientKey` so stemming stays consistent with the rest of the system:

```ts
/**
 * ONLY things nobody buys at the supermarket. Fixed, curated, closed list.
 * DO NOT add salt/oil/pepper/sugar: they get bought, the pantry match handles
 * them. Comparison is by exact equality of the canonical key:
 * "acqua di rose" or "acqua di mare" do NOT match and stay in the list (correct).
 */
const TRIVIAL_INGREDIENT_NAMES = [
  'acqua',
  'acqua fredda',
  'acqua calda',
  'acqua tiepida',
  'acqua bollente',
  'acqua frizzante',
  'acqua gassata',
  'acqua naturale',
  'acqua a temperatura ambiente',
  'acqua di cottura',
  'acqua di cottura della pasta',
  'acqua della pasta',
  'ghiaccio',
  'cubetti di ghiaccio',
  'ghiaccio tritato',
];

const TRIVIAL_KEYS = new Set(TRIVIAL_INGREDIENT_NAMES.map(canonicalIngredientKey));

export function isTrivialIngredient(name: string): boolean {
  return TRIVIAL_KEYS.has(canonicalIngredientKey(name));
}

/** Variant for callers that already hold the canonical key (aggregator). */
export function isTrivialIngredientKey(key: string): boolean {
  return TRIVIAL_KEYS.has(key);
}
```

Match **exact on the whole key**, no substrings: fail-safe (a phrase not in the list stays in the list). Note on "acqua frizzante": included because in recipes it appears as a component of batters/doughs, not as a drink to buy — a brainstorming decision, do not reopen it.

#### 4.2.2 `matchIngredientToPantry(name, pantryItems)`

Signature from the contract (invariant):

```ts
export type PantryMatch =
  | { item: PantryItem; confidence: 'exact' | 'alias' }
  | { item: null; suggestions: PantryItem[] };

export function matchIngredientToPantry(
  name: string,
  pantryItems: PantryItem[]
): PantryMatch
```

Algorithm:

1. `key = canonicalIngredientKey(name)`.
2. **Exact**: item with `canonicalIngredientKey(item.name) === key`. If more than one (duplicates in the pantry): pick the one with the highest `qty`, on a tie the first in array order (deterministic, and shows the most useful stock).
3. **Alias**: item with `(item.aliases ?? []).includes(key)`. Exact always wins over alias; same disambiguation rule.
4. **No match** → `{ item: null, suggestions }` with the fuzzy heuristic below (max 3, never reckless).

**Suggestion heuristic** (proposed, conservative):

```ts
const STOPWORD_TOKENS = new Set(['di', 'd', 'al', 'all', 'alla', 'con', 'senza', 'per', 'e', 'in', 'da', 'dell', 'della', 'dello', 'del']);
// NB: stopwords must be expressed as ALREADY-STEMMED TOKENS (e.g. "della" → "dell"
// after singularizeWord): derive them in the module by applying canonicalIngredientKey
// to the readable list, as for TRIVIAL_KEYS.

function significantTokens(key: string): Set<string> {
  return new Set(key.split(' ').filter(t => !STOPWORD_TOKENS.has(t)));
}
```

A `PantryItem` is suggested for `name` if, with `A = significantTokens(key)` and `B = significantTokens(canonicalIngredientKey(item.name))`:
- `A ⊆ B` or `B ⊆ A` (**proper** subset: equal sets are discarded — they almost always coincide with the exact key match; the rare cases with the same significant tokens but a different key due only to stopwords/order stay unsuggested, consistent with the fail-safe), **and**
- the intersection contains at least one token of length ≥ 4 (post-stemming; excludes matches on short tokens like "the", "uva" → "uva" has 3 chars and is not enough on its own), **and**
- both sides have at least 1 significant token.

Examples: "spaghetti" (`{spaghett}`) ⊂ "Spaghetti fini" (`{spaghett, fin}`) → suggested. "Pomodori" (`{pomodor}`) ⊂ "Passata di pomodoro" (`{passat, pomodor}`) → suggested (the user confirms or rejects: nothing automatic). "Farina" vs "Farina di mandorle" → suggested. "Latte" vs "Latte di cocco" → suggested. "Sale" (`{sal}`) vs "Salsa di soia" (`{sals, soi}`) → **not** suggested (no token in common: tokens are compared by exact equality, never by prefix — "sal" ≠ "sals"). "Uva" (`{uva}`) vs "Uva passa" (`{uva, pass}`) → **not** suggested (only common token has 3 chars, below the ≥ 4 threshold). Ordering: by increasing number of extra tokens (most similar first), then alphabetical; `slice(0, 3)`.

#### 4.2.3 Stock comparison: `comparePantryStock`

Used by the "Hai già in casa" section and by the cooking deduction. Discriminated union ("Non-discriminated union → lost narrowing" gotcha):

```ts
export type PantryStockComparison =
  | {
      comparable: true;
      sufficient: boolean;        // availableBase >= requiredBase && availableBase > 0
      requiredBase: number;       // in the dimension's base unit
      availableBase: number;
      dimension: QuantityDimension;
    }
  | { comparable: false; reason: 'unparsable' | 'dimension-mismatch' | 'unit-mismatch' | 'empty' };

/** Converts a pantry entry's qty+unit into a ParsedQuantity (base g/ml or count). */
export function parsePantryQty(item: PantryItem): ParsedQuantity;

export function comparePantryStock(
  ingredientQuantity: string,
  item: PantryItem
): PantryStockComparison;
```

Rules:
- `ingredientQuantity` containing `' + '` (concatenated displayQuantity, e.g. `"200 g + q.b."`) → `{ comparable: false, reason: 'unparsable' }` without attempting the parse (the concatenation is by definition not summable).
- `parseQuantity(ingredientQuantity) === null` (q.b., free text) → `'unparsable'`.
- Pantry side: `unit.toLowerCase()` before the lookup in `UNIT_ALIASES` (handles `'L'`); units not in the aliases (`pz`, `vasetti`, `mazzo`, `testa`, empty string) → dimension `'count'` with the token as unit.
- **Count equivalence**: the tokens `''`, `'pz'`, `'pezzo'`, `'pezzi'` are the same count ("2" in the recipe vs "6 pz" in the pantry → comparable). Other count tokens must match exactly (`mazzo` ≠ `vasetti` → `'unit-mismatch'`).
- Different dimensions (count vs mass: "2 pomodori" vs "500 g") → `'dimension-mismatch'`. **No density table**: out of scope by choice.
- `item.qty <= 0` → `{ comparable: false, reason: 'empty' }` (zero stock must neither move the item nor show a badge).

### 4.3 Part 2 — Trivial-item filter in the list

**Where**: in `aggregateIngredients`, not in `buildContributions`. Rationale: (a) `buildContributions` describes "what the plan contains" and is the right place for future consumers that want full fidelity; the filter is a presentation/aggregation policy; (b) in `aggregateIngredients` the canonical key is already computed for every contribution (line 89), so the check is free with `isTrivialIngredientKey(key)` without double canonicalization.

```ts
// in aggregateIngredients, inside the contributions loop:
for (const c of contributions) {
  const key = canonicalIngredientKey(c.name);
  if (isTrivialIngredientKey(key)) continue;   // <— NEW
  ...
}
```

Import `isTrivialIngredientKey` from `./ingredient-matching`: is the `aggregator → matching` direction for this single function acyclic because `isTrivialIngredientKey` does not depend on the aggregator at runtime? **No — it does** (it uses `canonicalIngredientKey`). To avoid the import cycle: move `TRIVIAL_INGREDIENT_NAMES`/`TRIVIAL_KEYS`/`isTrivialIngredientKey` **into `ingredient-aggregator.ts`** (where `canonicalIngredientKey` lives) and re-export them from `ingredient-matching.ts` like the rest. It is the same re-export pattern already chosen for `canonicalIngredientKey`: the contract only requires that `ingredient-matching.ts` **exports** `isTrivialIngredient`, not where it is defined.

**Ad-hoc path** — filter upstream, in `addRecipeToAdHocShoppingList` (`shopping-adhoc.ts:50`):

```ts
items: recipe.ingredients
  .filter(ingredient => !isTrivialIngredient(ingredient.name))
  .map((ingredient): AdHocShoppingItem => ({ ... })),
```

Filtering at copy time (not at render) keeps the persisted data clean and the progress counts correct. Ad-hoc groups **already saved** before the release may contain trivial items: they stay visible until the user removes them or re-adds the recipe (dedup on recipeId replaces them) — accepted, no migration.

**NEVER on custom items**: `addCustomItem` (`useShoppingList.ts:452`) does not change — if the user types "acqua frizzante" they want it in the list.

**checkedIds hygiene**: the ids of filtered items become **inert** entries in `shoppingCheckedIds` (the set contains ids that no item shows anymore) — harmless and already true today when a recipe leaves the plan; document it with a comment next to the filter.

### 4.4 Part 3 — "Hai già in casa" section

#### 4.4.1 Derivation (in `useShoppingList`)

The hook mounts `usePantry()` (reuses `pantryQueryKey`, `staleTime 2min`, `enabled: !!user` — no new fetch path) and computes a classification map in a `useMemo`:

```ts
export type PantryMatchInfo =
  | { kind: 'in-pantry'; item: PantryItem }          // match + comparable + sufficient stock
  | { kind: 'badge'; item: PantryItem }              // match but not comparable / insufficient (qty > 0)
  | { kind: 'suggestion'; candidates: PantryItem[] } // no match, fuzzy candidates
  | { kind: 'none' };

// in the hook:
const pantryInfoById = useMemo(() => {
  const map = new Map<string, PantryMatchInfo>();
  // pre-index the pantry ONCE: Map<key, item> for exact and for alias
  // (O(n+m), small lists — <100 entries per side, no performance issue)
  for (const it of planItems) map.set(it.id, classify(it.name, it.displayQuantity));
  for (const g of adHocRecipesList)
    for (const it of g.items) map.set(it.id, classify(it.name, it.quantity));
  return map;
}, [planItems, adHocRecipesList, pantryItems]);
```

`classify(name, quantity)`:
1. `matchIngredientToPantry(name, pantryItems)`;
2. match found → `comparePantryStock(quantity, item)`:
   - `comparable && sufficient` → `'in-pantry'`;
   - `comparable && !sufficient` → `'badge'`;
   - `!comparable && reason !== 'empty'` → `'badge'` (non-quantifiable match: stays in the list with a badge, decision 3);
   - `reason === 'empty'` → `'none'` (zero stock: neither section nor badge);
3. no match, `suggestions.length > 0` → `'suggestion'`; otherwise `'none'`.

**Scope**: only plan-derived items and ad-hoc items. **Custom items** are never classified (the user wrote them on purpose).

#### 4.4.2 Persistence of re-includes

**Plan items** (custom items are never classified, §4.4.1, so they never enter here): new local state `pantryIncludedIds: string[]` that **travels in the same write** as the plan — it is NOT a third persistence target, it is a third field of the existing target. The "New persistence target forgotten in the flush" gotcha (AGENTS.md line 42) applies in a softened form: no new timer, but the field must enter **every** point of the existing circuit. Exhaustive checklist in `useShoppingList.ts`:

1. `useState<string[]>([])` next to `checkedIdsList`/`customItems` (line 153);
2. `latestStateRef` (line 165): add `pantryIncludedIds` to the snapshot and to the sync effect (line 173);
3. `flushPendingShoppingState` (line 191): read it from the ref and pass it to the write;
4. reset on week change (line 276): clear it;
5. init effect (line 286): `setPantryIncludedIds(data.initialPantryIncludedIds)` — the query (line 120) also returns `initialPantryIncludedIds: plan.shoppingPantryIncludedIds ?? []`;
6. persist effect (line 315): add it to the dependencies and to the debounced snapshot;
7. localStorage `PersistedState` (line 20): `pantryIncludedIds: string[]`, with default `[]` in `loadPersistedState` for legacy JSON (`parsed.pantryIncludedIds ?? []`);
8. `updateMealPlanShoppingState` (meal-plans.ts:181): fourth position in the signature, writes `shoppingPantryIncludedIds: pantryIncludedIds` (always an array, never undefined).

**Ad-hoc items**: `pantryIncluded?: boolean` on the item — the toggle mutates `adHocRecipesList` and persistence happens through the **already existing** ad-hoc debounce/flush (lines 261–272 + 234). Zero new timers. Nothing needs adding to `flushAll`: both existing flushes cover the new fields because they read from the updated latest-refs.

Hook API (additions to `UseShoppingListReturn`):

```ts
pantryInfoById: Map<string, PantryMatchInfo>;
pantryIncludedIds: Set<string>;                                  // re-included plan items
togglePantryIncluded: (id: string, adHocGroupId?: string) => void; // plan or ad-hoc
confirmPantryAlias: (pantryItem: PantryItem, ingredientName: string) => Promise<void>;
dismissPantrySuggestion: (id: string) => void;                   // session only, not persisted
```

`confirmPantryAlias`: `updatePantryItem(pantryItem.id, { aliases: [...new Set([...(pantryItem.aliases ?? []), canonicalIngredientKey(ingredientName)])] })` then `queryClient.invalidateQueries({ queryKey: pantryQueryKey(uid) })` → the memo recomputes and the item recategorizes itself. `dismissPantrySuggestion` feeds a `Set<string>` in local state (item ids): rejected suggestions don't reappear in the current session but are **not** persisted (they reappear on the next visit — accepted: they are unobtrusive, and persisting rejections would be a new field with a new flush circuit for a marginal benefit).

#### 4.4.3 UI

**Partition** (in `ShoppingListContent`, on plan items only): an item with `kind === 'in-pantry'` and id **not** in `pantryIncludedIds` leaves the normal sections and goes into the "Hai già in casa" section. Same logic for ad-hoc items (`pantryIncluded !== true`). Everything else stays where it is.

**"Hai già in casa" section**: rendered **after** the plan sections and **before** the ad-hoc groups, `ShoppingSection` style but `defaultExpanded={false}` and without checkboxes: rows cannot be checked (there is nothing to buy). Each row: name, caption `In dispensa: {formatQty(item)}` (e.g. "In dispensa: 500 g"), and a text button **"Mi serve comunque"** (touch target ≥ 44px, always visible — never `group-hover` below `lg`). Tap → `togglePantryIncluded(id[, groupId])` → the item goes back to its original section.

**Re-included item**: goes back to the normal section, checkable, with an extended footnote: `"{fonte} · In dispensa: 500 g"` and an unobtrusive secondary action **"Ce l'ho già"** (text, `text-muted-foreground`) to send it back to the section.

**Informational badge** (`kind === 'badge'`): the item stays in the normal list with the footnote `In dispensa: {formatQty(item)}` appended to the existing source. Colors: `text-accent` on `bg-accent/10` for the badge, never raw greens (semantic tokens, dark mode for free).

**Suggestion row** (`kind === 'suggestion'`, not dismissed): below the item's row, a compact row:

> Forse ce l'hai già: **Spaghetti fini** — è lo stesso?  [Sì, è lo stesso] [No]

- "Sì, è lo stesso" → `confirmPantryAlias(candidato, item.name)` + toast `Collegato a "Spaghetti fini" in dispensa` → the item recategorizes (section or badge depending on stock);
- "No" → `dismissPantrySuggestion(id)`.
- If there is more than one candidate only the first (most similar) is shown; no carousels.
- **No automatic moves**: until the user confirms, the item stays in the normal list.

**Progress bar**: items in "Hai già in casa" (not re-included) leave the `progress.total` count (and any of their checked ids leave `checked`), so 100% stays reachable. `clearChecked` does not touch `pantryIncludedIds`.

**Staleness**: pantry data with `staleTime 2min` — the section may reflect changes made elsewhere (another device) with a delay. Local mutations (alias, batch, deduction) invalidate `pantryQueryKey` and update immediately. Accepted, and to be documented in a comment in the hook.

### 4.5 Part 4 — Batch check → pantry

#### 4.5.1 Entry point

In `ShoppingListContent`, when there is **at least one checked item** (plan/custom via `checkedIds` ∩ visible items, or ad-hoc with `checked === true`), above the "Aggiungi articolo" button:

```tsx
<Button className="w-full" onClick={() => setPantrySheetOpen(true)}>
  <Archive className="w-4 h-4 mr-2" />
  Aggiungi alla dispensa ({checkedCount})
</Button>
```

#### 4.5.2 Pure row builder — `src/lib/utils/pantry-batch.ts`

```ts
export interface PantryDraftRow {
  sourceId: string;               // ShoppingItem.id or AdHocShoppingItem.id
  include: boolean;               // default true
  name: string;                   // editable only if existingItem === null
  qty: number;                    // in the chosen unit
  unit: string;                   // a PANTRY_UNITS value
  categoryId: string;
  position: PantryItem['position']; // default 'dispensa'
  expires: string;                // '' = no expiry
  existingItem: PantryItem | null; // exact/alias match → UPDATE (increment)
  /** Informational copy shown below the row (e.g. proposed increment). */
  note: string | null;
}

export function buildPantryDraftRows(
  checked: Array<{ id: string; name: string; quantity: string }>,
  pantryItems: PantryItem[]
): PantryDraftRow[];
```

Quantity prefill from `parseQuantity(quantity)`:
- mass: `baseValue >= 1000` → `{ qty: base/1000, unit: 'kg' }`, otherwise `{ qty: base, unit: 'g' }`; volume likewise with `L`/`ml` (note: pantry unit `'L'` is uppercase);
- count with a token in `{'', 'pz', 'pezzo', 'pezzi'}` → `{ qty: value, unit: 'pz' }`;
- count with another token ("3 cucchiai") or parse `null` (q.b.) → **fallback `{ qty: 1, unit: 'pz' }`** with `note: 'Quantità in lista: "3 cucchiai"'` so the user corrects it at a glance;
- **concatenated displayQuantity** (`"200 g + q.b."`, `"200 g + 3"`): split on `' + '`, parse each segment; if the parsed segments share a single mass/volume dimension → sum of the bases (mirror of `mergeQuantities`) and unparsable segments are ignored (`"200 g + q.b."` → 200 g, `note: 'Quantità in lista: "200 g + q.b."'`); if no segment is usable or the dimensions are mixed → 1 pz fallback with a note.

Category: if `existingItem` → `existingItem.categoryId`; otherwise **`'altro'`** — a slug not present in `PANTRY_CATEGORIES` that the pantry page already groups under "Altro" (`dispensa/page.tsx:242–255`) and that Spec E will formalize in the taxonomy. The row's select shows the 10 categories + an "Altro" entry (value `altro`). Rationale against `PantryAddSheet`'s `'condimenti'` default: silently wrong for almost everything; "Altro" is honest and can be sorted later.

Existing match (via `matchIngredientToPantry`):
- same comparable dimension → the row is an **increment**: prefilled `qty` = purchased quantity **converted into the existing entry's unit** (base / unit factor, rounded to 1 decimal), `unit` locked to the entry's unit, name **not editable** (that document gets updated), `note: 'Già in dispensa: 500 g → diventa 1,5 kg'`;
- non-comparable dimensions → still an increment, but prefilled `qty` is `0` and `note: 'Già in dispensa: 6 pz — unità non confrontabili, imposta tu l'incremento'`;
- the update also sets `purchased = today`; `expires` only if filled in (otherwise the existing value stays).

Multiple rows pointing to the **same existing entry** (e.g. a plan item + an ad-hoc item of the same ingredient): at apply time the increments **accumulate** on the same `qty` (never two independent updates on the same doc in a batch: the last one would win).

Creations: `purchased = today` in local format via `formatLocalDate(new Date())` (`src/lib/constants/seasons.ts:72` — NEVER `toISOString().slice(0,10)`, timezone gotcha), `min: 0`, `notes: null`, `expires: form || null`.

#### 4.5.3 Apply — `applyPantryBatch` in `src/lib/firebase/pantry.ts`

```ts
export interface PantryBatchOp {
  kind: 'create' | 'update';
  itemId?: string;                 // for update
  data: Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>  // create
      | Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>>;      // update
}

export async function applyPantryBatch(userId: string, ops: PantryBatchOp[]): Promise<void>
```

Implementation with `writeBatch(db)`: create = `batch.set(doc(collection(db, 'pantry_items')), {...data, userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})`; update = `batch.update(ref, {...data, updatedAt: serverTimestamp()})`; a single `commit()` → **atomic** (all or nothing, no half-updated pantries). The existing rules cover both operations.

#### 4.5.4 `AddCheckedToPantrySheet` sheet — `src/components/shopping-list/AddCheckedToPantrySheet.tsx`

`PantryAddSheet` pattern: mobile bottom sheet, 540px centered modal on `lg` (same `className` as `PantryAddSheet.tsx:111`), sr-only `SheetDescription`, scrollable content `max-h-[92dvh]`.

- Title: **"Aggiungi alla dispensa"**; subtitle: *"Gli articoli spuntati, pronti da salvare. Controlla e conferma."*
- One card per row (`PantryDraftRow`): include checkbox (`accent-primary`), name (input if creation, fixed text if increment), qty+unit row (number input `step 0.1` + `PANTRY_UNITS` select), category select, position toggle (3 buttons, PantryAddSheet pattern), optional expiry date input, `note` in `text-xs text-muted-foreground`.
- Footer: "Annulla" + **"Salva in dispensa (N)"** (N = included rows; disabled at N=0 or while saving).
- Confirm → builds the ops (increment accumulation per doc, clamp `qty` to ≥ 0), `applyPantryBatch`, invalidates `pantryQueryKey(uid)`, summary toast: `"3 prodotti aggiunti, 1 aggiornato in dispensa"` (singular/plural forms); error → `toast.error('Impossibile aggiornare la dispensa. Riprova.')` and the sheet stays open (the batch's atomicity makes the retry safe).
- **Items stay checked**: no change to `checkedIds`/`checked` (the check means "bought", not "archived").

### 4.6 Part 5 — Pantry deduction at end of cooking

#### 4.6.1 Pure computation — `src/lib/utils/pantry-deduction.ts`

```ts
export type PantryDeductionRow =
  | {
      kind: 'proposed';
      pantryItem: PantryItem;
      ingredientName: string;
      scaledQuantity: string;   // for display ("300 g")
      deductQty: number;        // in the pantry entry's unit, already clamped to item.qty
      confidence: 'exact' | 'alias';
    }
  | {
      kind: 'excluded';
      pantryItem: PantryItem;
      ingredientName: string;
      scaledQuantity: string;
      reason: 'unparsable' | 'dimension-mismatch' | 'unit-mismatch' | 'empty';
    }
  | {
      kind: 'suggestion';
      candidate: PantryItem;    // the best one, only one
      ingredientName: string;
      scaledQuantity: string;
    };

export function computePantryDeductions(
  ingredients: Ingredient[],
  originalServings: number,
  cookedServings: number,
  pantryItems: PantryItem[]
): PantryDeductionRow[]
```

For each ingredient (skipping `isTrivialIngredient`): `scaled = scaleQuantity(ingredient.quantity, originalServings, cookedServings)`; `matchIngredientToPantry(name, pantryItems)`:
- match → `comparePantryStock(scaled, item)`: comparable → `proposed` row with `deductQty = min(requiredBase, availableBase)` converted into the entry's unit (rounded to 1 decimal); not comparable → `excluded` row with the reason;
- no match but suggestions → `suggestion` row (first candidate only);
- no match, no suggestion → no row.

Several ingredients on the same pantry entry (multi-section recipe): the `proposed` rows **merge by summing** the `deductQty` values before the final clamp to `item.qty`.

#### 4.6.2 `PantryDeductionDialog` dialog — `src/components/pantry/PantryDeductionDialog.tsx`

Controlled component built on the Radix `Dialog` primitives (like `ConfirmDialog`, but with rich content — `ConfirmDialog` is not enough: editable rows). Title **"Scala la dispensa"**, description *"Hai usato questi ingredienti: aggiorno le scorte?"*.

- `proposed` rows: include checkbox (default **on**), ingredient name → pantry entry name, number input for the decrement in the entry's unit (`step 0.1`, min 0, max `item.qty`), caption `"{formatQty(item)} → {nuovo valore}"` updated live.
- `suggestion` rows: checkbox default **off**, copy *"Forse è {nome voce} — conferma per scalare"*; if included at confirmation, the alias is saved first (same `updatePantryItem` as part 3) and then the decrement is applied **only if** `comparePantryStock` turns out comparable, otherwise the row is ignored with `console.warn`.
- `excluded` rows: visible, dimmed, not selectable, with the reason in Italian: `unparsable` → *"Quantità non quantificabile (es. q.b.)"*; `dimension-mismatch`/`unit-mismatch` → *"Unità non confrontabili"*; `empty` → *"Scorta già a zero"*.
- Footer: **"Salta"** (outline variant) and **"Aggiorna e termina"** (primary). Both close the cooking flow; "Salta" only skips the deduction.
- The decrement writes `qty = Math.max(0, item.qty - deduct)` — **clamp to 0, never an automatic delete** of the entry.

#### 4.6.3 Wiring in `handleFinishCooking` (cooking/page.tsx:278)

The page mounts `usePantry()` (cached data ≤ 2 min: acceptable, the dialog is editable anyway). New flow:

```ts
const pantryDeductedRef = useRef(false);   // guard against double deduction on retry

const handleFinishCooking = () => {
  if (!user || !cookingSession || !recipe) return;
  const rows = pantryDeductedRef.current
    ? []
    : computePantryDeductions(recipe.ingredients, recipe.servings || 4, servings, pantryItems);
  if (rows.some(r => r.kind !== 'excluded')) {
    setDeductionRows(rows);
    setDeductionDialogOpen(true);          // completion continues from onConfirm/onSkip
  } else {
    void finalizeCooking(null);            // no match: behavior identical to today
  }
};

const finalizeCooking = async (deductions: ConfirmedDeduction[] | null) => {
  try {
    if (deductions && deductions.length > 0 && !pantryDeductedRef.current) {
      await applyPantryDeductions(user.uid, deductions);   // writeBatch of updateDoc, clamp to 0
      pantryDeductedRef.current = true;
      queryClient.invalidateQueries({ queryKey: pantryQueryKey(user.uid) });
    }
    await createCookingHistoryEntry({
      userId: user.uid,
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      servings: servings || null,
      entryId: cookingSession.id,          // NEW — idempotency, see below
    });
    await deleteCookingSession(cookingSession.id);
    queryClient.invalidateQueries({ queryKey: ['cookingSessions', user.uid] });
    toast.success('Piatto completato. Bel lavoro in cucina!');
    router.push('/cotture-in-corso');
  } catch (err) {
    console.error('Error finishing cooking session:', err);
    setSessionError('Errore durante la chiusura della cottura.');
  }
};
```

**Write order and partial failures** (to be documented in a code comment):
1. **Pantry batch first**: if it fails, nothing happened (atomic batch) and the session survives — clean retry.
2. **History with a deterministic id**: `createCookingHistoryEntry` gains `entryId?: string`; when present it uses `setDoc(doc(db, 'cooking_history', entryId), ...)` instead of `addDoc`. The session id is unique per cooking → a retry **overwrites the same document** instead of duplicating it. This **fixes the duplication bug that already exists today** (history via `addDoc` + failed delete + retry). The current rules allow both create and update to the owner. Callers without `entryId` (none today besides the cooking page) keep `addDoc`.
3. **Session delete last**: if it fails after the history write, the retry rewrites the same history (harmless) and does not deduct again (`pantryDeductedRef`).
4. **Documented residual risk**: if after a successful batch the user **reloads the page** and retries, `pantryDeductedRef` is lost and the dialog proposes the deduction again → possible double decrement. Accepted mitigation: the dialog is always explicit and shows the current stock (already decremented), so the user sees already-deducted numbers and can press "Salta". A flag persisted on the session (`pantryDeducted: boolean` on `cooking_sessions`) is the complete mitigation: **implement it** (an `updateCookingSession(sessionId, { pantryDeducted: true })` right after the batch, and the row computation is skipped if `cookingSession.pantryDeducted`), adding the optional field to `CookingSession` (`src/types/index.ts:285`). Minimal cost, closes the reload hole.

`applyPantryDeductions` is a thin wrapper over `applyPantryBatch` (`qty` updates only).

**The abandon path NEVER deducts**: `cotture-in-corso/page.tsx:73–87` stays untouched.

### 4.7 Part 6 — Micro-fixes

1. **"Aggiungi articolo" without a plan** (`ShoppingListContent.tsx:125`): remove the `hasPlan &&` gate around the button; in the "Nessun piano" empty state (lines 52–69) add a secondary "Aggiungi articolo" button below the "Vai al pianificatore" CTA and mount `AddCustomItemSheet` anyway (turn the early `return` into a conditional render that shares the sheet). No-plan persistence already exists: `useShoppingList.ts:336–338` writes to localStorage when `planId` is null. Rationale: the feature already works at the data level, the gate is UI only.
2. **ConfirmDialog on `PantryItemQuickSheet` delete** (lines 120–128): local state `confirmDeleteOpen`, `ConfirmDialog` rendered as a sibling of the `Sheet` with `title: 'Eliminare {item.name}?'`, `description: 'Il prodotto verrà rimosso dalla dispensa.'`, `confirmLabel: 'Elimina'`, `isConfirming` bound to the mutation; on confirm `deleteItem.mutateAsync` → close both. Rationale: project rule (never direct destructive deletes), same pattern as `AdHocRecipeGroup`.
3. **"Consumato" with per-unit semantics** (lines 38–43): for count units (`pz`, `vasetti`, `mazzo`, `testa`) the decrement by 1 stays (clamp to 0). For `g`/`kg`/`ml`/`L` the button expands into three proportional chips in the same sheet: **"Un po' (−25%)"**, **"Metà (−50%)"**, **"Tutto"** (→ 0); rounding to 1 decimal (consistent with `formatQty`), clamp to 0. Rationale: nobody types in the kitchen — three proportional taps cover the real cases without a keyboard; the exact value stays editable from "Modifica prodotto".
4. **Dead pantry stubs**:
   - **"A voce" tab**: removed entirely (`Tab` type, array entry, stub JSX, `Mic` import). Rationale: a promise with no roadmap; if it comes back, it will come back with its own design.
   - **"Da lista spesa" tab**: removed as a tab; with only one tab left the whole tab bar goes and `PantryAddSheet` becomes a plain form (less UI, same behavior). The entry point to the new batch flow lives: (a) in the "Dalla lista spesa" desktop card of `PantryDesktopSidebar` (lines 54–71), updating its copy to: *"Spunta gli articoli in lista e usa 'Aggiungi alla dispensa' per salvarli qui in un passaggio."* (the link to `/lista-spesa` stays); (b) the real flow is in the shopping list (part 4), where the user is at the end of shopping. Rationale: no duplicate implementations, the signpost replaces the stub.
   - **"Aggiungi a lista" in `PantryItemQuickSheet` (lines 86–92) and `onAddToList` in `PantryItemRow`**: removed. Rationale: writing to the plan doc from outside `useShoppingList` would **race with the hook's debounced full-array writes** (last-write-wins on the same field) — implementing it properly requires a shared channel that isn't worth the cost now. Better no promise than a broken promise.
   - **Desktop `onConsume` never wired** (`PantryItemRow.tsx:91–99`): prop and button removed. Rationale: the new "Consumato" UX (proportional chips) lives in the quick sheet, which is `lg:hidden`; a flat `−1` desktop consume would reintroduce the wrong semantics just fixed. On desktop "Modifica" is used. (The hover-only block remains legitimate because it is `lg`-only, touch gotcha respected.)

### 4.8 Indexes, rules, queries

- **No new index**: `getPantryItems` stays `where('userId','==',userId)` without orderBy; no new composite query.
- **No rules change**: `aliases`, `shoppingPantryIncludedIds`, `pantryIncluded`, `pantryDeducted` are fields on existing documents already covered by ownership; `cooking_history` via `setDoc` is a create/update by the owner, already allowed.
- **No new collection**.
- React Query: no new query key; `useShoppingList` reuses `pantryQueryKey` via `usePantry()`; every pantry mutation invalidates that key.

## 5. Phased implementation plan

Every phase leaves `npx tsc --noEmit` and the build green. Phases 1–3 are releasable on their own (trivial-item filter + micro-fixes), 4–6 build on top.

**Phase 1 — Matching module (no visible change)**
- `src/lib/utils/ingredient-aggregator.ts`: `export` on `canonicalIngredientKey`, `singularizeWord`, `parseQuantity`, `UNIT_ALIASES`, `NON_SCALABLE_RE`, `formatQuantity`, `formatItalianNumber`, types `ParsedQuantity`/`QuantityDimension`; addition of `TRIVIAL_INGREDIENT_NAMES`/`isTrivialIngredient`/`isTrivialIngredientKey` (defined here, next to `canonicalIngredientKey`).
- New `src/lib/utils/ingredient-matching.ts`: re-exports the contract, defines `matchIngredientToPantry`, `parsePantryQty`, `comparePantryStock`, `PantryMatch`, `PantryStockComparison`.
- `src/types/pantry.ts`: `aliases?: string[]`.
- New `src/lib/utils/ingredient-matching.test.ts` (+ extension of `ingredient-aggregator.test.ts` for the exports).

**Phase 2 — Trivial-item filter + "Aggiungi articolo" without a plan**
- `src/lib/utils/ingredient-aggregator.ts`: skip in `aggregateIngredients` (checkedIds hygiene comment).
- `src/lib/firebase/shopping-adhoc.ts`: filter in `addRecipeToAdHocShoppingList`.
- `src/components/shopping-list/ShoppingListContent.tsx`: removal of the `hasPlan` gate, empty state with a secondary action, sheet always mounted.
- Aggregator tests updated.

**Phase 3 — Pantry micro-fixes**
- `src/components/pantry/PantryItemQuickSheet.tsx`: delete ConfirmDialog, per-unit "Consumato" chips, removal of "Aggiungi a lista".
- `src/components/pantry/PantryAddSheet.tsx`: removal of the tab bar and stubs.
- `src/components/pantry/PantryItemRow.tsx`: removal of `onConsume`/`onAddToList`.
- `src/components/pantry/PantryDesktopSidebar.tsx`: new copy for the "Dalla lista spesa" card.

**Phase 4 — "Hai già in casa" section**
- `src/types/index.ts`: `MealPlan.shoppingPantryIncludedIds`, `AdHocShoppingItem.pantryIncluded`.
- `src/lib/firebase/meal-plans.ts`: fourth arg of `updateMealPlanShoppingState`.
- `src/lib/hooks/useShoppingList.ts`: `usePantry()`, `pantryInfoById` memo, `pantryIncludedIds` state/persistence (checklist §4.4.2 point by point), `togglePantryIncluded`, `confirmPantryAlias`, `dismissPantrySuggestion`, exclusion from progress.
- `src/components/shopping-list/`: new `PantryOwnedSection.tsx`, extensions to `ShoppingListContent.tsx`/`ShoppingItemRow.tsx` (badge footnote, suggestion row, "Ce l'ho già" action), `AdHocRecipeGroup.tsx` (same partition for ad-hoc items).
- `src/app/(dashboard)/lista-spesa/page.tsx`: pass-through of the new props.

**Phase 5 — Batch check → pantry**
- New `src/lib/utils/pantry-batch.ts` (+ tests).
- `src/lib/firebase/pantry.ts`: `applyPantryBatch`.
- New `src/components/shopping-list/AddCheckedToPantrySheet.tsx`; button in `ShoppingListContent.tsx`.

**Phase 6 — End-of-cooking deduction**
- New `src/lib/utils/pantry-deduction.ts` (+ tests).
- `src/lib/firebase/cooking-history.ts`: `entryId` param + `setDoc`.
- `src/types/index.ts`: `CookingSession.pantryDeducted?: boolean`.
- New `src/components/pantry/PantryDeductionDialog.tsx`.
- `src/app/(dashboard)/ricette/[id]/cooking/page.tsx`: `usePantry()`, `handleFinishCooking`/`finalizeCooking` split, idempotency guards.

When done: update CLAUDE.md (Recent Changes + collections/fields), AGENTS.md (gotchas that emerged: a field traveling in the existing write ≠ a new target but the same checklist; idempotent `setDoc` for history), checklist in `specs/00-roadmap.md`.

## 6. Test plan

### 6.1 Unit tests (Jest — command: `npm test`, config `jest.config.js`, style of `src/lib/utils/ingredient-aggregator.test.ts` with default factories)

`ingredient-matching.test.ts`:
- re-exported `canonicalIngredientKey`: pomodoro/pomodori same key; "pomodori pelati" ≠ "pomodori"; accents.
- `isTrivialIngredient`: true for "Acqua", "acqua fredda", "Acqua di cottura", "ghiaccio", "Cubetti di ghiaccio"; **false** for "sale", "olio", "acqua di rose", "acqua di cocco", "sale e acqua" (phrase not in the list).
- `matchIngredientToPantry`: exact on singular/plural/accents; alias wins when exact is absent; exact wins over alias; duplicates → highest qty; no match → suggestions: "spaghetti"↔"Spaghetti fini" (both directions), "pomodori"↔"Passata di pomodoro"; NOT suggested: "sale"↔"Salsa di soia" (disjoint stems: "sal" ≠ "sals", never prefix matching), "uva"↔"Uva passa" (only common token < 4 chars), disjoint names; cap at 3 and ordering by similarity.
- `parsePantryQty`/`comparePantryStock`: uppercase `'L'`; "200 g" vs 1 kg → sufficient; "2 kg" vs 500 g → insufficient; "2" vs 6 pz → sufficient (count equivalence); "2 pomodori" vs 500 g → `dimension-mismatch`; "q.b." → `unparsable`; `"200 g + q.b."` → `unparsable`; qty 0 → `empty`; "1 mazzo" vs "2 vasetti" → `unit-mismatch`.

`ingredient-aggregator.test.ts` (extensions):
- contributions with "acqua"/"ghiaccio" produce no item; "acqua di rose" does; the filter doesn't touch other groups.
- exported `parseQuantity`/`formatQuantity`: Italian decimal comma cases, etti, cl.

`pantry-batch.test.ts`:
- prefills (mass→g/kg, volume→ml/L, count→pz, q.b.→1 pz with note, concatenated with segment sum and with fallback);
- existing match same dimension → increment converted into the entry's unit; different dimensions → qty 0 + note;
- accumulation of two rows on the same item.

`pantry-deduction.test.ts`:
- scaling to servings (4→6) and conversion to the entry's unit; clamp to `item.qty`;
- q.b. → `excluded/unparsable`; count vs mass → `excluded/dimension-mismatch`; trivial items skipped;
- merging of several ingredients on the same entry; suggestion row for fuzzy.

### 6.2 Guided test (Playwright + Firebase emulators — see "Guided testing tooling" in CLAUDE.md)

Throwaway script in `e2e/scratch/` (gitignored, to be deleted at the end of the guided test), `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; seed via a throwaway script with spy words in the names (e.g. "Spaghetti COLLAUDO"). Phases, one per message, expected outcome declared first:

1. **Trivial items**: plan with a recipe containing "acqua" and "acqua di cottura della pasta" → the list doesn't show them; "Voglio preparare questo" on the same recipe → the ad-hoc group doesn't contain them; custom item "acqua frizzante" → stays.
2. **Hai già in casa**: pantry with "Farina 00" 2 kg; plan requiring "farina 00 300 g" → item in the collapsed section with "In dispensa: 2 kg"; tap "Mi serve comunque" → back in the list; reload → persists (assert on `meal_plans.shoppingPantryIncludedIds` in emulated Firestore).
3. **Non-comparable badge**: pantry "Uova 6 pz", recipe "uova 200 g" → stays in the list with a badge.
4. **Alias**: pantry "Spaghetti fini", recipe "spaghetti" → suggestion row; "Sì, è lo stesso" → assert `aliases` on the pantry doc + immediate recategorization.
5. **Batch**: check 3 items → "Aggiungi alla dispensa (3)" → sheet with the expected prefills → confirm → assert creations/increment on `pantry_items` (a single increment if an entry existed), toast, checks intact.
6. **Cooking deduction**: session at 100% on a recipe with a match; "Termina cottura" → dialog with the decrement scaled to servings; confirm → assert qty decremented (clamp to 0), **a single** `cooking_history` entry with id = session id, session deleted. Repeat with "Salta" → no decrement. Abandon from /cotture-in-corso → no decrement, no history.
7. **Micro-fixes**: week without a plan → "Aggiungi articolo" visible and working (localStorage); pantry delete → ConfirmDialog; "Consumato" on an entry in g → −25%/−50%/Tutto chips.

## 7. Relevant gotchas and constraints (AGENTS.md / CLAUDE.md)

- **Never `undefined` on Firestore** (AGENTS.md line 23): `aliases` omitted or array; `pantryIncluded` boolean or key omitted (conditional spread); `shoppingPantryIncludedIds` always an array in the write; `expires`/`purchased` `null`, not `''`, on the document.
- **New persistence target → its own debounce + registration in `flushAll`** (AGENTS.md line 42): this spec **deliberately avoids** new targets — `shoppingPantryIncludedIds` travels in the existing plan write, `pantryIncluded` in the existing ad-hoc array. The §4.4.2 checklist (latestStateRef, init, reset, persist effect, flush, localStorage) must be carried out in full: forgetting one point reproduces the lost-checks bug for the new field alone.
- **`enabled: !!user`** on every auth-bound query (AGENTS.md line 48): `usePantry` already does it; don't introduce new queries without it.
- **No `onSnapshot`** (CLAUDE.md): matching is a client-side recomputation over the React Query cache, 2 min pantry staleTime accepted.
- **`ConfirmDialog` for destructive actions, never `confirm()`/`alert()`** (AGENTS.md line 75): pantry delete (micro-fix 2); the cooking deduction uses a dedicated Dialog because it is not binary-destructive.
- **Structured outputs / JSON schema**: no AI route in this spec — constraint not applicable (no `minItems`/`minimum` to avoid because there are no schemas).
- **Semantic color tokens** (AGENTS.md lines 53–62): badge and section with `text-accent`/`bg-accent/10`/`text-muted-foreground`/`bg-card`; never `green-*`/`bg-white`; native inputs/selects in the sheets with explicit `bg-background text-foreground`.
- **Controls never `group-hover`-only below `lg`** (AGENTS.md line 74): "Mi serve comunque", "Ce l'ho già", Consumato chips and row buttons always visible on mobile; tap area ≥ 44px.
- **`max-lg:portrait:`** instead of `portrait:` (AGENTS.md line 19) for every orientation class in the new UI; bottom sheet on mobile and centered on `lg` (`PantryAddSheet.tsx:111` pattern).
- **`YYYY-MM-DD` dates**: parse with the `'T00:00:00'` suffix and format with `formatLocalDate` (AGENTS.md lines 34, 47) — never `toISOString().slice(0,10)` for `purchased`.
- **Collapsible with `grid-rows`**, not `max-height` (AGENTS.md line 69) for the "Hai già in casa" section.
- **Native checkboxes**: `accent-primary` (AGENTS.md line 80).
- **Shopping list = cached derived view** (AGENTS.md line 60): pantry mutations don't touch `['shoppingList', ...]` (rightly so: the classification depends on `pantryQueryKey`, which must be invalidated); don't add superfluous invalidations.
- **Conservative merge**: don't loosen `canonicalIngredientKey`/`singularizeWord` (existing tests + philosophy non-merge = safe failure).
- **`cooking_history` append-only, statistics read only from there** (CLAUDE.md): switching to `setDoc` with a deterministic id doesn't change the document's shape; legacy docs stay readable.
- **Stale cache after write** (AGENTS.md line 59): invalidate `pantryQueryKey` after alias/batch/deduction and `['cookingSessions', uid]` at the end of cooking (already present).
- **Build**: `npx tsc --noEmit` + `npx next build --webpack`; `spawn EPERM` in the sandbox → rerun outside the sandbox (AGENTS.md line 73). `next lint` no longer exists (line 81).

## 8. Out of scope

- Aisle taxonomy and grouping the list by aisle (**Spec E**, which consumes this module).
- Density/weight table to convert count ↔ mass ("2 pomodori" vs "500 g"): the mismatch stays non-comparable by choice.
- Persistence of rejected suggestions (session only).
- "Aggiungi a lista" from the pantry (removed, not reimplemented — race with the debounced writes).
- Automatic shopping list from below-threshold stock (the "In arrivo" card stays).
- Voice entry (tab removed).
- Batch migrations of existing data (ad-hoc groups with trivial items, inert checkedIds).
- Scaling ad-hoc quantities to servings (ad-hoc items stay unscaled verbatim copies).
- Any AI endpoint or prompt change.

## 9. Implementation prompt

```markdown
Implement Spec D of "Il Mio Ricettario".

PREPARATION (mandatory, in order):
1. Read and apply CLAUDE.md, AGENTS.md, COMMENTS.md and DEVELOPMENT_GUIDELINES.md (repo root).
2. Read specs/00-roadmap.md IN FULL: it is the binding contract — do not deviate from the names
   of modules/types/fields defined there (in particular "Cross-spec contracts §2").
3. Read specs/spec-d-dispensa-matching.md IN FULL: it contains the exact data model,
   algorithms, Italian copy, edge cases and the §4.4.2 persistence checklist.
4. Create the branch feature/pantry-shopping-integration from develop.

IMPLEMENTATION:
- Proceed phase by phase (section 5 of the spec, Phases 1→6). After EVERY phase run
  `npx tsc --noEmit` and fix before continuing.
- Run the tests with `npm test` (command verified in package.json) after the phases that
  touch or add .test.ts files; the new tests are listed in section 6.1.
- Respect the gotchas in section 7 (never undefined on Firestore; complete checklist for
  shoppingPantryIncludedIds; enabled: !!user; no onSnapshot; ConfirmDialog;
  semantic tokens; no hover-only controls below lg; max-lg:portrait:).
- When done: `npx next build --webpack` (if it fails with spawn EPERM, rerun it
  outside the sandbox: it is not an application error).

CLOSING:
- Update CLAUDE.md (Recent Changes section + any fields/collections),
  AGENTS.md (new gotchas if they emerged during the work) and check off Spec D in the
  specs/00-roadmap.md checklist.
- NEVER commit without the user's explicit OK (session rule:
  one branch/commit per session).
- At the end propose a phase-by-phase guided test with Playwright + Firebase
  emulators (throwaway scripts in e2e/scratch/, protocol in CLAUDE.md section
  "Guided testing tooling" and section 6.2 of the spec), declaring for each phase
  the expected outcome before running it.
```

## 10. Recommended model and effort

**Opus · effort xhigh** — a new engine with many seams (shopping list, pantry, cooking), conservative choices to respect and delicate persistence (debounce/flush).
