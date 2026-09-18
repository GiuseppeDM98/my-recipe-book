# Spec F — Family plan (base meal + per-member variants) + planner page redesign

> Notes covered: 3 (family plan + planner UI redesign) | Dependencies: **Spec A (mandatory** — `sortMealTypes`, `spuntino`/`merenda` in `SELECTABLE_MEAL_TYPES`**)**, Spec C (optional — macros in the planner, see §4.3.4) | Branch: `feature/family-meal-plan`

This spec must be read together with `specs/00-roadmap.md` (contracts 1, 4 and 5 and product decisions 5 and 6). In case of conflict the roadmap wins.

**Amendments at implementation time (2026-09-17, each confirmed by the user)** — the body below is already updated, this list only says what changed and why:
1. **Legacy slot: explicit `Conferma {n} persone` button** (§4.5 view `main`, item 3). "Confirm to activate" had no gesture when the default was already the right number: ± necessarily changes it.
2. **Variants are editable** (`Modifica` on each row, §4.5 item 4), not only removable: the row walks the same two steps (members → recipe) with the current values preselected. It is also what makes the orphan hint "Modifica o rimuovi questa variante" (§4.5.5) true.
3. **The base recipe is excluded from the variant picker** (§4.5 `variant-recipe`): a variant identical to the base meal is not a variant.
4. **The plan-structure panel sits collapsed ABOVE the grid** (§4.6.3), not below it: closed it costs 56px, and below the grid it would land after seven stacked day cards on a phone.
5. **The people chosen at setup are persisted** as `MealPlan.defaultServingsPlanned` (§4.1, §4.6.2, roadmap contract 5) instead of living only in the session: cells keep being filled for days, often after a reload or from another device, and they silently fell back to the family size.

**Note on file:line references**: verified against the code as of 2026-08-12, **before** Spec A was implemented. After Spec A some lines of `meal-types.ts`, `useMealPlanner.ts` and `MealPlanSetupForm.tsx` will shift slightly; the symbols cited remain valid.

---

## 1. Goal

Today the planner doesn't know how many people it is cooking for: the shopping list copies quantities exactly as written in the recipe (whatever its `servings`) and daily kcal count one serving per slot. With this spec:

- every plan slot declares **for how many people** the base meal is prepared (`servingsPlanned`, default = number of members in the family profile, fallback 2);
- a slot can have **per-member variants**: "Tuesday dinner everyone has baked pasta, but Sofia eats the minestrone" — the variant references an existing recipe from the cookbook and one or more family members;
- the **shopping list scales** each contribution by the factor `personsServed / (recipe.servings || 4)` via `scaleQuantity()`; variants generate their own contributions;
- **planner kcal become per-person**: the base-path value is highlighted, alternative totals for members with variants go in a tooltip/detail;
- **the planner page is redesigned**: progressive setup instead of the monolithic form, calendar with variant badges and kcal/person, integrated plan structure, empty state, removal of the dead code of the `generating` step.

**Backward-compatibility invariant (critical)**: `servingsPlanned == null` (all existing plans) = legacy behavior, **no scaling**, quantities as-is. The shopping lists of plans already created must not change on their own.

---

## 2. Current state

### 2.1 Data model

`MealSlot` (src/types/index.ts:403-413) has no concept of people/servings/family:

```ts
export interface MealSlot {
  dayIndex: number;              // 0 = Lunedì, 6 = Domenica
  mealType: MealType;
  existingRecipeId: string | null;  // null if slot uses newRecipe or is empty
  newRecipe: ParsedRecipe | null;   // AI-generated recipe not yet in cookbook; null if existingRecipeId set
  recipeTitle: string | null;       // Denormalized for fast render without recipe lookup
  /** AI-suggested category name for new recipes (not an ID — the AI knows names, not IDs). */
  suggestedCategoryName?: string;
  /** AI-suggested seasons for new recipes. */
  suggestedSeasons?: Season[];
}
```

A slot's identity is the pair `(dayIndex, mealType)` (comment at src/types/index.ts:391); the string keys `${dayIndex}-${mealType}` are used in useMealPlanner.ts:317, pianificatore/page.tsx:243-245 and WeeklyCalendarGrid.tsx:151/:196. **This identity is not to be touched.**

`FamilyProfile`/`FamilyMember` (src/types/index.ts:43-52): `FamilyMember { id: string; age: number; label?: string | null }`, `FamilyProfile { members: FamilyMember[]; notes?: string | null }`, saved on `users/{uid}.familyProfile`. `useFamilyProfile` (src/lib/hooks/useFamilyProfile.ts:24-81, query key `['familyProfile', uid]`, staleTime 5 min, `enabled: !!user`) is **currently consumed only by the AI flows** (verified: no hits for `familyProfile` in pianificatore, meal-planner components, useMealPlanner, meal-plan-shuffle, useShoppingList, ingredient-aggregator). The "Componente N" label fallback exists in `buildFamilyContextPrompt` (src/lib/utils/family-context.ts:55: `const label = member.label ?? \`Componente ${index + 1}\`;`).

### 2.2 Shopping list

`buildContributions` (src/lib/utils/ingredient-aggregator.ts:19-54) iterates **all** `plan.slots` (without filtering by `activeMealTypes` — invariant: orphan slots are never persisted) and copies quantities as-is:

```ts
for (const ing of ingredients) {
  contributions.push({
    name: ing.name,
    quantity: ing.quantity,
    section: ing.section ?? null,
    recipeTitle,
    dayIndex: slot.dayIndex,
    mealType: slot.mealType,
  });
}
```

`useShoppingList` (src/lib/hooks/useShoppingList.ts:107-118) batch-fetches only the recipes referenced by `slot.existingRecipeId`:

```ts
const existingIds = plan.slots
  .map(s => s.existingRecipeId)
  .filter((id): id is string => !!id);

const recipesById = await getRecipesByIds(existingIds, user!.uid);
```

`scaleQuantity` (src/lib/utils/ingredient-scaler.ts:29-56) already exists and is used only in cooking mode and in the `{{qty:id}}` tokens: it returns the string unchanged when `originalServings <= 0 || newServings <= 0 || originalServings === newServings` and for non-scalable quantities (`q.b.`, `un pizzico`, `a piacere`, ingredient-scaler.ts:43-47).

### 2.3 Planner calories

`computeDayCalories` (src/lib/utils/meal-plan-calories.ts:62-92) sums `caloriesPerServing` once per filled slot ("Sum of kcal per serving across the day's resolvable slots", :19); `readSlotCalories` (:37-48) resolves `existingRecipeId → recipesById`, then `newRecipe`. `computeWeekCalories` (:100-112) iterates `plan.activeDays ?? [0..6]`. Rendering is in `WeeklyCalendarGrid.renderDayCalories` (src/components/meal-planner/WeeklyCalendarGrid.tsx:72-88): it hides days with `total === 0`, prefixes `≥` on partial ones, tooltip via `title`.

### 2.4 Plan mutations

In `useMealPlanner` (src/lib/hooks/useMealPlanner.ts): `updateSlot` (:262-286) and `reshuffleSlot` (:310-368) rebuild the slot **from scratch** with the filter+push pattern, e.g. updateSlot:274-280:

```ts
updatedSlots.push({
  dayIndex,
  mealType,
  existingRecipeId: recipeId,
  newRecipe: null,
  recipeTitle: title,
});
```

(any extra field of the previous slot would be lost — this must change, see §4.4). `clearSlot` (:291-302) removes the whole slot. `copyPlanToWeek` (:192-213) copies `currentPlan.slots` verbatim (:204) — new slot fields travel for free. `removeMealType` (:473-495) also deletes the slots (comment :467-471). `addDay` (:407-417) does not invalidate the shopping list (by design); all other mutations call `invalidateShoppingList()` (:89-92, partial key `['shoppingList', uid]`). Note: the dep array of `reshuffleSlot` (:368) omits `invalidateShoppingList` (fragile, to be fixed).

`buildShuffledSlots` (src/lib/utils/meal-plan-shuffle.ts:39-69) creates the slots at :58-64 with only the 5 base fields; `ShuffleConfig` (:19-24) has no notion of people.

### 2.5 Planner page

`pianificatore/page.tsx`: title → `PlannerHeader` (:378-389) → `setup` step (:392-453: "Piani già salvati" card, "Come usare il pianificatore" info box, monolithic `MealPlanSetupForm` in a `max-w-lg` column) → **dead** `generating` step (:456-464: `EditorialLoader`; nothing ever sets `step='generating'` — `PlannerStep` is declared in useMealPlanner.ts:38, `isGenerating` is only used to disable buttons) → `calendar` step (:467-526: `PlanStructureCard` + `WeeklyCalendarGrid` + "Ricette da rivedere"). Overlays: `RecipePickerSheet` (:529-541), copy-plan Dialog (:543-589), delete-plan `ConfirmDialog` (:591-599).

`MealPlanSetupForm` (src/components/meal-planner/MealPlanSetupForm.tsx:31-327): season, day chips, meal checkboxes (default `['pranzo','cena']`, :39), per-meal config "Categorie per portata" visible **only at setup** (:197-295), two CTAs (:306-324). `RecipePickerSheet` (src/components/meal-planner/RecipePickerSheet.tsx:48-233): `h-[85vh]` bottom sheet with search/season filter/category filter, one tap = select+close (:89-92), "Rimuovi ricetta da questo slot" action (:220-229, no confirmation). `MealSlotCell` (src/components/meal-planner/MealSlotCell.tsx:49-203): empty/cookbook/AI-new/regenerating states; the reshuffle button uses the pattern `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100` (:111).

Grid (`WeeklyCalendarGrid.tsx`): desktop/landscape `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block overflow-x-auto` (:117) with `gridTemplateColumns: \`88px repeat(${activeDays.length}, minmax(150px, 1fr))\`` (:121, :139); mobile portrait stacked day cards (:172-218).

---

## 3. Product decisions (binding, from the roadmap)

1. **Base meal + variants** (decision 5): every slot has a default recipe for the whole family; where needed a variant is added for one or more specific members. **No full per-member grid.**
2. **Contract 5**: slot identity `(dayIndex, mealType)` intact; `MealSlot` gains `servingsPlanned?: number | null` and `variants?: MealSlotVariant[] | null` with `MealSlotVariant = { id: string; memberIds: string[]; existingRecipeId: string | null; recipeTitle: string | null }`; the base meal covers the members not covered by variants.
3. **Shopping list scaling** (decision 6): per-contribution factor = `personsServed / (recipe.servings || 4)` applied with `scaleQuantity()`; legacy slot (`servingsPlanned == null`) → factor 1.
4. **Per-person kcal** (decision 6): the planner's daily totals become per-person; macros included if Spec C is already implemented.
5. **Variants only from existing recipes** (no `newRecipe` in variants). Rationale: inline `newRecipe` is a leftover of the old AI generator (the shuffle never generates `newRecipe`, AGENTS.md §9 "Backward-compat"); allowing it in variants would mean duplicating the whole review/save flow (`NewRecipeReviewCard`), adding a third resolution path in the aggregator and calories, and growing the `meal_plans` document by a full recipe per variant. The real use case ("the child eats something simpler") is covered by the cookbook; if the recipe doesn't exist yet, it is created first (manually or with AI) and then selected.
6. **No batch migration**: lazy dual-read like `categoryIds` — the new fields are optional, existing documents are not touched until the user edits a slot.
7. **Canonical meal order** from Spec A: use `sortMealTypes()` wherever `activeMealTypes` is written/rendered.

---

## 4. Proposed design

### 4.1 Data model

**Before** (src/types/index.ts:403-413): see §2.1.

**After** (same file, add `MealSlotVariant` above `MealSlot`):

```ts
/**
 * Per-member variant of a slot: one or more family members eat
 * a recipe different from the base meal.
 *
 * EXISTING RECIPES ONLY: no inline `newRecipe` — variants reference the
 * cookbook. See Spec F §3 (decision 5) for the rationale (avoids duplicating
 * the AI review flow and bloating the meal_plans document).
 *
 * memberIds references FamilyMember.id from the family profile. A member removed from
 * the profile leaves an "orphan variant": scaling keeps counting
 * memberIds.length (the planned people), the UI marks the chip as
 * "Componente rimosso" (see §4.5.5).
 */
export interface MealSlotVariant {
  id: string;                       // crypto.randomUUID()
  memberIds: string[];              // always >= 1 element (client-side guard)
  existingRecipeId: string | null;  // cookbook recipe; null only for corrupt data (defensive skip)
  recipeTitle: string | null;       // denormalized for O(1) render, like MealSlot.recipeTitle
}

export interface MealSlot {
  dayIndex: number;
  mealType: MealType;
  existingRecipeId: string | null;
  newRecipe: ParsedRecipe | null;
  recipeTitle: string | null;
  suggestedCategoryName?: string;
  suggestedSeasons?: Season[];
  /**
   * People the base meal is cooked for (variants excluded: the base covers
   * servingsPlanned − Σ variants[].memberIds.length people, clamped to 0).
   *
   * LEGACY INVARIANT (non-negotiable): null/undefined = plan created before
   * this feature OR slot never reconfigured → NO scaling, quantities as-is.
   * Existing shopping lists must not change on their own. The value is
   * written only by: shuffle (family default), slot editor, updateSlot on a new slot.
   */
  servingsPlanned?: number | null;
  /** Per-member variants; null/undefined/[] = none. Persist null, never undefined. */
  variants?: MealSlotVariant[] | null;
}
```

Firestore rules: `servingsPlanned` and `variants` are written as `null` or omitted, **never `undefined`** (CLAUDE.md "Never persist undefined"). All writes go through `updateMealPlanSlots`/`updateMealPlan` (src/lib/firebase/meal-plans.ts:146-168), which rewrite the whole slots array: it is enough that the slot objects built client-side contain no `undefined` keys (use conditional spread or explicit `null` values).

**Document size**: a variant weighs ~120 bytes serialized (UUID id + 1-2 memberIds + recipeId + title). Worst case 7 days × 5 meals × 3 variants ≈ 105 variants ≈ 13 KB extra on a document that today weighs a few KB — irrelevant compared to Firestore's 1 MiB limit. Inline variants avoid a new collection (rules, index, N reads per plan), consistent with the choice already made for `shoppingCustomItems` on the plan and `adHocShoppingRecipes` on `users/{uid}`.

**Plan-level default people**: `MealPlan` gains `defaultServingsPlanned?: number | null` — the answer to "Per quante persone cucini di solito?" given at setup, persisted on the plan document (written by `createMealPlan` in both the shuffle and the manual path, carried by copy-plan). It only seeds `servingsPlanned` on cells filled **later**; it never rescales existing slots and never touches a legacy slot. `null`/absent (every plan created before the field) → family default below. No rule/index change: `meal_plans` rules are owner-based with no field validation.

**Default people**: `defaultServingsPlanned = currentPlan?.defaultServingsPlanned ?? normalizeFamilyProfile(familyProfile)?.members.length ?? 2` (use `normalizeFamilyProfile` from src/lib/utils/family-context.ts:12-39 to discard invalid members, as the AI flows do). Computed in `useMealPlanner` by composing `useFamilyProfile()` (staleTime 5 min: a just-edited profile may take up to 5 minutes to be reflected in the default — acceptable, the value is editable per slot anyway).

### 4.2 Shopping list scaling (`ingredient-aggregator.ts`)

`buildContributions(plan, recipesById)` keeps its signature. New per-slot logic (faithful TS pseudocode):

```ts
const DEFAULT_RECIPE_SERVINGS = 4; // same fallback as cooking mode (recipe.servings || 4)

for (const slot of plan.slots) {
  const variants = (slot.variants ?? []).filter(v => v.existingRecipeId && v.memberIds.length > 0);
  const variantPersons = variants.reduce((sum, v) => sum + v.memberIds.length, 0);

  // ── Base meal contributions ──
  // null → LEGACY: factor 1, quantities as-is (invariant §1).
  const basePersons = slot.servingsPlanned == null
    ? null
    : Math.max(0, slot.servingsPlanned - variantPersons);

  if (/* slot has a resolvable base recipe (existingRecipeId in recipesById, or newRecipe) */) {
    if (basePersons === null) {
      // push unchanged quantities — identical to the current code (:41-50)
    } else if (basePersons > 0) {
      const baseServings = recipe.servings || DEFAULT_RECIPE_SERVINGS; // applies to both Recipe and ParsedRecipe
      // push with quantity: scaleQuantity(ing.quantity, baseServings, basePersons)
    }
    // basePersons === 0 → the base doesn't enter the list (variants cover everyone)
  }

  // ── Variant contributions (always, even if servingsPlanned is null — defensive case) ──
  for (const v of variants) {
    const vRecipe = recipesById.get(v.existingRecipeId!);
    if (!vRecipe) continue; // deleted recipe: skip, as for base slots (:31)
    const persons = v.memberIds.length;
    for (const ing of vRecipe.ingredients) {
      contributions.push({
        name: ing.name,
        quantity: scaleQuantity(ing.quantity, vRecipe.servings || DEFAULT_RECIPE_SERVINGS, persons),
        section: ing.section ?? null,
        recipeTitle: vRecipe.title,
        dayIndex: slot.dayIndex,
        mealType: slot.mealType,
      });
    }
  }
}
```

Notes:
- `scaleQuantity` imported from `@/lib/utils/ingredient-scaler` — non-scalable strings (`q.b.`, `a piacere`, ranges, fractions) are already handled there: they pass through unchanged or scale correctly; do **not** reimplement the parsing.
- `scaleQuantity(q, base, base)` returns the string unchanged (ingredient-scaler.ts:35): a slot with `servingsPlanned === recipe.servings` produces quantities identical to legacy — no spurious reformatting.
- The `IngredientContribution` interface (:3-10) **does not change**: the quantity reaches aggregation already scaled, and `aggregateIngredients`/`mergeQuantities` stay intact.
- The state `servingsPlanned != null && variants present on a slot without a base` is not reachable from the UI (the editor requires the base recipe, §4.5); the code tolerates it anyway (variants contribute, base doesn't).
- Item ids (`toSlug(canonicalIngredientKey(name))`, :127) don't depend on quantities → the checked state (`shoppingCheckedIds`) survives scaling.

**`useShoppingList` — batch fetch**: extend the id collection (src/lib/hooks/useShoppingList.ts:111-113) to the variants' recipes:

```ts
const existingIds = plan.slots.flatMap(s => [
  ...(s.existingRecipeId ? [s.existingRecipeId] : []),
  ...(s.variants ?? []).map(v => v.existingRecipeId).filter((id): id is string => !!id),
]);
```

(`getRecipesByIds` already deduplicates incoming ids — `const uniqueIds = [...new Set(recipeIds)]`, src/lib/firebase/firestore.ts:147 — so base/variant duplicates cost no extra reads and no caller-side dedupe is needed.)

### 4.3 Per-person kcal (`meal-plan-calories.ts`)

> **Coordination with Spec C** (as with the note on file:line references at the top of the spec): if Spec C is already implemented, `meal-plan-calories.ts` no longer exposes `DayCalories`/`computeDayCalories`/`computeWeekCalories` but `DayNutrition` (with `calories: NutrientTotal` and a `macros` block), `computeDayNutrition`/`computeWeekNutrition`, and the render in `WeeklyCalendarGrid` is called `renderDayNutrition` (Spec C §4.f). In that case the changes in this section apply to **those** names and that shape — `memberDeltas` is added to the day model, the base/variant resolution applies to kcal and (via §4.3.4) to macros — without restoring the old names. The references to `DayCalories`/`computeDayCalories` below describe the case where Spec C is not yet implemented.

#### 4.3.1 Semantics

- **Base path (highlighted)**: kcal for **one person** eating the base meal of every filled slot of the day = sum of the base recipes' `caloriesPerServing`. It is **the same number as today** — only the label changes (from implicit day total to "kcal/pers."). Legacy plans therefore show the same value as before.
- **Per-member totals**: for each family profile member covered by **at least one variant** on that day, their total = for every filled slot, the `caloriesPerServing` of the variant covering them if it exists, otherwise of the base. Members without variants on that day coincide with the base path and don't appear in the list.
- `servingsPlanned` does **not** enter kcal (they are per-person, not totals for the whole pot).
- Partiality: the `isPartial`/`≥` convention is kept (meal-plan-calories.ts:11-15), computed per track (base and per-member separately).

#### 4.3.2 Types

**Before** (`DayCalories`, meal-plan-calories.ts:18-27): `{ total, countedSlots, uncountedSlots, isPartial }`.

**After**:

```ts
export interface MemberDayCalories {
  memberId: string;
  label: string;        // FamilyMember.label ?? `Componente ${index+1}` (same fallback as family-context.ts:55)
  total: number;
  isPartial: boolean;
}

export interface DayCalories {
  /** kcal for ONE person on the base path. Equal to the old `total` on plans without variants. */
  total: number;
  countedSlots: number;
  uncountedSlots: number;
  isPartial: boolean;
  /** Alternative totals for only the members covered by variants on the day; [] otherwise. */
  memberDeltas: MemberDayCalories[];
}
```

#### 4.3.3 Signatures

```ts
export interface PlannerMember { id: string; label: string; } // already resolved with the "Componente N" fallback

export function computeDayCalories(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []      // [] = no profile → memberDeltas always []
): DayCalories;

export function computeWeekCalories(
  plan: MealPlan,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []
): Map<number, DayCalories>;
```

`memberDeltas` algorithm: collect the `memberId`s present in the variants of the day's filled slots **and** present in `members` (orphan members don't appear — their label can no longer be reconstructed). For each, iterate the day's filled slots: kcal = `readVariantCalories(variant covering them)` if it exists, otherwise `readSlotCalories(slot)` (existing function :37-48, unchanged); `null` → `isPartial` for that member. `readVariantCalories(v)` = `recipesById.get(v.existingRecipeId)?.caloriesPerServing ?? null`.

Who resolves `members`: the planner page, with `useFamilyProfile()` + `normalizeFamilyProfile` + label fallback, passing them to `WeeklyCalendarGrid` as the `members: PlannerMember[]` prop. `WeeklyCalendarGrid` updates the memo (:56-59) to `computeWeekCalories(plan, recipesById, members)`.

#### 4.3.4 Macros (Spec C extension point)

If at implementation time `Recipe.macrosPerServing` exists (Spec C checked off in the roadmap checklist), add to `DayCalories` and `MemberDayCalories` the optional fields `macros?: { proteinGrams: number; carbsGrams: number; fatGrams: number } | null` (summed with the same base/variant resolution; `null` if even a single counted recipe lacks them — no silent partial sums) and show them in the day's kcal detail (§4.6.3). If Spec C is not yet implemented: do **not** add the fields; leave a comment `// SPEC C EXTENSION: per-person macros — see specs/spec-f §4.3.4` at the exact spot (after the `total` computation in `computeDayCalories`).

#### 4.3.5 Display

- Day badge: `≈1250 kcal/pers.` (`≥` prefix if partial, unchanged; `total === 0` → no badge, unchanged, WeeklyCalendarGrid.tsx:74).
- With `memberDeltas.length > 0`: the badge gains an indicator (lucide `Users` icon, `h-3 w-3`) and:
  - **desktop (`lg`)**: extended `title`, e.g. `Base ≈1250 kcal/pers. · Sofia ≈1100 · Marco ≈1450` (tooltip pattern already in use, :79-83);
  - **mobile portrait**: the badge becomes a `<button>` (`aria-expanded`) that expands a detail row in the day card: `Sofia ≈1.100 kcal · Marco ≈1.450 kcal` — simple conditional render, no hover-only (touch gotcha). No new dependency (no Radix popover).

### 4.4 `useMealPlanner` mutations

All mutations keep the optimistic-write pattern (`setCurrentPlan` → `updateMealPlanSlots`/`updateMealPlan`) and **all** of them (except `addDay`, unchanged by design) call `invalidateShoppingList()` (:89-92).

| Function | Change |
|---|---|
| `updateSlot(dayIndex, mealType, recipeId, title)` | The push (:274-280) **preserves** the previous slot's `servingsPlanned` and `variants` (changing the base dish doesn't change who eats what). If the slot didn't exist (empty cell): `servingsPlanned: defaultServingsPlanned`, `variants: null`. |
| `clearSlot` | Unchanged: removes the whole slot, variants included (emptying the meal = nobody eats there). |
| `reshuffleSlot` | The replacement slot (:349-355) **preserves** `servingsPlanned` and `variants` and changes only `existingRecipeId`/`recipeTitle`. Rationale: the re-roll answers "suggest a different base dish"; who eats and who deviates is orthogonal, and wiping variants on an accidental tap of ↺ would destroy careful manual configuration. While touching the function: add `invalidateShoppingList` to the dep array (:368, currently omitted). |
| `setSlotServings(dayIndex, mealType, servingsPlanned: number)` | **New.** Clamp `1..20`. Updates the field on the existing slot (no-op with an error toast if the slot is empty — not reachable from the UI). Writes with `updateMealPlanSlots` + invalidation. |
| `setSlotVariants(dayIndex, mealType, variants: MealSlotVariant[])` | **New.** Filters out variants with empty `memberIds`; empty array → persists `variants: null`. If the slot has `servingsPlanned == null`, sets it to `defaultServingsPlanned` in the same write (a variant implies the family model: avoids the defensive state "variants on a legacy slot"). Writes + invalidates. |
| `copyPlanToWeek` | **No code change** (:204 copies `currentPlan.slots` verbatim → `servingsPlanned`+`variants` travel along); add an explicit test. |
| `addMealType` / `removeMealType` / `addDay` / `removeDay` | Logic unchanged (Spec A introduces `sortMealTypes` there). `removeMealType`/`removeDay` delete whole slots → no orphan variants (buildContributions invariant, :467-471). `addMealType` with autofill passes `defaultServingsPlanned` to the shuffle (below). |
| `generateShuffledPlan` | Passes `defaultServingsPlanned` to `buildShuffledSlots`. |
| Hook return | Additionally exposes: `setSlotServings`, `setSlotVariants`, `defaultServingsPlanned: number`. |

**`buildShuffledSlots`** (meal-plan-shuffle.ts): `ShuffleConfig` gains `defaultServingsPlanned?: number | null`; the slot push (:58-64) adds `servingsPlanned: config.defaultServingsPlanned ?? null, variants: null`. The function stays pure and testable; callers that don't pass the field (existing tests) produce legacy slots — no existing test breaks.

**`PlannerStep`** (useMealPlanner.ts:38): remove `'generating'` from the type (`'setup' | 'calendar'`) — see §4.6.5.

### 4.5 Slot editor: `MealSlotEditorSheet` (new component)

**Choice: a dedicated sheet, not an extension of `RecipePickerSheet`.** Rationale: the current picker is a single-purpose "search → tap → close" view (:89-92); the slot now has three persistent concerns (base recipe, people, variants) that require a sheet which stays open between one action and the next. Cramming steppers and variant lists into the picker would destroy its ergonomics. Reuse happens at the right level: **extract from `RecipePickerSheet` the search+filters+list panel** into a reusable internal component `RecipePickerPanel` (props: `recipes`, `categories`, `selectedRecipeId?`, `onPick(recipe)`) used both for choosing the base and for choosing the variant. `RecipePickerSheet.tsx` is replaced by `MealSlotEditorSheet.tsx` + `RecipePickerPanel.tsx` (the old sheet's file is deleted; the page always opens the editor).

File: `src/components/meal-planner/MealSlotEditorSheet.tsx`, bottom sheet `side="bottom"` `h-[85vh] flex flex-col` (same shell as the current picker, :111-114). Internal state as **views**: `'main' | 'pick-base' | 'variant-members' | 'variant-recipe'` (with back). Props: `open`, `onOpenChange`, `dayIndex`, `mealType`, `recipes`, `categories`, `currentSlot: MealSlot | undefined`, `members: PlannerMember[]`, `defaultServingsPlanned`, callbacks `onSelectBase`, `onClear`, `onSetServings`, `onSetVariants` (wired to the hook's mutations by the page, as today :529-541).

**`main` view** (top to bottom):

1. **Header**: `Martedì — Pranzo` (current pattern, RecipePickerSheet.tsx:87) + sr-only `SheetDescription`.
2. **Base recipe**: card with the recipe title + "Vai alla ricetta" link (if `existingRecipeId`) + `Cambia ricetta` button → `pick-base` view. Empty slot: primary button `Scegli la ricetta base` → `pick-base`; stepper and variants disabled with caption `Prima scegli la ricetta base.`
3. **People**: label `Per quante persone?`, reused `ServingsStepper` (src/components/recipe/servings-stepper.tsx:35, props `value/onChange/min=1/max=20/size='md'`) with value `currentSlot.servingsPlanned ?? defaultServingsPlanned`. Dynamic caption:
   - without variants: `Il pasto base copre {n} person{a|e}.`
   - with variants: `Base per {n−k} person{a|e} · {k} con variante.`
   - `n−k <= 0`: warning with a warning-tone `StatusBanner`: `Le varianti coprono tutte le persone: la ricetta base non entrerà nella lista della spesa.`
   - Legacy slot (`servingsPlanned == null`): the stepper shows the default but with caption `Quantità non ancora adattate alle persone — conferma per attivare.` next to an outline button `Conferma {n} person{a|e}`, and the value is persisted **only** on an explicit user action (± tap, input edit, or that button — needed because when the default is already right, ± can't confirm it without changing it), never merely by opening the sheet. `ServingsStepper` re-emits its value on blur: an unchanged value is ignored. This protects invariant §1: opening and closing the editor doesn't change the shopping list.
   - Stepper persistence: local 600 ms debounce (`setTimeout` ref) on `onSetServings`, with **flush on sheet close and unmount** (same risk as the AGENTS "debounce non-flushed" gotcha: timer cleared when it fires, read from ref).
4. **Variants**: heading `Varianti` + subtitle `Un piatto diverso per uno o più componenti.`
   - List of current variants: for each, a row with member chips (label or initial) + recipe title + `Modifica` button (→ `variant-members` with the variant's current members preselected — members no longer in the profile are dropped — then `variant-recipe` with its recipe highlighted; the commit replaces the variant in place, same `id`) + `X` button (**direct** removal, without ConfirmDialog: it's a single-slot edit rebuildable in two taps, same weight as the current "Rimuovi ricetta da questo slot" :220-229; ConfirmDialogs remain for multi-slot destruction: day, meal, plan).
   - `+ Aggiungi variante` button → `variant-members` view. Disabled with a hint when: (a) family profile empty/missing → `Per creare varianti aggiungi i componenti nel profilo famiglia.` + link `Vai al profilo famiglia` (`/profilo-famiglia`); (b) all members already covered → `Tutti i componenti hanno già una variante.`
5. **Footer**: ghost destructive button `Svuota slot` (behavior = current `clearSlot`: removes recipe, people and variants; copy below: `Rimuove ricetta, persone e varianti di questo pasto.`) + sheet close.

**`variant-members` view**: title `Per chi?`; toggle chip for each profile member (label or `Componente N`), members already covered by another variant disabled with caption `già coperto da una variante`; CTA `Continua` (disabled at 0 selected) → `variant-recipe`; `Annulla` → `main`.

**`variant-recipe`** and **`pick-base`** views: full-height `RecipePickerPanel` (in `variant-recipe` the slot's base recipe is left out of the list via `excludedRecipeIds` — the same dish would not be a variant); tapping a recipe = immediate commit (`onSetVariants` with the new variant appended / `onSelectBase`) and return to `main` (the sheet does **not** close: the user often configures several things). Every commit writes to Firestore immediately via the hook's mutations (consistent with the planner's optimistic-write model) and shows an error toast on failure (pattern page.tsx:170-189).

**State synchronization**: the sheet derives everything from `currentSlot` (prop) — it keeps no local copies of recipe/variants; the only local state is the current view, the in-progress member selection and the stepper draft (with a sync `useEffect` on slot change — `useState(prop)` gotcha).

### 4.5.5 Orphan variants (member deleted from the profile)

Explicit behavior, across three surfaces:
- **Scaling** (aggregator): uses `memberIds.length` as persisted — planned people stay planned even if the profile changes; the shopping list doesn't silently shrink.
- **Kcal**: orphan members don't appear in `memberDeltas` (§4.3.3) — the label can't be reconstructed.
- **UI**: in the calendar and in the editor the unresolvable member's chip renders as `Componente rimosso` (`bg-muted text-muted-foreground`, `title="Questo componente non è più nel profilo famiglia"`); in the editor the variant row shows a hint `Modifica o rimuovi questa variante.` The user resolves it manually; no auto-cleanup (an implicit write that changes the shopping list would violate the principle of invariant §1).

### 4.6 Planner page redesign (wireframe-level architecture)

Visual fine-tuning is delegated to the **impeccable** skill during implementation (see §9). Here: information architecture, behaviors, copy. Cross-cutting constraints: page `max-w-[1200px] mx-auto` with no padding of its own (AGENTS §1); semantic tokens, never `bg-white`; no `sticky` inside `.shell-stage` on desktop (app-shell with internal scroll); terracotta as a stamp ≤10% (DESIGN.md "The Stamp Rule"); no cards nested beyond one level; shared `EditorialEmptyState`/`StatusBanner`/`ConfirmDialog`; `max-lg:portrait:` breakpoint.

#### 4.6.1 Header

`PlannerHeader` redesigned on one row (two on mobile portrait): compacted page title + week navigation (`‹ 17 – 23 marzo 2026 ›`) + `Oggi` button (visible only when the displayed week is not the current one; navigates to `getCurrentWeekMonday()`); `Nuovo piano` / `Copia piano` / `Elimina piano` actions grouped on the right on desktop, in a row below on mobile (all already existing, PlannerHeader.tsx:71-110; `h-11` touch targets below `lg` kept).

#### 4.6.2 "No plan" state + progressive setup

When the week has no plan, no abrupt jump to the form: **empty state** (`EditorialEmptyState`) with title `Nessun piano per questa settimana`, subtitle `Genera una proposta dal tuo ricettario o parti da una griglia vuota.`, and the "Piani già salvati" chips (current content :394-417) right below to open another week. The setup follows in the same column (`max-w-lg mx-auto`).

**Setup: progressive cards, not a step wizard.** Rationale: there are few fields (season, days, meals, people, shuffle rules) and a 3-screen wizard adds taps without reducing load; progressive cards keep everything reviewable at a glance. Structure:

1. **`Giorni e portate` card** (always open): day chips + meal checkboxes (order `sortMealTypes`/`SELECTABLE_MEAL_TYPES` post-Spec A, with `Spuntino`/`Merenda`) + **new people field**: label `Per quante persone cucini di solito?`, `ServingsStepper` `size='md'`, prefilled with `defaultServingsPlanned`; caption `Puoi cambiarlo pasto per pasto dal calendario.` The value flows into `MealPlanSetupConfig` as a new field `defaultServingsPlanned?: number | null` and from there into the shuffle and into both creation paths, which persist it as `MealPlan.defaultServingsPlanned` (§4.1) — the default for cells filled later, reload and other devices included.
2. **`Stagione e regole` card — disclosure collapsed by default** (`grid-rows-[0fr]→[1fr]` pattern, never `max-h`): season (default `getCurrentSeason()`) + the current "Categorie per portata" (:197-295) with unchanged logic. **Where they live after setup**: nowhere — they are **generation** rules, not plan properties (`MealPlanSetupConfig` is not persisted, verified src/types/index.ts:526-546 "Setup configuration… consumed locally"); the live plan is edited per slot and the re-roll uses the current recipe's category tiers (`pickReshuffledRecipe`). This choice must be written in the disclosure copy: `Queste regole guidano solo la generazione: dopo, modifichi ogni pasto direttamente dal calendario.`
3. **Sticky CTA bar** (`sticky bottom-0 max-lg:portrait:bottom-20 bg-background border-t py-4 z-10` — below 1440px scrolling is window-level, so `sticky` is legitimate; on desktop ≥1440px verify the behavior inside `<main>`'s internal scroll and, if needed, make it non-sticky from `lg`): `Genera piano (shuffle)` (primary) + `Crea piano manuale` (outline), labels unchanged.
4. The "Come usare il pianificatore" info box (:420-436) becomes a `Come funziona?` disclosure collapsed at the end of the setup (declutter; the current content stays).

#### 4.6.3 Calendar

- **Integrated `PlanStructureCard`**: no longer two always-open cards above the grid (:469-478) but a single collapsible section `Giorni e portate del piano` (current chips + add/remove, logic and ConfirmDialog unchanged, PlanStructureCard.tsx:46-261) closed by default, with a compact summary in the heading (`7 giorni · Pranzo e Cena`). It stays **above** the grid: closed it is a 56px row, so the grid is effectively the first content, while below the grid it would sit after seven stacked day cards on mobile portrait.
- **Desktop grid**: current layout kept (`88px repeat(n, minmax(150px,1fr))` + `overflow-x-auto`, rows in `sortMealTypes` order); "today" emphasis unchanged (:126). With 5 active meals the rows become 5: no structural change needed (vertical scroll of `<main>`).
- **Mobile portrait grid**: stacked day cards unchanged; on mount **auto-scroll to today's card** (`scrollIntoView({ block: 'start' })` guarded by a one-time ref) if the week is the current one.
- **Per-day kcal/pers. badge**: §4.3.5.
- **Variant badges on the cell** (`MealSlotCell`): below the base recipe title, a row of compact chips — one per variant — with the **initial** of the first member (or `+n` if the variant covers several members), e.g. `S` `M+1`; `title` = `${labels}: ${recipeTitle}`; orphan member → `?` chip with title `Componente rimosso`. Max 3 chips + `+n` overflow. Style: `rounded-full bg-secondary text-[10px] text-muted-foreground h-4 min-w-4 px-1` — no terracotta (the stamp stays on selection/actions). The chips are not interactive (the whole cell opens the editor); they are always visible, never hover-only.
- The cell does **not** show the number of people (it lives in the editor and in the kcal computation): keep cells calm, the differential information is the variants.
- **"Ricette da rivedere"** (legacy `newRecipe` slots, :501-524): section unchanged.

#### 4.6.4 Grid empty state

Just-created manual plan (0 filled slots): above the grid an informational row (info `StatusBanner`): `Tocca una cella per scegliere la ricetta. Con ↺ ti propongo un'alternativa dal ricettario.` Shown while `plan.slots.length === 0`.

#### 4.6.5 `generating` / `EditorialLoader` dead code

**Removal** (not reuse): generation is local and synchronous (`buildShuffledSlots`, no network) — a full-screen loader for <50 ms would be a harmful flash. Remove: the `'generating'` member from `PlannerStep` (useMealPlanner.ts:38), the :456-464 block of page.tsx and the `EditorialLoader` import (page.tsx:22) if not reused elsewhere on the page. `isGenerating` stays to disable the CTAs (:449, PlannerHeader).

### 4.7 Edge cases and errors (one by one)

1. **Legacy plan intact**: `servingsPlanned == null` and `variants == null` on all slots → `buildContributions` byte-identical to today, `computeDayCalories.total` identical to today, cells without chips. Dedicated tests.
2. **Family profile missing/empty**: `defaultServingsPlanned = 2`; stepper working; variants section disabled with a link to the profile (§4.5.4a). The plan remains fully usable.
3. **Member without label**: fallback `Componente N` (1-based index in the normalized members array), consistent with family-context.ts:55. Chip initial = `C`+N? No: initial = first letter of the resolved label (so `C` for fallbacks) — accept the ambiguity, the `title` disambiguates.
4. **Member deleted from the profile (orphan variant)**: §4.5.5.
5. **Variants cover ≥ servingsPlanned**: base at 0 people → no base contribution in the list; warning in the editor (§4.5.3). `Math.max(0, …)` prevents negative factors.
6. **Variant recipe deleted from the cookbook**: shopping contributions skipped (as for the base, aggregator :31); the member's kcal → `isPartial`; cell: chip stays (title with the denormalized title); editor: variant row with denormalized title + edit hint.
7. **`recipe.servings` 0/undefined**: fallback 4 (`recipe.servings || 4`), identical to cooking mode. `scaleQuantity` with base ≤ 0 would return the string unchanged anyway (double safety net).
8. **Non-scalable quantities** (`q.b.`, `a piacere`, `un pizzico`): pass through `scaleQuantity` unchanged (ingredient-scaler.ts:43-47) and keep ending up in the `" + "` fallback of `mergeQuantities`. No change expected in existing tests for these cases.
9. **`servingsPlanned === recipe.servings`**: `scaleQuantity` returns the original string (no spurious `1/2 → 0,5` reformatting).
10. **Legacy `newRecipe` slot with `servingsPlanned` set** (possible after a people edit on a legacy AI slot): scaling on `slot.newRecipe.servings || 4` — the aggregator's base branch handles both sources.
11. **Stepper spam**: 600 ms debounce + flush on close/unmount; the write is idempotent anyway (full array).
12. **Firestore error on slot write**: existing pattern — optimistic state already applied, error toast (`toast.error`), no automatic rollback (consistent with the current updateSlot).
13. **Two devices**: last-write-wins on the whole slots array (existing behavior, unchanged and documented in AGENTS).
14. **Meal order with old plans**: grid rows via `sortMealTypes` (Spec A) — legacy types (`primo`…) at the end, rendering guaranteed by the exhaustive `MEAL_LABELS`.

---

## 5. Phased implementation plan

Every phase leaves the project compiling (`npx tsc --noEmit` green).

**Phase 1 — Data model + scaling + kcal (no new UI, legacy behavior unchanged)**
- `src/types/index.ts`: `MealSlotVariant`, `servingsPlanned`/`variants` fields on `MealSlot` (with the legacy invariant doc-comment).
- `src/lib/utils/ingredient-aggregator.ts`: scaling in `buildContributions` (§4.2), import `scaleQuantity`.
- `src/lib/hooks/useShoppingList.ts`: batch fetch extended to the variants' recipes (§4.2).
- `src/lib/utils/meal-plan-calories.ts`: new types and signatures (§4.3), `readVariantCalories`.
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: minimal adaptation to the new signature (`members` prop, default `[]`; badge label → `kcal/pers.`), without redesign.
- `src/app/(dashboard)/pianificatore/page.tsx`: passes a provisional `members={[]}` (or already resolves `useFamilyProfile` — either way, as long as it compiles).
- Tests: update/extend `ingredient-aggregator.test.ts` and `meal-plan-calories.test.ts` (§6).

**Phase 2 — Hook mutations + shuffle + family in the planner**
- `src/lib/hooks/useMealPlanner.ts`: `setSlotServings`, `setSlotVariants`, field preservation in `updateSlot`/`reshuffleSlot`, `defaultServingsPlanned` via `useFamilyProfile`, removal of `'generating'` from `PlannerStep`, `reshuffleSlot` dep array fix.
- `src/lib/utils/meal-plan-shuffle.ts`: `ShuffleConfig.defaultServingsPlanned`, slots with `servingsPlanned`/`variants`.
- `src/types/index.ts`: `MealPlanSetupConfig.defaultServingsPlanned?: number | null`.
- `src/app/(dashboard)/pianificatore/page.tsx`: `members` resolution (useFamilyProfile + normalizeFamilyProfile + label fallback) and removal of the `generating` block (:455-464) with the `EditorialLoader` import.
- Tests: `meal-plan-shuffle.test.ts` (default on new slots).

**Phase 3 — Variants UI**
- New `src/components/meal-planner/RecipePickerPanel.tsx` (extracted from RecipePickerSheet) and `src/components/meal-planner/MealSlotEditorSheet.tsx` (§4.5); deletion of `RecipePickerSheet.tsx`; wiring in `page.tsx`.
- `src/components/meal-planner/MealSlotCell.tsx`: variant chips (§4.6.3).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: passing variant/member data to the cells.

**Phase 4 — Page redesign (with the impeccable skill: direction first, review after)**
- `src/components/meal-planner/PlannerHeader.tsx`: single row + `Oggi` (§4.6.1).
- `src/components/meal-planner/MealPlanSetupForm.tsx`: progressive cards + people field + rules disclosure (§4.6.2).
- `src/components/meal-planner/PlanStructureCard.tsx`: collapsible variant with summary (§4.6.3).
- `src/app/(dashboard)/pianificatore/page.tsx`: empty state, "Come funziona?" disclosure, empty-grid StatusBanner, auto-scroll to today (in `WeeklyCalendarGrid`).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: per-member kcal detail (lg tooltip / mobile expansion).

**Phase 5 — Wrap-up**
- `npx next build --webpack`; full Jest suite; update CLAUDE.md (Recent Changes + "Critical Patterns" section if needed), AGENTS.md (any gotchas that emerged), `specs/00-roadmap.md` checklist; guided test proposal (§6.2).

---

## 6. Test plan

### 6.1 Unit tests (Jest — actual command: `npm test`, script `"test": "jest"` in package.json)

**`src/lib/utils/ingredient-aggregator.test.ts`** (extended; the existing `contribution()` helper stays for `aggregateIngredients`; `buildContributions` needs `makePlan`/`makeSlot`/`makeRecipe` fixtures modeled on meal-plan-calories.test.ts:5-49):
- legacy slot (`servingsPlanned` absent): quantities identical to the input, byte for byte (invariant §1);
- `servingsPlanned: 2`, `recipe.servings: 4`, "200 g" → "100 g";
- `recipe.servings` absent → fallback 4 (`servingsPlanned: 8`, "200 g" → "400 g");
- `q.b.` unchanged under scaling;
- variant: contributes with its own recipe scaled to `memberIds.length` people and its own `recipeTitle`;
- base at 0 people (variants ≥ servingsPlanned): no base contribution, variant contributions yes;
- variant recipe missing from `recipesById`: skip without throwing;
- `servingsPlanned === recipe.servings`: quantity string unchanged (no reformatting).

**`src/lib/utils/meal-plan-calories.test.ts`** (extended):
- plans without variants: `total` identical to the current expected values (existing tests are updated only in shape, not in numbers);
- day with a variant: `memberDeltas` with the correct total (variant in the covered slots, base elsewhere) and fallback label `Componente N`;
- orphan member (id not in `members`): absent from `memberDeltas`;
- variant without a kcal estimate: `isPartial` on the member, base not contaminated;
- `members: []`: `memberDeltas` always `[]`.

**`src/lib/utils/meal-plan-shuffle.test.ts`** (extended):
- `defaultServingsPlanned: 3` → every generated slot has `servingsPlanned: 3` and `variants: null`;
- config without the field → slots with `servingsPlanned: null` (compat).

### 6.2 Guided test (protocol in memory + "Guided testing tooling" section of CLAUDE.md)

`npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` + throwaway Playwright script in `e2e/scratch/` (gitignored, deleted at the end of the guided test). Data prepared by throwaway scripts with spy words (e.g. recipes "SPY-Carbonara" with `servings: 4` and known quantities "400 g spaghetti"). Phases (one per message, expected outcome declared first):
1. **Seed**: emulated user + family profile (3 members: "Marco" 40, "Sofia" 8, one without label) + 6 recipes with known servings/kcal + a **legacy** plan written directly to Firestore without the new fields.
2. **Legacy invariant**: open `/lista-spesa` for the legacy week → assert quantities identical to the seed (no scaling).
3. **New plan**: setup with people=3, shuffle → assert on Firestore `servingsPlanned: 3` on every slot; shopping list scaled 3/4 relative to the seed.
4. **Variants**: open the slot editor, add a Sofia variant → recipe B; assert `variants` on Firestore (id, memberIds, recipeId, title), shopping list with base at 2 people + recipe B contributions at 1 person; `S` chip visible in the cell.
5. **Kcal**: assert the `kcal/pers.` badge with the base value and member detail (tooltip/expansion) for Sofia.
6. **Re-roll and copy**: ↺ on the slot with a variant → base changed, variant intact; copy plan to another week → fields copied.
7. **Orphan**: remove Sofia from the profile → `Componente rimosso` chip, shopping list unchanged.

---

## 7. Gotchas and constraints (relevant, from AGENTS.md/CLAUDE.md)

- **Never `undefined` on Firestore** (AGENTS Quick Ref "Firebase optional"): `servingsPlanned`/`variants` → `null` or omitted key; watch out for the filter+push pattern of updateSlot/reshuffleSlot that rebuilds slot objects.
- **Orphan slots** (AGENTS "Orphan slots after removing a meal type"): `buildContributions` iterates all slots; every mutation that removes days/meals must delete the slots in the same write — variants live inside the slot, so they follow for free, but never introduce variants outside the slot.
- **Stale shopping list after a plan change** (AGENTS): every new mutation (`setSlotServings`, `setSlotVariants`) calls `invalidateShoppingList()`; partial key without `weekStartDate` to cover `copyPlanToWeek`.
- **Non-flushed debounce** (AGENTS "Shopping list debounce non-flushed" + "New persistence target forgotten in the flush"): the people stepper debounce in the sheet wants its own timer/ref **and** a flush on sheet close/unmount, reading from a ref (no stale closure). `useShoppingList`'s `flushAll` is not touched here (no new field persisted by that hook), but the principle is identical.
- **`enabled: !!user`** on every auth-bound query (already respected by `useFamilyProfile`); **no `onSnapshot`**.
- **`ConfirmDialog` for multi-slot destructive actions** (delete plan/day/meal — already existing); never `confirm()`/`alert()`; feedback via `react-hot-toast`.
- **Controls never `group-hover`-only below `lg`** (AGENTS "Action hidden in group-hover on touch"): variant chips always visible; any hover-reveal actions only from `lg` with the MealSlotCell.tsx:111 pattern; always an `aria-label`.
- **`max-lg:portrait:`** (never bare `portrait:`); grid with `minmax(72px+, 1fr)` + `overflow-x-auto`; **no `position: sticky` inside `.shell-stage`** on desktop ≥1440px (app-shell with internal `<main>` scroll) — the setup's sticky CTA bar must be verified on desktop.
- **Pages without their own outer padding**; planner `max-w-[1200px] mx-auto`, form sub-panels `max-w-lg mx-auto` (AGENTS §6 "Layout max-width").
- **Semantic tokens** (`bg-background`/`bg-card`/`text-foreground`/`border-border`), never `bg-white`; native elements (`select`, `input`) with explicit `bg-background text-foreground`; no nonexistent OKLCH scales (`bg-primary/10`, not `bg-primary-100`); **side-stripe ban**; collapse with `grid-rows-[0fr]→[1fr]` + `motion-reduce:transition-none`, never `max-h`.
- **`useState(prop)` doesn't react to changes** → sync `useEffect` for the stepper draft in the sheet (pattern already in ServingsStepper:47-49).
- **YYYY-MM-DD parsing**: always `new Date(dateStr + 'T00:00:00')` (already respected in page.tsx/PlannerHeader); `isToday` with local comparison.
- **Slot identity `${dayIndex}-${mealType}` intact**: no new key, no multiple slots per meal.
- **kcal**: `caloriesPerServing` always per serving, never totals (AGENTS "Total kcal instead of per serving"); the planner shows `≥` on partial values, never unmarked partial sums; kcal **excluded from the shopping list** (CLAUDE.md).
- **`familyProfile` staleTime 5 min**: `defaultServingsPlanned` may lag up to 5 min after a profile edit — accepted and documented (§4.1).
- No AI route touched: the JSON schema/Sonnet 5 parameter constraints don't apply to this spec.

---

## 8. Out of scope

- **Full per-member grid** (excluded by product decision 5) and variants with inline `newRecipe`/AI.
- Scaling of the **ad-hoc** "Voglio preparare questo" list (quantities copied as-is by design, types/index.ts:491-495) and any change to `aggregateIngredients`/`mergeQuantities`/canonical keys.
- Batch migration of existing plans (lazy dual-read).
- Per-member preferences/diets (the family profile stays label+age+notes).
- Persisting per-meal generation rules on the plan (they stay setup-only, §4.6.2). The people default is the one setup value that IS persisted (§4.1).
- A UI to change `MealPlan.defaultServingsPlanned` after the plan is created (people stay editable meal by meal).
- kcal in the shopping list; estimate `confidence`; macros if Spec C is not implemented (extension point only, §4.3.4).
- Changes to cooking mode, `estimate-calories`, AI prompts, Firestore rules/indexes (the new fields live in existing documents covered by the owner-based rules).
- Server-side enforcement of "one plan per week" (stays client-side as today).

---

## 9. Implementation prompt

```markdown
Implement Spec F of the "Il Mio Ricettario" project (family plan + planner redesign).

PREPARATION (mandatory, in order):
1. Read and apply CLAUDE.md, AGENTS.md, COMMENTS.md and DEVELOPMENT_GUIDELINES.md in the repo root.
2. Read IN FULL specs/00-roadmap.md (binding contracts 1, 4, 5) and specs/spec-f-piano-famiglia-redesign.md: the spec is your mandate, the roadmap prevails in case of conflict.
3. Check in the roadmap checklist that Spec A is completed (sortMealTypes, spuntino/merenda): it is a mandatory dependency. Check whether Spec C is completed: it decides the macro extension point (§4.3.4 of the spec).
4. Create the branch feature/family-meal-plan from develop.

IMPLEMENTATION:
- Proceed phase by phase following §5 of the spec (1: model+scaling+kcal behind legacy behavior; 2: hook mutations+shuffle+family; 3: variants UI; 4: page redesign; 5: wrap-up). After EVERY phase run `npx tsc --noEmit` and fix before moving on.
- The backward-compatibility invariant is sacred: slots with servingsPlanned == null → no scaling, quantities as-is. Write the tests that prove it BEFORE polishing the rest.
- For PHASE 4 (redesign) you MUST load the `impeccable` skill: use it first for the redesign direction (architecture in §4.6 of the spec as a base) and then for the final review of the screens. Respect DESIGN.md "Paper and Terracotta" ("Carta e Terracotta"; terracotta stamp ≤10%, no nested cards, semantic tokens).
- Never `undefined` to Firestore; every plan mutation calls invalidateShoppingList(); no onSnapshot; ConfirmDialog for multi-slot destructive actions.

VERIFICATION:
- Unit tests: `npm test` (actual script in package.json: "test": "jest"). Update/extend ingredient-aggregator.test.ts, meal-plan-calories.test.ts, meal-plan-shuffle.test.ts as per §6.1.
- Final build: `npx next build --webpack`. If it fails with `spawn EPERM` in the sandbox, rerun it outside the sandbox before investigating the code.

WRAP-UP:
- Update CLAUDE.md ("Recent Changes" section + critical patterns if any emerged), AGENTS.md (new gotchas ONLY if they cost real debugging) and check off Spec F in the checklist of specs/00-roadmap.md.
- NEVER commit without the user's explicit OK (session rule: one branch/commit per session).
- At the end propose a phase-by-phase guided test with Firebase emulators + Playwright (throwaway scripts in e2e/scratch/, spy words in the seed data, one phase per message with the expected outcome declared first), following §6.2 of the spec and the "Guided testing tooling" section of CLAUDE.md.
```

---

## 10. Recommended model and effort

**Fable (or Opus) · effort xhigh + impeccable skill for the redesign — data model with delicate back-compat and a full page redesign.** The legacy invariant on scaling and the multi-surface UI rework require the highest level of reasoning and a dedicated visual direction.
