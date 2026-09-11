# Spec A — Canonical meal ordering + snacks in the plan

> Notes covered: 4 (meal ordering), 7 (snacks) | Dependencies: none (Spec F consumes the canonical order defined here) | Branch: `feature/meal-order-snacks`

## 1. Goal

Two user-visible changes in the weekly planner:

1. **Canonical meal order.** Today the order of the calendar rows depends on insertion order: a plan created with «pranzo, cena» to which breakfast is added shows breakfast as the **last** row. After this spec meals always appear in the order of the day (colazione → spuntino → pranzo → merenda → cena), everywhere: calendar grid, structure chips, setup form. Plans already saved with the wrong order self-correct at render time, without a migration.
2. **Snacks.** Two new plannable meals: **Spuntino** (mid-morning) and **Merenda** (afternoon). Selectable at setup, addable/removable from an active plan via `PlanStructureCard`, fillable with the local shuffle, with per-meal category configuration like the others.

## 2. Current state

### 2.1 Types and constants

`src/types/index.ts:386`:

```ts
export type MealType = 'colazione' | 'pranzo' | 'cena' | 'primo' | 'secondo' | 'contorno' | 'dolce';
```

`primo`/`secondo`/`contorno`/`dolce` are legacy values from an old course-dish model: unreachable from the UI but present in historical Firestore plans, so they must keep rendering (comment in `src/lib/constants/meal-types.ts:20-25`).

`src/lib/constants/meal-types.ts:26`:

```ts
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'pranzo', 'cena'];
```

`src/lib/constants/meal-types.ts:34-42` — exhaustive `MEAL_LABELS: Record<MealType, string>` (7 keys: the 3 selectable + 4 legacy). The checklist comment at lines 10-12 says:

```
 * CHECKLIST: If you add a MealType value in types/index.ts, also update:
 * - MEAL_LABELS below (the Record is exhaustive, so TypeScript will flag it)
 * - SELECTABLE_MEAL_TYPES, but only if users are meant to plan it
```

`activeMealTypes: MealType[]` is persisted verbatim on the `meal_plans` document (`src/types/index.ts:435`) and on `MealPlanSetupConfig` (`src/types/index.ts:528`): the array order IS the render order.

### 2.2 The ordering bug (two writes without sort)

**Write 1** — `addMealType` in `src/lib/hooks/useMealPlanner.ts:438`:

```ts
const nextActiveMealTypes = [...currentPlan.activeMealTypes, mealType];
```

Pure append, no sort. Contrast with the twin path for days, `addDay` (`useMealPlanner.ts:413`), which does sort:

```ts
const nextActiveDays = [...currentActiveDays, dayIndex].sort((a, b) => a - b);
```

**Write 2** — `toggleMealType` in `src/components/meal-planner/MealPlanSetupForm.tsx:75-83`:

```ts
function toggleMealType(type: MealType) {
  setActiveMealTypes(prev => {
    if (prev.includes(type)) {
      setMealTypeConfigs(m => { const n = { ...m }; delete n[type]; return n; });
      return prev.filter(t => t !== type);
    }
    return [...prev, type];
  });
}
```

So at setup too: deselecting «pranzo» and reselecting it produces `['cena','pranzo']`, which is then persisted as-is by `generateShuffledPlan`/`createManualPlan` (`useMealPlanner.ts:145,153,164,228,239`).

### 2.3 Census of the places that iterate `activeMealTypes` (verified with grep)

Places that **render in array order** (all to be fixed on read):

| # | File:line | What it iterates |
|---|-----------|------------|
| a | `src/components/meal-planner/WeeklyCalendarGrid.tsx:135` | meal rows of the desktop grid (`{activeMealTypes.map(mealType => (`) |
| b | `src/components/meal-planner/WeeklyCalendarGrid.tsx:194` | meal rows inside the mobile portrait day cards |
| c | `src/components/meal-planner/PlanStructureCard.tsx:136` | active «Portate del piano» chips |
| d | `src/components/meal-planner/MealPlanSetupForm.tsx:205` | «Categorie per portata» card at setup |

Places that iterate `activeMealTypes` but are **order-insensitive** (no change):

- `src/lib/utils/meal-plan-shuffle.ts:46` — `buildShuffledSlots` loops over `config.activeMealTypes` only to generate slots; slots have no ordering semantics (identity = `(dayIndex, mealType)` pair).
- `src/lib/utils/ingredient-aggregator.ts` (`buildContributions`, around line 25) — iterates `plan.slots`, **not** `activeMealTypes`; the shopping list groups by ingredient and does not show the meal (`ShoppingSection.tsx:20-26` uses only `recipeTitle` + day).
- `src/lib/utils/meal-plan-calories.ts` (`computeDayCalories`) — sums over `plan.slots`, order irrelevant.
- `MealPlanSetupForm.tsx:44,56,181,189,197,299` — validations/lookups (`includes`, `length`), not ordered rendering.
- `PlanStructureCard.tsx:62,65` — `inactiveMealTypes` is derived by filtering `SELECTABLE_MEAL_TYPES`, so the «add» chips are **already** in canonical order and stay correct on their own when the constant is extended.
- `useMealPlanner.ts:205` (`copyPlanToWeek`), `:476,486,491` (`removeMealType`: `filter` preserves relative order, ok).

Places that use `Record<MealType, …>` / `Partial<Record<MealType, …>>` (verified with grep):

| File:line | Type | Impact |
|-----------|------|---------|
| `src/lib/constants/meal-types.ts:34` | `MEAL_LABELS: Record<MealType, string>` | **exhaustive** → TypeScript forces adding the two new keys (this is the intended safety mechanism) |
| `src/types/index.ts:534` | `courseCategoryMap?: Partial<Record<MealType, string>>` (`@deprecated`) | `Partial` → no change |
| `src/types/index.ts:537` | `newRecipePerMeal?: Partial<Record<MealType, number>>` | `Partial` → no change |
| `src/types/index.ts:545` and `src/lib/utils/meal-plan-shuffle.ts:23` | `mealTypeConfigs?: Partial<Record<MealType, MealTypeConfig>> \| null` | `Partial` → no change; the new meals get per-meal config for free |
| `src/components/meal-planner/MealPlanSetupForm.tsx:41` | `useState<Partial<Record<MealType, MealTypeConfig>>>({})` | `Partial` → no change |

Consumers of `MEAL_LABELS` for point lookups (they work on their own once the Record is extended): `pianificatore/page.tsx:221-222,234` (toast), `RecipePickerSheet.tsx:87` (sheet title), `NewRecipeReviewCard.tsx:70` (slot label), `WeeklyCalendarGrid.tsx:144,200`, `PlanStructureCard.tsx:146-165,188,231`, `MealPlanSetupForm.tsx:185,221`.

### 2.4 Grid label column width

- Desktop: label column **88px** — `WeeklyCalendarGrid.tsx:121` and `:139`, `gridTemplateColumns: \`88px repeat(${activeDays.length}, minmax(150px, 1fr))\``, label `text-xs font-medium` (`:143-145`).
- Mobile portrait: **72px** — `WeeklyCalendarGrid.tsx:199`, `className="text-xs text-muted-foreground w-[72px] shrink-0 pt-1"`.

«Colazione» (9 characters) is currently the longest label and fits in both columns at `text-xs`. «Spuntino» (8) and «Merenda» (7) are shorter → no layout change needed. Still verify by eye in the guided test (phase 6).

### 2.5 Shuffle and meals with no suitable recipes

`buildShuffledSlots` (`meal-plan-shuffle.ts:39-69`) builds a candidate pool for each meal via `buildCandidatePool` (`:126-144`). **The pool is not meal-specific**: it starts from all recipes, removes excluded categories, applies the season filter (relaxed below `MIN_SEASONAL_POOL = 5`) and, if set, narrows to the preferred category. So a «spuntino» without dedicated config is filled by drawing from the whole recipe book, like lunch and dinner. Only an **empty** pool (no recipes, or all excluded) ends up in `unfilledMealTypes` (`:49-52`), already handled with an informational toast in `pianificatore/page.tsx` (`onGenerate` handler, lines ~441-446: «Alcuni pasti sono rimasti vuoti: non avevi ricette adatte. Riempili a mano.»). Behavior unchanged and sufficient: whoever wants sensible snacks sets the per-meal preferred category at setup (e.g. «Dolci» or «Merende»), the mechanism already exists.

### 2.6 Firestore

No rule validates the values of `mealType`/`activeMealTypes` (`firebase/firestore.rules:62` only matches the `meal_plans` collection), no index involved. The new values are plain strings in existing fields: **zero migration**.

## 3. Product decisions (from the roadmap, binding)

From cross-spec contract no. 1 of `specs/00-roadmap.md`:

1. `MealType` is extended with **`'spuntino'`** and **`'merenda'`**. Labels: **«Spuntino»** (mid-morning) and **«Merenda»** (afternoon) — product decision no. 8 of the roadmap.
2. `SELECTABLE_MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']` — it is also **the canonical order** of the day.
3. New helper exported from `src/lib/constants/meal-types.ts`: `sortMealTypes(types: MealType[]): MealType[]` — sorts by index in `SELECTABLE_MEAL_TYPES`; legacy types (`primo`, `secondo`, `contorno`, `dolce`) go **at the end in stable order**.
4. `sortMealTypes` is applied **both on write** (`addMealType` in useMealPlanner, `toggleMealType` in MealPlanSetupForm) **and on read** (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm), so existing plans with the wrong order self-correct without a migration.
5. Spec F will consume this canonical order: do not introduce here any concept of people/servings/variants (out of scope, section 8).

## 4. Proposed design

### 4.1 Data model

**`src/types/index.ts:386` — before:**

```ts
export type MealType = 'colazione' | 'pranzo' | 'cena' | 'primo' | 'secondo' | 'contorno' | 'dolce';
```

**After** (also update the JSDoc comment at lines 379-385 mentioning spuntino/merenda):

```ts
export type MealType =
  | 'colazione'
  | 'spuntino'   // mid-morning
  | 'pranzo'
  | 'merenda'    // afternoon
  | 'cena'
  | 'primo' | 'secondo' | 'contorno' | 'dolce'; // legacy course types, render-only for historical plans
```

No other type changes: `MealSlot`, `MealPlan`, `MealPlanSetupConfig`, `MealTypeConfig`, `ShuffleConfig` stay identical (the `Partial<Record<MealType, …>>` absorb the new values without changes).

### 4.2 Constants and helper — `src/lib/constants/meal-types.ts`

**Before** (lines 26 and 34-42):

```ts
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'pranzo', 'cena'];

export const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};
```

**After:**

```ts
/**
 * Meal types a user can actually put in a plan, in day order.
 * THIS ARRAY IS ALSO THE CANONICAL ORDER of meals in the day:
 * sortMealTypes() sorts by index in this array. Do not reorder it
 * without a product decision.
 * (…keep the existing WHY A SUBSET block about legacy types…)
 */
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];

export const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  pranzo: 'Pranzo',
  merenda: 'Merenda',
  cena: 'Cena',
  primo: 'Primo',
  secondo: 'Secondo',
  contorno: 'Contorno',
  dolce: 'Dolce',
};

/**
 * Sorts meals in the canonical order of the day (the index in
 * SELECTABLE_MEAL_TYPES). Legacy types (primo/secondo/contorno/dolce),
 * absent from SELECTABLE_MEAL_TYPES, go at the end keeping their
 * relative order (Array.prototype.sort is stable per ES2019+ spec).
 *
 * ALWAYS returns a new array: typical inputs are React state or
 * fields of the current plan, which must never be mutated in place.
 *
 * Used on write (addMealType, toggleMealType) AND on read
 * (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm): reading
 * self-corrects Firestore plans saved before the fix, without a migration.
 */
export function sortMealTypes(types: MealType[]): MealType[] {
  return [...types].sort((a, b) => {
    const ia = SELECTABLE_MEAL_TYPES.indexOf(a);
    const ib = SELECTABLE_MEAL_TYPES.indexOf(b);
    if (ia === -1 && ib === -1) return 0; // both legacy: stable order
    if (ia === -1) return 1;              // only a legacy: at the end
    if (ib === -1) return -1;             // only b legacy: at the end
    return ia - ib;
  });
}
```

Update the checklist at the top of the file (current lines 10-12): it stays valid, add a third bullet:

```
 * - sortMealTypes needs NO update: it derives its order from SELECTABLE_MEAL_TYPES
```

### 4.3 Writes — applying `sortMealTypes`

**(a) `src/lib/hooks/useMealPlanner.ts:438` — before:**

```ts
const nextActiveMealTypes = [...currentPlan.activeMealTypes, mealType];
```

**After:**

```ts
const nextActiveMealTypes = sortMealTypes([...currentPlan.activeMealTypes, mealType]);
```

Import to add at the top of the file: `import { sortMealTypes } from '@/lib/constants/meal-types';`. Note: the subsequent Firestore write (`updateMealPlan`, `:457-460`) and the optimistic update (`setCurrentPlan`, `:451-455`) already use `nextActiveMealTypes`, so no other touch-ups are needed. Update the JSDoc comment of `addMealType` (lines 419-429) mentioning that the order is canonical as for `addDay`.

**(b) `src/components/meal-planner/MealPlanSetupForm.tsx:81` — before:**

```ts
return [...prev, type];
```

**After:**

```ts
return sortMealTypes([...prev, type]);
```

(`sortMealTypes` is added to the existing import on line 13: `import { MEAL_LABELS, SELECTABLE_MEAL_TYPES, sortMealTypes } from '@/lib/constants/meal-types';`). The default `useState<MealType[]>(['pranzo', 'cena'])` (`:39`) is already in canonical order and **stays unchanged**: snacks are not pre-selected.

**(c) Opportunistic normalization in `copyPlanToWeek` (`useMealPlanner.ts:205`)** — today it copies `activeMealTypes: currentPlan.activeMealTypes` verbatim; change it to `activeMealTypes: sortMealTypes(currentPlan.activeMealTypes)`, so copying a disordered legacy plan produces a new document that is already canonical. Optional for the contract, but zero-cost: do it.

No need to touch `generateShuffledPlan`/`createManualPlan`: they receive `config.activeMealTypes` from the form, which after (b) is always sorted at the source.

### 4.4 Reads — self-correction of existing plans

**(a) `src/components/meal-planner/WeeklyCalendarGrid.tsx`** — next to the destructuring on line 48 (`const { activeMealTypes, slots } = plan;`) add:

```ts
const orderedMealTypes = useMemo(() => sortMealTypes(activeMealTypes), [activeMealTypes]);
```

and use `orderedMealTypes.map(...)` instead of `activeMealTypes.map(...)` **both** on line 135 (desktop grid) **and** on line 194 (mobile day card). `useMemo` is already imported/used in the file (`:56-59` for `computeWeekCalories`). Import `sortMealTypes` from the existing `MEAL_LABELS` import (`:5`).

**(b) `src/components/meal-planner/PlanStructureCard.tsx:136`** — `{sortMealTypes(activeMealTypes).map((mealType) => (`. Lightweight component (max 9 elements), no memo needed. The inactive chips (`:62`, `inactiveMealTypes`) derive from `SELECTABLE_MEAL_TYPES.filter(...)`: already canonical, no change.

**(c) `src/components/meal-planner/MealPlanSetupForm.tsx:205`** — `{sortMealTypes(activeMealTypes).map(type => {`. With the write (4.3b) already sorted it is redundant in the same component, but it is required by the contract and protects against future state-setting paths. The checkboxes on line 177 iterate `SELECTABLE_MEAL_TYPES`: already canonical, no change.

### 4.5 UI/UX of the new meals

There is no new UI to build: the two meals enter the existing flows automatically thanks to `SELECTABLE_MEAL_TYPES` and `MEAL_LABELS`.

- **Setup** (`MealPlanSetupForm.tsx:177-186`): two extra checkboxes appear, in canonical order («Colazione, Spuntino, Pranzo, Merenda, Cena»). Not pre-selected. If selected and there are categories, the corresponding «Categorie per portata» card appears (`:197-293`) with preferred/excluded selects — for free via `Partial<Record<…>>`.
- **PlanStructureCard**: the dashed «add» chips show Spuntino/Merenda (via `inactiveMealTypes`, `:62`); the «Lascia vuota / Riempi con shuffle» Dialog (`:179-222`) and the removal ConfirmDialog (`:224-242`) work unchanged, with dynamic copy from `MEAL_LABELS` («Aggiungi spuntino al piano», «Rimuovere merenda dal piano?»). The `inactiveMealTypes.length === 0` message («Il piano copre già tutte le portate», `:170-174`) now triggers at 5 meals instead of 3 — correct as is.
- **Grid**: new rows with «Spuntino»/«Merenda» labels in the existing label columns (88px desktop / 72px mobile, see 2.4 — both shorter than «Colazione», no overflow). Responsive layout unchanged: the file already uses the `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block` pattern (`:117`) and the mobile counterpart (`:172`); no classes to touch. No hardcoded color to introduce: all labels use semantic tokens already present (`text-muted-foreground`, etc.).
- **Toast** (`pianificatore/page.tsx:221-234`): «Ho aggiunto spuntino e riempito gli slot», «Ho rimosso merenda dal piano» — dynamic from `MEAL_LABELS[…].toLowerCase()`, zero changes.
- **RecipePickerSheet** (`:87`) and **NewRecipeReviewCard** (`:70`): titles like «Mar — Spuntino» automatically.

### 4.6 Edge cases and errors

1. **Legacy plan with the wrong order in Firestore** (e.g. `['pranzo','cena','colazione']`): the document **is not rewritten** on load; reads (4.4) sort at render time. At the first mutation that goes through `addMealType` or `copyPlanToWeek` the persisted array becomes canonical. `removeMealType` (`useMealPlanner.ts:476`) uses `filter`, which preserves the existing order: acceptable (the read corrects it anyway); don't touch it, to minimize the diff.
2. **Legacy plan with course types** (`primo`/`secondo`/…): `sortMealTypes` puts them at the end in the relative order they were saved in (stable sort). They keep rendering via `MEAL_LABELS` and stay removable from `PlanStructureCard`; they are never offered among the «add» chips (derived from `SELECTABLE_MEAL_TYPES`).
3. **Legacy + snacks mix**: a historical plan with `['pranzo','primo','cena']` to which `spuntino` is added produces `['spuntino','pranzo','cena','primo']` → render: Spuntino, Pranzo, Cena, Primo. Consistent with the «legacy at the end» rule.
4. **Shuffle on spuntino/merenda without suitable recipes**: if the recipe book is empty or all recipes are excluded by the meal's config, the meal ends up in `unfilledMealTypes` and the UI shows the existing toast (2.5). If instead the recipe book has any recipes, the shuffle fills the snack by drawing from the whole recipe book (non meal-specific pool, 2.5): known and accepted behavior; the mitigation is the per-meal preferred category. **Documenting this in a comment** above `buildCandidatePool` is optional; don't change the logic.
5. **Orphan slots**: `removeMealType` already deletes the meal's slots too (mandatory: `buildContributions` iterates all slots without filtering on `activeMealTypes`, comment `useMealPlanner.ts:467-471`). The new meals change nothing: same slot identity `(dayIndex, mealType)`, same paths.
6. **UI keys `${dayIndex}-${mealType}`** (`WeeklyCalendarGrid.tsx:151,196`, `page.tsx` `slotKey`, `useMealPlanner.ts:317`): `spuntino`/`merenda` are strings without a hyphen, no collision possible.
7. **`sortMealTypes([])`** → `[]` (no crash); input never mutated (defensive copy) — important because the arguments are React state (`prev` in `toggleMealType`) or fields of `currentPlan`.
8. **Existing tests**: `meal-plan-calories.test.ts:38` and `meal-plan-shuffle.test.ts` use `activeMealTypes: ['pranzo', 'cena']` / `['pranzo']` — already canonical, no existing test breaks. Verify anyway with the full suite.

## 5. Phased implementation plan

Each phase leaves the project compilable (`npx tsc --noEmit` green).

**Phase 1 — Types and constants.**
- `src/types/index.ts`: extend `MealType` (4.1) + JSDoc.
- `src/lib/constants/meal-types.ts`: extend `SELECTABLE_MEAL_TYPES` and `MEAL_LABELS`, add `sortMealTypes`, update the comments/checklist (4.2). If `MEAL_LABELS` doesn't compile, that is the expected signal: add the two keys.
- Compiles on its own: no consumer requires the new values, the extended Record satisfies the type.

**Phase 2 — Writes.**
- `src/lib/hooks/useMealPlanner.ts`: `sortMealTypes` in `addMealType` (`:438`) and `copyPlanToWeek` (`:205`) + import + JSDoc.
- `src/components/meal-planner/MealPlanSetupForm.tsx`: `sortMealTypes` in `toggleMealType` (`:81`) + import.

**Phase 3 — Reads.**
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: memoized `orderedMealTypes`, used at `:135` and `:194`.
- `src/components/meal-planner/PlanStructureCard.tsx`: sort at `:136`.
- `src/components/meal-planner/MealPlanSetupForm.tsx`: sort at `:205`.

**Phase 4 — Unit tests.**
- New `src/lib/constants/meal-types.test.ts` (see section 6).

**Phase 5 — Final verification.**
- `npx tsc --noEmit`, `npm test`, `npx next build --webpack`.

**Phase 6 — Guided test** (section 6.2), then docs update (CLAUDE.md Recent Changes, `specs/00-roadmap.md` checklist, AGENTS.md only if new gotchas emerge).

## 6. Test plan

### 6.1 Unit tests (Jest, `npm test`)

New file `src/lib/constants/meal-types.test.ts`, colocated style like `src/lib/utils/meal-plan-shuffle.test.ts`:

```ts
import { sortMealTypes, SELECTABLE_MEAL_TYPES, MEAL_LABELS } from '@/lib/constants/meal-types';
import { MealType } from '@/types';

describe('sortMealTypes', () => {
  it('ordina le portate nell\'ordine canonico della giornata', () => {
    expect(sortMealTypes(['cena', 'colazione', 'pranzo'])).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('inserisce spuntino e merenda nella posizione canonica', () => {
    expect(sortMealTypes(['cena', 'merenda', 'pranzo', 'spuntino', 'colazione']))
      .toEqual(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);
  });

  it('riproduce il caso del bug: colazione appesa in coda da addMealType', () => {
    expect(sortMealTypes(['pranzo', 'cena', 'colazione'])).toEqual(['colazione', 'pranzo', 'cena']);
  });

  it('mette i tipi legacy in coda mantenendo il loro ordine relativo (sort stabile)', () => {
    expect(sortMealTypes(['dolce', 'cena', 'primo', 'colazione', 'contorno']))
      .toEqual(['colazione', 'cena', 'dolce', 'primo', 'contorno']);
  });

  it('gestisce array vuoto e singolo elemento', () => {
    expect(sortMealTypes([])).toEqual([]);
    expect(sortMealTypes(['merenda'])).toEqual(['merenda']);
  });

  it('non muta l\'array di input', () => {
    const input: MealType[] = ['cena', 'colazione'];
    sortMealTypes(input);
    expect(input).toEqual(['cena', 'colazione']);
  });

  it('è idempotente su input già ordinato', () => {
    const sorted = sortMealTypes(['spuntino', 'cena', 'primo']);
    expect(sortMealTypes(sorted)).toEqual(sorted);
  });
});

describe('costanti portate', () => {
  it('SELECTABLE_MEAL_TYPES è l\'ordine canonico con spuntini', () => {
    expect(SELECTABLE_MEAL_TYPES).toEqual(['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']);
  });

  it('MEAL_LABELS copre le nuove portate', () => {
    expect(MEAL_LABELS.spuntino).toBe('Spuntino');
    expect(MEAL_LABELS.merenda).toBe('Merenda');
  });
});
```

Rerun the whole suite (`npm test`): the existing shuffle/calories tests already use canonical arrays and must not change.

### 6.2 Guided test (Playwright + Firebase emulators)

Per the «Guided testing tooling» section of CLAUDE.md: `npm run emulators` in one terminal, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in another, throwaway script in `e2e/scratch/` (gitignored, to be deleted at the end of the guided test), assertions on Firestore/HTTP state rather than on appearance.

Proposed phases (one per message, expected outcome declared first):

1. **Seed**: throwaway script that creates an emulated user + ~8 recipes with spy words (e.g. titles `SPIA-torta-…`) + a **deliberately disordered** `meal_plans` plan: `activeMealTypes: ['pranzo','cena','colazione','dolce']` with consistent slots.
2. **Read-time self-correction**: open the planner → expected: grid rows in the order Colazione, Pranzo, Cena, Dolce (legacy at the end) both on desktop (viewport ≥1440px) and mobile portrait; `PlanStructureCard` chips in the same order; **Firestore document unchanged** (assert via Admin SDK: array still `['pranzo','cena','colazione','dolce']`).
3. **Canonical write**: from `PlanStructureCard` add «Spuntino» with «Riempi con shuffle» → expected: toast «Ho aggiunto spuntino e riempito gli slot»; Firestore assert: `activeMealTypes === ['colazione','spuntino','pranzo','cena','dolce']` and `mealType==='spuntino'` slots present for every active day with `existingRecipeId` set.
4. **Setup with snacks**: new plan on a different week selecting all 5 meals, deselecting/reselecting «Pranzo» before generating → expected: persisted `activeMealTypes` `['colazione','spuntino','pranzo','merenda','cena']` (the toggle bug doesn't recur).
5. **Removal**: remove «Merenda» via ConfirmDialog → expected: meal and its slots gone from the document (no orphan slots: assert `slots.every(s => s.mealType !== 'merenda')`), shopping list recomputed without the merenda's spy ingredients.
6. **Visual**: desktop and mobile portrait screenshots of the 5-meal grid — the «Spuntino»/«Merenda» labels don't overflow the 88px/72px columns.
7. **Cleanup**: delete `e2e/scratch/`, record the guided test in the list in CLAUDE.md («Guided tests run with this tooling»).

## 7. Relevant gotchas and constraints

- **Never `undefined` on Firestore** (AGENTS.md §2): here only existing arrays (`activeMealTypes`, `slots`) that are always set are rewritten — no new field, no risk, but don't introduce wrong conditional spreads in `updateMealPlan`.
- **Orphan slots forbidden** (comment `useMealPlanner.ts:467-471`): `buildContributions` iterates all `plan.slots` without filtering on `activeMealTypes`; every mutation that removes a meal must remove its slots **in the same write**. This spec doesn't touch `removeMealType`, but the guided test (phase 5) verifies it for the new meals too.
- **`invalidateShoppingList()`** on every plan mutation (partial key `['shoppingList', uid]`, `useMealPlanner.ts:89-92`): `addMealType` already calls it (`:461`); don't remove it when rewriting the function.
- **`MEAL_LABELS` is an exhaustive `Record<MealType, string>` on purpose** (`meal-types.ts:10-12`): the TS error after extending the type is the guard mechanism, not a problem to work around with `Partial`.
- **Short labels**: grid label column 88px desktop (`WeeklyCalendarGrid.tsx:121,139`) / 72px mobile (`:199`) — a constraint also cited in the `MEAL_LABELS` comment (`meal-types.ts:31-33`). «Spuntino» and «Merenda» fit; don't use longer labels (no «Spuntino mattutino»).
- **ConfirmDialog for destructive actions** (CLAUDE.md «Confirmations and touch»): meal removal already goes through `ConfirmDialog` (`PlanStructureCard.tsx:224-242`); don't introduce native `confirm()`.
- **`max-lg:portrait:` responsive pattern** (CLAUDE.md «Navigation»): the grid already uses `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block` (`WeeklyCalendarGrid.tsx:117`) and the mobile counterpart (`:172`): don't alter these classes.
- **Semantic tokens** (CLAUDE.md «Theming»): no new color; labels stay `text-muted-foreground` etc. Never `bg-white dark:bg-black`.
- **No `onSnapshot` / no new queries** (AGENTS.md §3): the spec adds no Firestore reads.
- **Stable sort**: `Array.prototype.sort` is stable since ES2019 (guaranteed on Node ≥ 12 and on all target browsers) — the «legacy at the end in stable order» requirement relies on this; the dedicated test locks it in.
- **Immutable React state**: `sortMealTypes` always returns a copy; never `types.sort(...)` in place on `prev` or on `currentPlan.activeMealTypes`.
- No new persistence target → the «own debounce + registration in flushAll» gotcha (AGENTS.md, shopping list) does **not** apply: the existing immediate writes of `updateMealPlan` are reused here.

## 8. Out of scope

- **People/servings per slot, per-member variants, familyProfile in the planner** → Spec F.
- **Macros/kcal for the new meals**: `computeDayCalories` already counts 1 serving per filled slot, snacks included, automatically; no dedicated calorie logic → extensions in Spec C/F.
- **Firestore migration of existing plans**: excluded by design (read-time self-correction).
- **Meal-specific shuffle pool** (e.g. «for spuntino draw only from sweet categories»): `buildCandidatePool` doesn't change; the existing per-meal config is the mitigation.
- **Making legacy types selectable** or removing them from the type: they stay as they were.
- **Planner UI redesign** → Spec F.
- **Shopping list and statistics**: no change (order-insensitive, see 2.3).

## 9. Implementation prompt

```markdown
Implement Spec A of the "Il Mio Ricettario" project.

1. Read and apply the conventions of: CLAUDE.md, AGENTS.md, COMMENTS.md and
   DEVELOPMENT_GUIDELINES.md (repo root).
2. Read IN FULL specs/00-roadmap.md (binding shared contract) and
   specs/spec-a-portate-ordinamento-spuntini.md (the spec to implement).
   In case of conflict: roadmap > spec > existing code.
3. Create the branch feature/meal-order-snacks from develop.
4. Implement phase by phase (section 5 of the spec). After EACH phase run
   `npx tsc --noEmit` and don't move to the next phase until it is green.
5. At the end of the work run `npx next build --webpack` (if it fails with
   spawn EPERM, rerun the command outside the sandbox).
6. Run the tests with the real package.json command: `npm test`
   (script "test": "jest"). Add the new file
   src/lib/constants/meal-types.test.ts as per section 6.1.
7. Update: CLAUDE.md ("Recent Changes" section, new dated entry),
   AGENTS.md (only if NEW gotchas emerged during implementation)
   and the status checklist in specs/00-roadmap.md (tick Spec A).
8. NEVER commit without the user's explicit OK (session rule:
   one branch/commit per session, commit only after approval).
9. When done, propose to the user a phase-by-phase guided test as per
   section 6.2 of the spec (Firebase emulators + Playwright, throwaway
   script in e2e/scratch/, expected outcome declared before each phase).
```

## 10. Recommended model and effort

"Sonnet (claude-sonnet-5) · effort medium — well-bounded mechanical changes to types, constants and iteration points; the spec removes all ambiguity."

Rationale: no open decision is left to the implementer — every change point is cited with file:line and before/after text, and the type checker drives the exhaustive extensions.
