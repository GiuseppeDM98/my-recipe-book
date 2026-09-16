# Spec roadmap — brainstorming 2026-08-12

> Outcome of the planning session on the app's improvement notes.
> This file is the **shared contract** between the six specs in this folder:
> the product decisions and cross-spec interfaces defined here **take precedence**
> in case of conflict with the individual specs. Every spec must be read together with this file.

## The six specs

| ID | File | Notes covered | Depends on | Size | Recommended model / effort |
|----|------|--------------|------------|--------|------------------------------|
| A | `spec-a-portate-ordinamento-spuntini.md` | 4 (meal ordering), 7 (snacks) | — | S | Sonnet · medium |
| B | `spec-b-sezioni-ai.md` | 8 (AI ingredient/method sections + reorganize existing) | — | M | Opus · high |
| C | `spec-c-nutrizione.md` | 2 (kcal/100g, serving weight), 5 (macronutrients) | — | M | Sonnet · high |
| D | `spec-d-dispensa-matching.md` | 1 (trivial items, check-off→pantry, duplicates, cooking deduction, matching) | — | L | Opus · xhigh |
| E | `spec-e-lista-spesa-reparti.md` | 6 (grouping by department) | D | M | Sonnet · high |
| F | `spec-f-piano-famiglia-redesign.md` | 3 (family plan + planner UI redesign) | A, (C for macros in the planner) | XL | Fable/Opus · xhigh + impeccable skill |

**Recommended implementation order: A → B → C → D → E → F.**

Rationale: A is a quick win that unlocks the canonical order used by F; B and C are
independent and of immediate value; D builds the matching engine that E
reuses for classification; F redesigns the planner UI only once,
on the final data model (meals from A, macros from C).

One spec = one branch = one work cycle (session rule: one branch/commit
per session, no commit without explicit OK).

## Product decisions (confirmed by the user)

1. **Ingredient ↔ pantry matching — hybrid**: conservative automatic match
   on the existing canonical key (accents + singular/plural); in uncertain
   cases the app proposes and the user confirms once; the confirmation becomes a
   **persistent alias on the pantry item** and holds forever, both for the
   shopping list and for the end-of-cooking deduction.
2. **Check-off → pantry — batch at the end of shopping**: you check items off without interruptions; a
   "Aggiungi alla dispensa" button opens a single flow with all the
   checked items, each with location/quantity/expiry pre-filled and editable.
3. **Trivial ingredients and duplicates**: a fixed curated list (acqua, acqua di
   cottura, ghiaccio…) **never** shown in the list; ingredients matched in
   the pantry with sufficient stock → collapsed **"Hai già in casa"** section,
   re-includable with a tap. Non-quantifiable match (non-comparable units)
   → the item stays in the list with an informational badge ("in dispensa: 500 g").
4. **Supermarket departments**: the pantry category taxonomy
   (`PANTRY_CATEGORIES`) is reused and extended as the single taxonomy for pantry and shopping list.
5. **Family plan — base meal + variants**: every slot has a default recipe
   for the whole family; where needed, a variant is added for one or more
   specific members. No full per-member grid.
6. **The shopping list scales by people**: every slot knows how many people
   are being cooked for; quantities scale by the people/base-servings ratio via
   `scaleQuantity()` (already existing). The planner's daily kcal become
   per-person.
7. **Nutrition — full coverage**: recipe detail (nutrition row:
   kcal/serving, ≈ serving weight, kcal/100g, P/C/F), form (manual fields), planner
   (daily kcal + macro totals).
8. **Snack labels**: `Spuntino` (mid-morning) and `Merenda` (afternoon).

## Cross-spec contracts (binding)

### 1. Canonical meal order (defined by Spec A, consumed by F)

- `MealType` (src/types/index.ts) is extended with the values **`'spuntino'`** and
  **`'merenda'`**.
- `SELECTABLE_MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']`
  (src/lib/constants/meal-types.ts) — it is also the canonical order.
- New helper exported from `meal-types.ts`:
  `sortMealTypes(types: MealType[]): MealType[]` — sorts by index in
  `SELECTABLE_MEAL_TYPES`; legacy types (`primo`, `secondo`, `contorno`,
  `dolce`) go at the end in stable order.
- `sortMealTypes` is applied **both on write** (`addMealType` in
  useMealPlanner, `toggleMealType` in MealPlanSetupForm) **and on read**
  (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm), so existing
  plans with the wrong order self-correct without a migration.

### 2. Ingredient matching engine (defined by Spec D, consumed by E)

- New module **`src/lib/utils/ingredient-matching.ts`** exporting at least:
  - `canonicalIngredientKey(name: string): string` — moved (or re-exported)
    from `ingredient-aggregator.ts`, currently private.
  - `isTrivialIngredient(name: string): boolean` — fixed curated list on canonical
    keys (acqua, acqua di cottura, acqua fredda/calda/tiepida, ghiaccio…).
  - `matchIngredientToPantry(name, pantryItems): { item: PantryItem; confidence: 'exact' | 'alias' } | { item: null; suggestions: PantryItem[] }`
    — exact = same canonical key; alias = key present in `item.aliases`;
    suggestions = fuzzy candidates to propose for manual confirmation.
- `PantryItem` gains **`aliases?: string[]`** (canonical keys confirmed
  by the user). No new collection: the field lives on the existing
  `pantry_items` document.
- `parseQuantity` / unit conversions in `ingredient-aggregator.ts` become
  exported and reusable (mass/volume/count dimensions, Italian unit aliases).
- Unchanged philosophy: **a non-match is the safe failure**; a false
  "already in the pantry" is worse than a false negative.

### 3. Department taxonomy (defined by Spec E)

- `PANTRY_CATEGORIES` (src/lib/utils/pantry-utils.ts) is extended with
  `surgelati`, `panetteria` and `altro` (explicit fallback), keeping the 10 existing
  slugs and the earthy OKLCH colors.
- Classification of a list item, in order of precedence:
  1. `categoryId` of the matched pantry item (via contract 2);
  2. the user's manual override (`users/{uid}.ingredientDepartmentOverrides`,
     map `canonicalKey → categoryId`);
  3. curated static dictionary `src/lib/utils/ingredient-departments.ts`
     (canonical key → category slug, ~200–400 common Italian ingredients);
  4. fallback `altro`.
- The shopping list has a view toggle **"Per reparto" / "Per ricetta"**
  (default: department); the per-recipe view keeps the current layout.

### 4. Per-serving nutrition (defined by Spec C, consumed by F)

- `Recipe` (and **both** declarations of `ParsedRecipe`) gain:
  - `servingWeightGrams?: number` — estimated weight of ONE serving;
  - `macrosPerServing?: { proteinGrams: number; carbsGrams: number; fatGrams: number }`.
- Same invariant as `caloriesPerServing`: **only the per-serving value
  is persisted**, never totals; kcal/100g is derived at render time
  (`caloriesPerServing / servingWeightGrams * 100`). No derived field saved.
- `/api/estimate-calories` is extended (same single AI call): the model
  estimates total weight + macros; the server derives the per-serving values, applies
  MIN/MAX_PLAUSIBLE_KCAL-style plausibility clamps and the sanity check
  `4·protein + 4·carbs + 9·fat ≈ kcal` (tolerance defined in the spec); numeric
  constraints live in the prompt + server clamp, NEVER in the JSON schema
  (minimum/maximum not supported → 400).

### 5. Family model on the plan (defined by Spec F)

- The slot identity stays the `(dayIndex, mealType)` pair — it does not break.
- `MealSlot` gains:
  - `servingsPlanned?: number | null` — **total** people served by the slot
    (default: number of members in `familyProfile`, fallback 2); the base meal covers
    `servingsPlanned` minus the people covered by variants (clamped to 0);
  - `variants?: MealSlotVariant[] | null` with
    `MealSlotVariant = { id: string; memberIds: string[]; existingRecipeId: string | null; recipeTitle: string | null }`
    — the base meal covers the members not covered by variants.
- Shopping list: scale factor per contribution =
  `peopleServed / (recipe.servings || 4)` applied with `scaleQuantity()`.
- Planner calories: daily totals **per person** (base + variants resolved
  per member), macros included if Spec C is already implemented.

### 6. Recipe sections (defined by Spec B)

- Parser: the section regex widens to capture **any** name after
  `## Ingredienti ` / `## Procedimento ` (with and without "per"), preserving the
  bare `## Ingredienti` behavior → section null.
- Prompt: `chat-recipe` and `format-recipe` gain a **prescriptive** rule
  ("se il piatto ha componenti logicamente distinte DEVI creare sezioni");
  `extract-recipes` stays faithful to the source (does not invent sections).
- Ordering: ingredient sections are shown in **order of first
  appearance** in the array (no more alphabetical sort); the fallback for steps
  without `sectionOrder` also becomes first-appearance order.
- New route **`POST /api/reorganize-recipe`**: receives the structured recipe
  (ids + text), returns **only the section assignment** keyed on the existing
  ids (`ingredientId → section`, `stepId → section + sectionOrder`).
  It touches neither text nor ids: no risk for active cooking sessions or
  `{{qty:ingredientId}}` tokens.

## Micro-fixes included in the specs (so they don't get lost)

- The shopping list's "Aggiungi articolo" button is gated on `hasPlan`: it must be made
  available even without a weekly plan (localStorage persistence already
  exists) → included in Spec D.
- `PantryItemQuickSheet`: delete without ConfirmDialog (violates the project
  rule) and a "Consumato" action that always decrements by 1 even on g/ml units
  → fixed in Spec D.
- Dead pantry stubs ("Da lista spesa" tab, "Aggiungi a lista" action,
  desktop handler never wired) → filled in or removed by Spec D.
- The `EditorialLoader` block of the planner's 'generating' step is dead
  code (nobody sets `step='generating'`) → reused or removed by Spec F.

## Status

- [x] Spec A — implemented (2026-08-24)
- [x] Spec B — implemented (2026-09-10)
- [x] Spec C — implemented (2026-09-15)
- [x] Spec D — implemented (2026-09-15)
- [x] Spec E — implemented (2026-09-15)
- [ ] Spec F — to be implemented

Update this checklist (and "Recent Changes" in CLAUDE.md) every time a spec is completed.
