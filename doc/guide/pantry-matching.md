# Pantry matching — ingredient ↔ pantry engine

> Domain guide (Spec D, 2026-09-15; Spec E's department classification added 2026-09-16).
> Repo-wide gotchas stay in [AGENTS.md](../../AGENTS.md); this file holds what matters only
> when touching the pantry ↔ shopping list ↔ cooking integration, including the shopping
> list's "Per reparto" view. Product decisions and the cross-spec contracts: `specs/00-roadmap.md` §2-3.

## Where it lives

| Concern | Module |
|---------|--------|
| Engine: matching, stock comparison, list availability | `src/lib/utils/ingredient-matching.ts` |
| Name normalisation, quantity parsing, trivial list (defined here, re-exported by the engine) | `src/lib/utils/ingredient-aggregator.ts` |
| Checked items → pantry | `src/lib/utils/pantry-batch.ts` + `components/shopping-list/AddCheckedToPantrySheet.tsx` |
| End-of-cooking deduction | `src/lib/utils/pantry-deduction.ts` + `components/pantry/PantryDeductionDialog.tsx` |
| Shopping list wiring | `src/lib/hooks/useShoppingList.ts`, `components/shopping-list/pantry-row-props.ts`, `PantryOwnedSection.tsx` |
| Firestore writes | `src/lib/firebase/pantry.ts` — `addPantryItemAlias`, `applyPantryBatch`, `applyPantryDeductions` |
| Department classification (Spec E) | `src/lib/utils/ingredient-departments.ts` (precedence chain + dictionary), `src/lib/utils/shopping-departments.ts` (view model) |
| Department override persistence (Spec E) | `src/lib/firebase/department-overrides.ts` + `src/lib/hooks/useDepartmentOverrides.ts` |

Tests: `ingredient-matching.test.ts`, `ingredient-aggregator.test.ts`, `pantry-batch.test.ts`,
`pantry-deduction.test.ts`, `ingredient-departments.test.ts`, `shopping-departments.test.ts`
(all in `src/lib/utils/`).

## Contract (Spec E imports it — don't rename)

- `ingredient-matching.ts` exports `canonicalIngredientKey`, `isTrivialIngredient`,
  `matchIngredientToPantry`, `parseQuantity`, `UNIT_ALIASES` (plus the helpers below).
- Dependency direction is **matching → aggregator only**. Anything the aggregator itself needs
  (the trivial list) is defined in the aggregator and re-exported, otherwise the import cycles.

## Philosophy: a non-match is the safe failure

A false "already in the pantry" hides something the user must buy; a false negative only asks
them to buy something they have. So automatic matches are exact canonical keys or
user-confirmed aliases, anything fuzzier is a *suggestion* that never acts on its own, and
quantities compare only within one dimension — there is **no density table** ("2 pomodori" vs
"500 g" is simply not comparable).

## Matching (`matchIngredientToPantry`)

1. **Exact**: same `canonicalIngredientKey` (accent-insensitive, conservative singular/plural
   per word). Duplicates in the pantry → highest `qty`, first in array order on a tie.
2. **Alias**: key contained in `item.aliases`. Exact always wins over alias.
3. **Suggestions** (max 3): one side's significant tokens are a **proper** subset of the
   other's, and the shared part has a token of ≥ 4 chars. Tokens compare by exact equality,
   never by prefix ("sal" ≠ "sals"); stopwords are written readable and stemmed like
   everything else. Ordered by fewest extra tokens, then alphabetically.

Suggested: "spaghetti" ↔ "Spaghetti fini", "pomodori" ↔ "Passata di pomodoro".
Not suggested: "sale" ↔ "Salsa di soia", "uva" ↔ "Uva passa" (shared token too short).

## Alias keys are a persisted format

`PantryItem.aliases` stores `canonicalIngredientKey()` output. Changing `singularizeWord` or
`canonicalIngredientKey` orphans every confirmed alias with no error — matches just stop
happening. A normalisation change needs a migration of `aliases`. Write aliases only with
`addPantryItemAlias()` (`arrayUnion`): the caller's copy of the array comes from a cache up to
2 minutes old (see "Array field rewritten from a cached copy" in AGENTS.md).

## Stock comparison (`comparePantryStock`)

Checked in this order: `qty <= 0` → `empty` (so an empty shelf never produces a badge);
a `" + "` concatenation or an unparsable quantity (`q.b.`) → `unparsable`; different dimensions
→ `dimension-mismatch`; two count units that differ → `unit-mismatch`, except that `''`, `pz`,
`pezzo`, `pezzi` are the same count ("2 uova" vs "6 pz"). Pantry units are lowercased before
the alias lookup (the vocabulary spells litres `L`). `PantryStockComparison` is a discriminated
union on `comparable`.

## Trivial ingredients

`TRIVIAL_INGREDIENT_NAMES` (aggregator) is a **closed** list of things nobody buys: tap water in
its forms and ice, matched on the whole canonical key ("acqua di rose" stays in the list).
Salt, oil, pepper are bought — the pantry match handles them. Filtered in `aggregateIngredients`
and at copy time in `addRecipeToAdHocShoppingList`, **never** from custom items. Ids of filtered
items left in `shoppingCheckedIds` are inert, like the ids of a recipe that left the plan.

## Shopping list classification (`classifyPantryAvailability`)

| Kind | When | UI |
|------|------|----|
| `in-pantry` | match + comparable + enough stock | parked in "Hai già in casa", out of the progress count |
| `badge` | match, but not comparable or not enough | stays, "In dispensa: 50 g" + "· mancano 50 g" when comparable (`missingQuantity`) |
| `suggestion` | no match, candidates with stock > 0 | "Forse ce l'hai già: X — è lo stesso?" (first candidate only) |
| `none` | nothing, or matched stock is zero | — |

- Custom items are never classified: the user typed them on purpose.
- Re-includes ("Mi serve comunque") persist as `MealPlan.shoppingPantryIncludedIds` (a third field
  of the existing plan write — follow the CHECKLIST comment in `useShoppingList`) and as
  `AdHocShoppingItem.pantryIncluded` (set to `true` or key removed, never `undefined`).
- "Sì, è lo stesso" saves the alias, writes it optimistically into the pantry query cache so the
  row recategorizes at once, then invalidates. "No" hides the suggestion for the session only.
- Pantry data is the `['pantryItems', uid]` query (2 min `staleTime`, no `onSnapshot`): changes
  made on another device can take that long to show. Pantry mutations invalidate that key only.

## How much to buy (`amountToBuyBase`)

One helper feeds both the list badge ("mancano 50 g") and the batch prefill, so they can't
disagree: the shortfall when the stock covers part of the need, the whole amount otherwise
(no stock at all, or an item re-included despite enough stock). The row quantity itself stays
the recipes' need — since Spec F (2026-09-17) that need is already scaled to the people planned
on each meal before it reaches the aggregator (`buildContributions`, legacy slots excepted), so
stock comparison, badge and prefill see the scaled figure and nothing here needs to know about
people. The ad-hoc "Voglio preparare questo" rows are never scaled.

## Checked items → pantry (`buildPantryDraftRows` / `buildPantryBatchOps`)

- New entries: mass → g/kg, volume → ml/L, plain counts → pz; any other unit or `q.b.` → 1 pz
  with a "Quantità in lista: …" note; a concatenation sums its same-dimension segments.
  Category `altro` (honest fallback, formalized by Spec E), position `dispensa`.
- Existing entries: an increment in the entry's own unit (locked), prefilled with
  `amountToBuyBase`; incomparable units prefill 0 with a note.
- Several rows on the same entry accumulate into **one** update; new rows with the same name and
  unit merge into one creation (two updates on one doc in a batch keep only the last).
- `purchased` = today via `formatLocalDate`; `expires` written only when filled in.
- Rows are built once per opening (`wasOpenRef`): the inputs change identity every render.
- After saving, those checked items usually match the fresh stock and move into "Hai già in
  casa" — expected, and it prevents adding the same purchase twice.

## End-of-cooking deduction

- `computePantryDeductions` scales each ingredient to the servings cooked, skips trivial ones and
  merges ingredients on the same entry by **summing before the clamp** to the stock.
- Dialog rows: `proposed` (on by default), `suggestion` (off by default; confirming saves the alias
  and deducts only if comparable), `excluded` (shown with the reason, never deducted). Dismissing
  the dialog returns to cooking; "Salta" finishes without deducting.
- `finalizeCooking` write order, each partial failure retry-safe: aliases + one atomic batch →
  `pantryDeductedRef` and `CookingSession.pantryDeducted` → history with `entryId = session id`
  (`setDoc`) → session delete. Stock clamps to 0, entries are never deleted.
- Abandoning a session from `/cotture-in-corso` never deducts and never writes history.
- Deductions on kg/L entries round to one decimal (750 ml on a litre entry proposes 0,8): the
  rows are editable, and `formatQty` shows one decimal anyway.

## Department classification (`classifyIngredientDepartment`)

The shopping list's "Per reparto" view groups items by supermarket department instead of by
recipe. `PANTRY_CATEGORIES` (`pantry-utils.ts`) is the single taxonomy for both the pantry and
this view — 13 slugs, `altro` an explicit fallback rather than an implicit unknown-slug bucket.

Precedence chain, in order (roadmap contract §3 — same "non-match falls through" philosophy as
matching above):
1. **Pantry**: the matched pantry entry's `categoryId` (via `matchIngredientToPantry`), only if
   it's a known slug — an unknown/historical slug on the pantry doc does **not** classify, the
   chain continues.
2. **Override**: `users/{uid}.ingredientDepartmentOverrides` (`canonicalKey → slug`), written by
   "Sposta in reparto…" or the custom-item sheet's department select. Ignored if it points to a
   slug that is no longer known.
3. **Dictionary**: `DEPARTMENT_BY_KEY`, a ~290-entry curated Italian lookup built once from
   `RAW_INGREDIENT_DEPARTMENTS`, keyed on `canonicalIngredientKey()` stems.
4. **Fallback**: `'altro'`.

A pantry match always wins over a manual override by design (precedence link 1 beats link 2):
`DepartmentSection` hides the "Sposta in reparto" action on those rows (`source === 'pantry'`),
since the override would have no visible effect.

**Stem collisions**: the conservative stemmer (`singularizeWord` in `ingredient-aggregator.ts`,
shared with matching) occasionally maps two unrelated words to the same key — `pesca`/`pesce` and
`grana`/`grano` both collapse to `pesc`/`gran`. The dictionary resolves each collision explicitly
in favor of one word (`pesce`, `latticini`) and **never declares the losing word**
(`ingredient-departments.test.ts` guards against reintroducing it); the user recovers the losing
sense with their own override, which then applies to both words sharing that stem — an accepted,
documented limit of reusing the same stemmer.

**Override writes**: unlike checked items (bursts of taps, 500ms-debounced), moving a department
is a rare, deliberate action — `setDepartmentOverride()` writes directly, no debounce, so it does
**not** enter `useShoppingList`'s `flushAll()` registration list. A read-modify-write of the whole
map (canonical keys can contain spaces, which `FieldPath` dot-notation can't address cleanly).

## Out of scope, by decision

Count ↔ mass density; persisted suggestion rejections; "Aggiungi a lista" from the pantry (it
would race with the list's debounced full-array writes); `CookableSuggestions` still matches on
exact lowercase names; custom department ordering per the user's supermarket; a management page
for existing department overrides (fixed by moving again).
