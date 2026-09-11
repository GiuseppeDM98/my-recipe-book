# Spec C — Complete nutrition: serving weight, kcal/100g, macronutrients

> Notes covered: 2 (kcal/100g, serving weight), 5 (macronutrients) | Dependencies: none (consumed by Spec F for macros in the planner) | Branch: `feature/nutrition-macros`

## 1. Goal

Today the app only estimates and shows kcal per serving. With this spec every recipe can also
have the **estimated weight of one serving** (grams) and the **macronutrients per serving**
(protein, carbohydrates, fat in grams). From these the **kcal/100g** density is derived on
screen. The user obtains them in three ways: (1) the AI estimate, which goes through the single
extended `/api/estimate-calories` endpoint — the same single call as today, no extra call
even in the AI assistant's 2N-parallel enrichment; (2) the button on the recipe detail page,
which becomes "Stima valori nutrizionali" and can fill in the missing fields even when kcal
are already present; (3) the manual fields in the form. Display covers the recipe detail
(nutrition row), extraction preview (chips), form (fields) and planner (daily macro totals
next to kcal). The recipe card stays as it is (kcal only).

## 2. Current state

Verified against the code at commit `c99e86e` (branch `develop`).

### Data model

- `Recipe.caloriesPerServing?: number` — `src/types/index.ts:227`, with a doc comment (220-226)
  that fixes the per-serving invariant ("Per serving rather than per recipe because
  `servings` is editable in the form and is already scaled at runtime by cooking mode").
- `ParsedRecipe` exists in **two** structurally compatible declarations:
  - `src/types/index.ts:353-365` (canonical: used by `MealSlot.newRecipe`,
    `meal-plan-calories.ts`, `ingredient-aggregator.ts`), with `caloriesPerServing?: number`
    at line 361;
  - `src/lib/utils/recipe-parser.ts:6-17` (parser variant: used by `/assistente-ai` and
    `ExtractedRecipePreview`), with `caloriesPerServing?: number` at line 15. It has no
    `description`.

### Route `/api/estimate-calories` (`src/app/api/estimate-calories/route.ts`)

- Plausibility bounds: `MIN_PLAUSIBLE_KCAL = 20` (line 25), `MAX_PLAUSIBLE_KCAL = 3000`
  (line 28).
- Prompt built by `createCalorieEstimationPrompt` (lines 42-74), quoted verbatim in §4.b.
- Schema `CALORIE_ESTIMATION_SCHEMA` (lines 82-97), quoted verbatim in §4.b. No
  `minimum`/`maximum` (they would return 400).
- Servings guard (lines 136-142): `Number(servings)` finite and `>= 1`, otherwise 400
  `'Numero di porzioni non valido: serve almeno 1 porzione'`.
- Anthropic call (lines 146-162): `model: AI_MODEL`, `max_tokens: 900`,
  `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low', format: { type:
  'json_schema', schema } }`.
- Final clamp (lines 175-185): values outside 20-3000 → `caloriesPerServing: null` (never
  an error); response `{ success: true, caloriesPerServing, confidence }`.

### Client

- `getAICalorieEstimateForRecipe(recipeTitle, ingredients, servings)` —
  `src/lib/utils/recipe-parser.ts:579-618`: skips the call if `!servings || servings < 1`
  (lines 586-588), returns `Promise<number | null>`, discards `confidence` (line 613:
  `typeof data.caloriesPerServing === 'number' ? data.caloriesPerServing : null`).
- `useEstimateCalories` — `src/lib/hooks/useEstimateCalories.ts:23-62`: mutation that on a
  number writes `updateRecipe(recipe.id, { caloriesPerServing })` (line 41) and invalidates
  `['recipe', id, uid]` + `recipesQueryKey(uid)` (lines 54-55); on `null` it shows the info toast
  "Ingredienti troppo vaghi per una stima affidabile…" (line 48) and writes nothing.
- AI assistant enrichment — `src/app/(dashboard)/assistente-ai/page.tsx:157-176`
  (`enrichRecipesWithAI`): for each recipe `Promise.all([getAISuggestionForRecipe,
  getAICalorieEstimateForRecipe])` (lines 160-167), conditional spread
  `...(caloriesPerServing !== null ? { caloriesPerServing } : {})` (line 172). Used by PDF,
  free text (via `processExtractedMarkdown`, line 178) and chat (via
  `handleChatRecipesExtracted`, line 206).

### The three write sites of `caloriesPerServing`

1. `handleSaveRecipe` — `assistente-ai/page.tsx:358-423`, spread in create (line 396):
   ```ts
   // Omit the key entirely when the estimate is missing — Firestore rejects undefined.
   ...(recipe.caloriesPerServing ? { caloriesPerServing: recipe.caloriesPerServing } : {}),
   ```
2. `saveNewRecipeToCookbook` — `src/lib/hooks/useMealPlanner.ts:509-571`, identical spread
   at line 545.
3. `RecipeForm` — `src/components/recipe/recipe-form.tsx`: **string** state (lines 72-74,
   "Held as a string, not a number, so 'empty' stays distinguishable from 0"); parse on
   submit (lines 425-430: `caloriesPerServing.trim() !== '' && Number.isFinite(...) &&
   caloriesInput > 0 ? Math.round(...) : null`); spread in create (line 450); in edit
   `...(parsedCalories === null ? { caloriesPerServing: deleteField() } : {})` (line 466)
   because `updateDoc` merges; UI input lines 555-565, label "kcal / porz.".

### Display

- Detail — `src/components/recipe/recipe-detail.tsx:79-135`: flex-wrap meta row with
  large `text-2xl font-bold tabular-nums` slots (servings/prep/cooking/total/kcal). The kcal
  slot is **truthy-gated** (line 106: `recipe.caloriesPerServing ? (...)`) and when absent shows
  the ghost button "Stima calorie" (lines 112-133, `Flame` + spinner, visible only with
  `hasIngredients && user`).
- Card — `src/components/recipe/recipe-card.tsx:126-131`: "{n} kcal" with `Flame`, truthy-gated,
  no button (the card is a `<Link>`, lines 107-109).
- Preview — `src/components/recipe/extracted-recipe-preview.tsx:135-142`: chip
  "{n} kcal / porz." with `Flame`, truthy-gated (line 137).
- Planner — `src/lib/utils/meal-plan-calories.ts`: `DayCalories` (lines 18-27, fields
  `total/countedSlots/uncountedSlots/isPartial`), `readSlotCalories` (37-48, saved recipe
  by id then inline `newRecipe`), `computeDayCalories` (62-92), `computeWeekCalories`
  (100-112, `activeDays` only). Consumed only by
  `src/components/meal-planner/WeeklyCalendarGrid.tsx`: memo at lines 56-59,
  `renderDayCalories` (72-88: hides when `total === 0`, `≥` prefix if `isPartial`,
  `title` tooltip), rendered in the desktop header (line 129, column
  `minmax(150px, 1fr)`, line 121) and in the mobile day header (line 189, `ml-auto`).
- Existing tests: `src/lib/utils/meal-plan-calories.test.ts` (8 tests: 6 on
  `computeDayCalories`, 2 on `computeWeekCalories`).

## 3. Product decisions (from the roadmap, binding)

From cross-spec contract 4 in `specs/00-roadmap.md` and user decision 7:

- `Recipe` and **both** `ParsedRecipe`s gain `servingWeightGrams?: number` and
  `macrosPerServing?: { proteinGrams: number; carbsGrams: number; fatGrams: number }`.
- **Only the per-serving values** are persisted: kcal/100g and every other derived value is computed at
  render time (`caloriesPerServing / servingWeightGrams * 100`). No derived field is saved.
- `/api/estimate-calories` is extended within the **same single AI call**: the model estimates
  total weight + total macros, the **server** divides by servings, applies MIN/MAX_PLAUSIBLE_KCAL-style
  clamps and the sanity check `4·prot + 4·carb + 9·fat ≈ kcal`.
- Numeric constraints in the prompt + server clamp, **never** in the JSON schema (`minimum`/`maximum`
  → 400).
- Display coverage: recipe detail (nutrition row: kcal/serving, ≈ serving weight,
  kcal/100g, P/C/F), form (manual fields), planner (daily kcal + macro totals).
- kcal and macros do **not** go into the shopping list (a choice already documented in CLAUDE.md).
- No migration: existing recipes simply don't have the new fields.

## 4. Proposed design

### 4.a Data model

New exported type in `src/types/index.ts` (above `Recipe`):

```ts
/**
 * Estimated macronutrients for ONE serving, in grams.
 *
 * Always the complete trio: a partial estimate (protein only, etc.) cannot be expressed
 * or persisted — either all three or the field is absent. 0 is a legitimate value
 * (e.g. 0 g of fat): display gates must use `!= null`, never truthiness.
 */
export interface MacrosPerServing {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}
```

`Recipe` (`src/types/index.ts`, right after `caloriesPerServing` line 227) — before:

```ts
  caloriesPerServing?: number;

  notes?: string;
```

after:

```ts
  caloriesPerServing?: number;

  /**
   * Estimated weight of ONE serving of the FINISHED recipe, in grams (AI or manual).
   * Per serving for the same reason as caloriesPerServing. kcal/100g is derived
   * at render time: never persist derived values.
   */
  servingWeightGrams?: number;

  /** Estimated macronutrients for ONE serving (see MacrosPerServing). */
  macrosPerServing?: MacrosPerServing;

  notes?: string;
```

The same two optional properties (same abbreviated comments) must be added to **both**
`ParsedRecipe`s, after `caloriesPerServing`:
- `src/types/index.ts:361`;
- `src/lib/utils/recipe-parser.ts:15` (here `MacrosPerServing` must be added to the import from
  `@/types` at line 2).

No new Firestore collection, rule or index: the fields live on the existing `recipes`
documents (and inside `meal_plans.slots[].newRecipe` for legacy plans, where they simply
won't be present).

### 4.b Route `/api/estimate-calories`

Request **unchanged**: `{ recipeTitle: string, ingredients: {name, quantity}[],
servings: number }`. Extended response:

```ts
{
  success: true,
  caloriesPerServing: number | null,
  servingWeightGrams: number | null,          // per serving, derived by the server
  macrosPerServing: MacrosPerServing | null,  // per serving, derived by the server
  confidence: 'alta' | 'media' | 'bassa',
}
```

**Current prompt verbatim** (`route.ts:51-73`, template literal; `ingredientList` =
`ingredients.map(i => \`- ${i.quantity} ${i.name}\`.trim()).join('\n')`):

```
Stima le calorie di questa ricetta italiana.

**Ricetta:** ${recipeTitle}
**Porzioni:** ${servings}

**Ingredienti:**
${ingredientList}

**Come procedere:**
1. Calcola le kcal totali sommando il contributo di ogni ingrediente con una quantità numerica utilizzabile.
2. Dividi il totale per il numero di porzioni (${servings}).
3. Arrotonda il risultato alla decina più vicina.

**Regole:**
- Ignora gli ingredienti senza quantità numerica (es. "sale q.b.", "prezzemolo a piacere"), TRANNE olio, burro e altri grassi da condimento: quelli incidono troppo, stimane una quantità ragionevole per il tipo di piatto.
- Considera solo ciò che finisce nel piatto: l'olio di frittura assorbito è una frazione di quello nella pentola, l'acqua di cottura della pasta non conta.
- Usa valori nutrizionali medi per gli ingredienti italiani comuni.
- Se gli ingredienti sono troppo vaghi o privi di quantità per una stima sensata, restituisci null.

**Confidenza:**
- "alta": quasi tutti gli ingredienti hanno quantità precise
- "media": alcune quantità stimate o approssimate
- "bassa": molte quantità mancanti o ambigue
```

**Proposed prompt** (the function is renamed `createNutritionEstimationPrompt`; for kcal the
"total then divide" staging stays with the model as it is today; for weight and macros the model produces
**totals** and the server does the division — total-first here too, but with one extra degree of
protection against the typical "skipped division" error):

```
Stima i valori nutrizionali di questa ricetta italiana.

**Ricetta:** ${recipeTitle}
**Porzioni:** ${servings}

**Ingredienti:**
${ingredientList}

**Come procedere:**
1. Calcola le kcal totali sommando il contributo di ogni ingrediente con una quantità numerica utilizzabile.
2. Dividi il totale per il numero di porzioni (${servings}) e arrotonda alla decina più vicina: questo è caloriesPerServing.
3. Calcola i grammi TOTALI di proteine, carboidrati e grassi dell'intera ricetta, arrotondati all'intero: questi sono totalMacros. NON dividerli per le porzioni: la divisione la fa il server.
4. Stima il peso TOTALE in grammi della ricetta PRONTA, come arriva nel piatto: questo è totalWeightGrams. NON dividerlo per le porzioni.

**Regole per il peso della ricetta pronta:**
- Pasta, riso, cereali e legumi secchi assorbono acqua in cottura: usa il peso da cotti (pasta ≈ 2×, riso ≈ 2,5×, legumi secchi ≈ 2,5×).
- Sughi, brasati e riduzioni perdono acqua per evaporazione: sottrai una quota ragionevole.
- Vale la stessa regola delle kcal: conta solo ciò che finisce nel piatto — l'acqua di cottura scolata non pesa, l'olio di frittura assorbito è una frazione di quello nella pentola.
- Peso, macro e kcal devono descrivere la stessa ricetta pronta, in modo coerente tra loro.

**Regole:**
- Ignora gli ingredienti senza quantità numerica (es. "sale q.b.", "prezzemolo a piacere"), TRANNE olio, burro e altri grassi da condimento: quelli incidono troppo, stimane una quantità ragionevole per il tipo di piatto.
- Considera solo ciò che finisce nel piatto: l'olio di frittura assorbito è una frazione di quello nella pentola, l'acqua di cottura della pasta non conta.
- Usa valori nutrizionali medi per gli ingredienti italiani comuni.
- Ogni campo è indipendente: se non riesci a stimare il peso ma le kcal sì, restituisci null solo per totalWeightGrams (e viceversa). Se le quantità non bastano per i macro, restituisci totalMacros null.
- Verifica di coerenza: 4×proteine + 4×carboidrati + 9×grassi (totali) deve avvicinarsi alle kcal totali; se divergono molto, ricontrolla i calcoli prima di rispondere.
- Se gli ingredienti sono troppo vaghi o privi di quantità per una stima sensata, restituisci null su tutti i campi.

**Confidenza:**
- "alta": quasi tutti gli ingredienti hanno quantità precise
- "media": alcune quantità stimate o approssimate
- "bassa": molte quantità mancanti o ambigue
```

**Current schema verbatim** (`route.ts:82-97`):

```ts
const CALORIE_ESTIMATION_SCHEMA = {
  type: 'object',
  properties: {
    caloriesPerServing: {
      type: ['integer', 'null'],
      description: 'Kcal stimate per una porzione, arrotondate alla decina. null se non stimabile.',
    },
    confidence: {
      type: 'string',
      enum: ['alta', 'media', 'bassa'],
      description: 'Quanto sono precise le quantità disponibili.',
    },
  },
  required: ['caloriesPerServing', 'confidence'],
  additionalProperties: false,
} as const;
```

**Proposed schema** (renamed `NUTRITION_ESTIMATION_SCHEMA`; ONLY shape and types — no
`minimum`/`maximum`/`multipleOf`, which make the whole request fail with 400):

```ts
const NUTRITION_ESTIMATION_SCHEMA = {
  type: 'object',
  properties: {
    caloriesPerServing: {
      type: ['integer', 'null'],
      description: 'Kcal stimate per una porzione, arrotondate alla decina. null se non stimabile.',
    },
    totalWeightGrams: {
      type: ['integer', 'null'],
      description: 'Peso totale stimato della ricetta PRONTA in grammi, NON diviso per le porzioni. null se non stimabile.',
    },
    totalMacros: {
      type: ['object', 'null'],
      description: 'Grammi TOTALI di macronutrienti della ricetta intera, NON divisi per le porzioni. null se non stimabili.',
      properties: {
        proteinGrams: { type: 'integer', description: 'Proteine totali in grammi.' },
        carbsGrams: { type: 'integer', description: 'Carboidrati totali in grammi.' },
        fatGrams: { type: 'integer', description: 'Grassi totali in grammi.' },
      },
      required: ['proteinGrams', 'carbsGrams', 'fatGrams'],
      additionalProperties: false,
    },
    confidence: {
      type: 'string',
      enum: ['alta', 'media', 'bassa'],
      description: 'Quanto sono precise le quantità disponibili.',
    },
  },
  required: ['caloriesPerServing', 'totalWeightGrams', 'totalMacros', 'confidence'],
  additionalProperties: false,
} as const;
```

**`max_tokens`: 900 → 1400.** Rationale: with `thinking: adaptive` the reasoning tokens
count within `max_tokens`; the arithmetic work quadruples (kcal + 3 macros + weight for
each ingredient) and the output JSON grows by ~10 fields. 1400 gives headroom with no
added cost at rest (output tokens are paid only when produced). `thinking: adaptive` +
`output_config.effort: 'low'` stay unchanged; never `temperature`/`top_p`/`top_k`/
`budget_tokens` (400 on Sonnet 5).

**Server-side derivation and clamp.** Extract the pure logic into a new module
`src/lib/utils/nutrition-estimate.ts` (testable with Jest without mounting the route):

```ts
import { MacrosPerServing } from '@/types';

/** Below: garnish or error. Above: almost certainly an undivided total. */
export const MIN_PLAUSIBLE_KCAL = 20;
export const MAX_PLAUSIBLE_KCAL = 3000;

/** Plausible weight of ONE finished serving: under 30 g it's a garnish,
 *  over 1.5 kg it's almost certainly the weight of the whole undivided recipe. */
export const MIN_PLAUSIBLE_SERVING_WEIGHT_G = 30;
export const MAX_PLAUSIBLE_SERVING_WEIGHT_G = 1500;

/** No per-serving macro plausibly exceeds this ceiling. */
export const MAX_PLAUSIBLE_MACRO_G = 300;

/** Tolerance of the Atwater check 4p+4c+9f ≈ kcal: ±30%.
 *  Covers fiber, alcohol, rounding and diverging nutrition tables;
 *  beyond it, macros are inconsistent with kcal and get discarded (kcal preserved). */
export const MACRO_KCAL_TOLERANCE = 0.3;

export interface DerivedNutrition {
  caloriesPerServing: number | null;
  servingWeightGrams: number | null;
  macrosPerServing: MacrosPerServing | null;
}

/**
 * Derives per-serving values from the model's raw payload (totals) and applies
 * the plausibility clamps. Each field degrades to null independently; macros
 * require plausible kcal because without kcal the consistency check is impossible.
 */
export function deriveNutritionPerServing(raw: unknown, servings: number): DerivedNutrition {
  const estimate = (raw ?? {}) as Record<string, unknown>;

  // kcal: identical to today (the model divides, the server validates 20-3000)
  const rawCalories = estimate.caloriesPerServing;
  const caloriesPerServing =
    typeof rawCalories === 'number' &&
    Number.isFinite(rawCalories) &&
    rawCalories >= MIN_PLAUSIBLE_KCAL &&
    rawCalories <= MAX_PLAUSIBLE_KCAL
      ? Math.round(rawCalories)
      : null;

  // Weight: the model gives the total, the server divides and validates the per-serving value
  let servingWeightGrams: number | null = null;
  const rawWeight = estimate.totalWeightGrams;
  if (typeof rawWeight === 'number' && Number.isFinite(rawWeight)) {
    const perServing = rawWeight / servings;
    if (perServing >= MIN_PLAUSIBLE_SERVING_WEIGHT_G && perServing <= MAX_PLAUSIBLE_SERVING_WEIGHT_G) {
      servingWeightGrams = Math.round(perServing);
    }
  }

  // Macros: total → per serving, then bound [0, 300] and Atwater check vs kcal.
  // If the check fails: macros null, kcal preserved (the likeliest error is in the macros).
  let macrosPerServing: MacrosPerServing | null = null;
  const rawMacros = estimate.totalMacros as Record<string, unknown> | null | undefined;
  if (caloriesPerServing !== null && rawMacros && typeof rawMacros === 'object') {
    const per = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v / servings : null;
    const p = per(rawMacros.proteinGrams);
    const c = per(rawMacros.carbsGrams);
    const f = per(rawMacros.fatGrams);
    const inBounds = (v: number | null): v is number =>
      v !== null && v >= 0 && v <= MAX_PLAUSIBLE_MACRO_G;

    if (inBounds(p) && inBounds(c) && inBounds(f)) {
      const atwaterKcal = 4 * p + 4 * c + 9 * f;
      if (Math.abs(atwaterKcal - caloriesPerServing) <= MACRO_KCAL_TOLERANCE * caloriesPerServing) {
        macrosPerServing = {
          proteinGrams: Math.round(p),
          carbsGrams: Math.round(c),
          fatGrams: Math.round(f),
        };
      }
    }
  }

  return { caloriesPerServing, servingWeightGrams, macrosPerServing };
}
```

The route replaces the block at lines 170-185 with:

```ts
const estimate = JSON.parse(responseText);
const derived = deriveNutritionPerServing(estimate, servingsCount);

return NextResponse.json({
  success: true,
  ...derived,
  confidence: estimate.confidence ?? 'bassa',
});
```

The route-local `MIN_PLAUSIBLE_KCAL`/`MAX_PLAUSIBLE_KCAL` (lines 24-28) are removed
(they now live in `nutrition-estimate.ts`). Input guards (recipeTitle/ingredients/servings)
unchanged. `confidence` keeps being returned and ignored by clients (no AI-vs-manual
provenance on the saved fields: showing it would suggest a per-field reliability
we don't have — it stays out of the UI).

### 4.c Client — wrapper and hook

**`getAICalorieEstimateForRecipe` → `getAINutritionEstimateForRecipe`**
(`src/lib/utils/recipe-parser.ts:579-618`). New signature:

```ts
export interface RecipeNutritionEstimate {
  caloriesPerServing: number | null;
  servingWeightGrams: number | null;
  macrosPerServing: MacrosPerServing | null;
}

export async function getAINutritionEstimateForRecipe(
  recipeTitle: string,
  ingredients: Ingredient[],
  servings: number | undefined
): Promise<RecipeNutritionEstimate | null>
```

Behavior: same `!servings || servings < 1` guard → `null`; same fetch; on an ok response
it reads the three fields validating their types (`typeof x === 'number'` for numbers; for
`macrosPerServing` it checks it's an object with the three finite numbers, otherwise `null`);
on error/non-ok HTTP → `null` (unchanged: every failure degrades to null, never throws).
The old name disappears; the two call sites (`assistente-ai/page.tsx:14,166` and
`useEstimateCalories.ts:7,31`) get updated.

**`enrichRecipesWithAI`** (`assistente-ai/page.tsx:157-176`) — the return becomes:

```ts
const [suggestion, nutrition] = await Promise.all([
  getAISuggestionForRecipe(...),                                    // unchanged
  getAINutritionEstimateForRecipe(recipe.title, recipe.ingredients, recipe.servings),
]);

return {
  ...recipe,
  aiSuggestion: suggestion || undefined,
  ...(nutrition?.caloriesPerServing != null ? { caloriesPerServing: nutrition.caloriesPerServing } : {}),
  ...(nutrition?.servingWeightGrams != null ? { servingWeightGrams: nutrition.servingWeightGrams } : {}),
  ...(nutrition?.macrosPerServing != null ? { macrosPerServing: nutrition.macrosPerServing } : {}),
};
```

Always **one** AI call per recipe for nutrition: the enrichment cost stays
1 + 2N.

**`useEstimateCalories` → `useEstimateNutrition`** (rename the file to
`src/lib/hooks/useEstimateNutrition.ts`). The mutation becomes **fill-the-gaps**: it writes only
the fields the recipe doesn't have yet, so a re-estimate never overwrites a value already
present (in particular hand-entered kcal):

```ts
mutationFn: async (recipe: Recipe) => {
  if (!user) throw new Error('Autenticazione richiesta');

  const estimate = await getAINutritionEstimateForRecipe(
    recipe.title, recipe.ingredients, recipe.servings
  );

  // Only fields missing on the recipe AND present in the estimate.
  // CAUTION: `== null` gate, never truthiness — 0 g of fat is legitimate.
  const updates: Partial<Recipe> = {};
  if (recipe.caloriesPerServing == null && estimate?.caloriesPerServing != null) {
    updates.caloriesPerServing = estimate.caloriesPerServing;
  }
  if (recipe.servingWeightGrams == null && estimate?.servingWeightGrams != null) {
    updates.servingWeightGrams = estimate.servingWeightGrams;
  }
  if (recipe.macrosPerServing == null && estimate?.macrosPerServing != null) {
    updates.macrosPerServing = estimate.macrosPerServing;
  }

  if (Object.keys(updates).length === 0) {
    return { recipeId: recipe.id, updates: null };
  }

  await updateRecipe(recipe.id, updates);
  return { recipeId: recipe.id, updates };
},
```

`onSuccess`: if `updates === null` → info toast
`'Ingredienti troppo vaghi per una stima affidabile. Puoi inserire i valori a mano in modifica.'`
and no invalidation; otherwise invalidate `['recipe', recipeId, user.uid]` +
`recipesQueryKey(user.uid)` and a success toast:
- if `updates.caloriesPerServing != null` → `` `Stima: ${kcal} kcal a porzione` `` (current copy);
- otherwise (only nutrition fields filled in) → `'Valori nutrizionali stimati'`.

`onError`: toast `'Impossibile stimare i valori nutrizionali in questo momento.'`.

### 4.d The three write sites

1. **`handleSaveRecipe`** (`assistente-ai/page.tsx:373-397`) — after the existing kcal spread
   (line 396, which stays as is) add:
   ```ts
   ...(recipe.servingWeightGrams != null ? { servingWeightGrams: recipe.servingWeightGrams } : {}),
   ...(recipe.macrosPerServing != null ? { macrosPerServing: recipe.macrosPerServing } : {}),
   ```
2. **`saveNewRecipeToCookbook`** (`useMealPlanner.ts:524-546`) — the same two lines after line 545.
3. **`RecipeForm`** — **exact** replica of the kcal pattern for each new field:
   - **String state** (empty ≠ 0), next to `caloriesPerServing` (lines 72-74):
     ```ts
     const [servingWeightGrams, setServingWeightGrams] = useState(
       recipe?.servingWeightGrams != null ? String(recipe.servingWeightGrams) : ''
     );
     const [proteinGrams, setProteinGrams] = useState(
       recipe?.macrosPerServing != null ? String(recipe.macrosPerServing.proteinGrams) : ''
     );
     // same for carbsGrams, fatGrams
     ```
   - **Parse in `handleSubmit`** (next to lines 425-430). Weight: like kcal, `> 0`
     (0 g is not a weight). Macros: **`>= 0`** — here 0 is legitimate:
     ```ts
     const parseGrams = (value: string, allowZero: boolean): number | null => {
       const n = Number(value);
       if (value.trim() === '' || !Number.isFinite(n)) return null;
       if (allowZero ? n < 0 : n <= 0) return null;
       return Math.round(n);
     };
     const parsedWeight = parseGrams(servingWeightGrams, false);
     const parsedProtein = parseGrams(proteinGrams, true);
     const parsedCarbs = parseGrams(carbsGrams, true);
     const parsedFat = parseGrams(fatGrams, true);

     // MacrosPerServing is all-or-nothing: a partial trio can't be persisted.
     const macroValues = [parsedProtein, parsedCarbs, parsedFat];
     const filledMacros = macroValues.filter(v => v !== null).length;
     if (filledMacros > 0 && filledMacros < 3) {
       toast.error('Per i macronutrienti compila tutti e tre i campi (anche 0) oppure lasciali vuoti');
       setLoading(false);
       return;
     }
     const parsedMacros: MacrosPerServing | null =
       filledMacros === 3
         ? { proteinGrams: parsedProtein!, carbsGrams: parsedCarbs!, fatGrams: parsedFat! }
         : null;
     ```
   - **Create** (next to line 450):
     ```ts
     ...(parsedWeight !== null ? { servingWeightGrams: parsedWeight } : {}),
     ...(parsedMacros !== null ? { macrosPerServing: parsedMacros } : {}),
     ```
   - **Edit** (next to line 466 — `updateDoc` merges, so empty must delete):
     ```ts
     ...(parsedWeight === null ? { servingWeightGrams: deleteField() } : {}),
     ...(parsedMacros === null ? { macrosPerServing: deleteField() } : {}),
     ```
   - **UI**: below the existing numeric grid (lines 524-566) a second block:
     ```tsx
     <div>
       <p className="mb-2 text-sm font-medium">Valori nutrizionali per porzione <span className="text-muted-foreground font-normal">(opzionali)</span></p>
       <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
         {/* 4 Input type=number: "Peso porz. (g)" min=1, "Proteine (g)" min=0,
             "Carboidrati (g)" min=0, "Grassi (g)" min=0 — all with placeholder "—",
             id: recipe-serving-weight / recipe-protein / recipe-carbs / recipe-fat */}
       </div>
     </div>
     ```
     Same responsive pattern as the existing block (comment at lines 522-523: 2 columns on
     phones, 4 from `sm`). The existing kcal field stays where it is.

### 4.e Display

**Recipe detail** (`recipe-detail.tsx`). The meta row (79-135) keeps its structure
unchanged; the kcal slot keeps its current gate (kcal can't be 0 by construction:
server min 20, form `> 0`). What changes:

1. The ghost button label: `Stima calorie` → `Stima valori nutrizionali` (and the pending
   state `Stimo le calorie…` → `Stimo i valori…`). `Flame` icon unchanged.
2. Button visibility condition (replaces the current "only if kcal missing"):
   ```ts
   const nutritionIncomplete =
     recipe.caloriesPerServing == null ||
     recipe.servingWeightGrams == null ||
     recipe.macrosPerServing == null;
   const canEstimate = hasIngredients && !!user && nutritionIncomplete;
   ```
   - If `recipe.caloriesPerServing == null`: the button takes the kcal slot of the meta row,
     as today (lines 111-134).
   - If kcal are present but `nutritionIncomplete`: the button appears at the end of the
     secondary nutrition row (below), same ghost/sm variant.
3. **Secondary nutrition row**, inside the same container as the meta row (the
   `mb-8 flex flex-wrap … border-b … pb-6` div), as a full-width element:
   ```tsx
   const kcalPer100 =
     recipe.caloriesPerServing != null &&
     recipe.servingWeightGrams != null &&
     recipe.servingWeightGrams > 0
       ? Math.round((recipe.caloriesPerServing / recipe.servingWeightGrams) * 100)
       : null;
   const showNutritionRow =
     recipe.servingWeightGrams != null ||
     recipe.macrosPerServing != null ||
     (recipe.caloriesPerServing != null && canEstimate);

   {showNutritionRow && (
     <div className="basis-full flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
       {recipe.servingWeightGrams != null && <span>1 porzione ≈ {recipe.servingWeightGrams} g</span>}
       {kcalPer100 != null && <span>{kcalPer100} kcal/100 g</span>}
       {recipe.macrosPerServing != null && (
         <span>
           P {recipe.macrosPerServing.proteinGrams} g · C {recipe.macrosPerServing.carbsGrams} g · G {recipe.macrosPerServing.fatGrams} g
         </span>
       )}
       {recipe.caloriesPerServing != null && canEstimate && (
         /* ghost button "Stima valori nutrizionali" with spinner, as above */
       )}
     </div>
   )}
   ```
   Fixed copy: `1 porzione ≈ {n} g`, `{n} kcal/100 g`, `P {p} g · C {c} g · G {f} g`.
   All gates on the new fields use `!= null` (0 g of fat must stay visible). Semantic
   tokens only (`text-muted-foreground`): dark mode for free. No hover-only: the row is
   static text + an always-visible button.

**Recipe card** (`recipe-card.tsx`): **unchanged** — kcal only, so as not to crowd the footer.

**Extraction preview** (`extracted-recipe-preview.tsx`, meta chips 116-143): after the kcal
chip (137-142) add two chips, gated on `!= null`:

```tsx
{recipe.servingWeightGrams != null && (
  <div className="flex items-center gap-1">
    <Scale className="w-4 h-4" />
    <span>≈ {recipe.servingWeightGrams} g / porz.</span>
  </div>
)}
{recipe.macrosPerServing != null && (
  <div className="flex items-center gap-1 tabular-nums">
    <span>P {recipe.macrosPerServing.proteinGrams} · C {recipe.macrosPerServing.carbsGrams} · G {recipe.macrosPerServing.fatGrams} g</span>
  </div>
)}
```

`Scale` is added to the existing lucide import (line 7).

**Planner** — see 4.f.

### 4.f Planner: `meal-plan-calories.ts` → daily nutrition

The module stays `src/lib/utils/meal-plan-calories.ts` (no file rename: git history and
import path stay stable). `DayCalories`/`computeDayCalories`/`computeWeekCalories` are
**replaced** by the nutrition versions (the only consumer: `WeeklyCalendarGrid.tsx:6,57`;
the tests get rewritten). Proposed types:

```ts
/** Total of a single metric with the existing ≥ semantics (floor, not total). */
export interface NutrientTotal {
  /** Per-serving sum over the day's filled slots that carry the metric. */
  total: number;
  /** Slots whose recipe carries the metric. */
  countedSlots: number;
  /** Filled slots skipped because the metric is missing. */
  uncountedSlots: number;
  /** true when at least one filled slot did not contribute. */
  isPartial: boolean;
}

/**
 * Daily planner nutrition.
 *
 * kcal and macros have separate counters: a recipe can have kcal but no macros
 * (every recipe created before this spec), so the same day can be complete
 * for kcal and partial for macros. The three macros instead travel together
 * (MacrosPerServing is all-or-nothing), so they share a single set of counters.
 */
export interface DayNutrition {
  calories: NutrientTotal;
  macros: {
    proteinTotal: number;
    carbsTotal: number;
    fatTotal: number;
    countedSlots: number;
    uncountedSlots: number;
    isPartial: boolean;
  };
}

export function computeDayNutrition(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>
): DayNutrition;

export function computeWeekNutrition(
  plan: MealPlan,
  recipesById: Map<string, Recipe>
): Map<number, DayNutrition>;
```

Implementation: `readSlotCalories` (37-48) is generalized into

```ts
function readSlotNutrition(slot: MealSlot, recipesById: Map<string, Recipe>): {
  caloriesPerServing: number | null;
  macrosPerServing: MacrosPerServing | null;
} | null
```

with the same resolution (saved recipe by id → inline `newRecipe` → `null` for an empty
slot/deleted recipe); fields are read with `?? null`. `computeDayNutrition` iterates the
filled slots only once and updates both counter groups: for kcal identical to
today; for macros, `macrosPerServing != null` increments `countedSlots` and adds the three
totals (a `fatGrams` of 0 **counts** as counted and adds 0), `null` increments
`uncountedSlots`. `computeWeekNutrition` identical to `computeWeekCalories` (only
`activeDays`, empty days present with totals at 0). As today, each slot contributes
**one** serving (per-person comes with Spec F).

**`WeeklyCalendarGrid.tsx`**: the memo (56-59) switches to `computeWeekNutrition`;
`renderDayCalories` (72-88) becomes `renderDayNutrition` and produces **two stacked
elements**, kcal prominent and macros on a secondary line:

```tsx
function renderDayNutrition(dayIndex: number, kcalClassName: string, macrosClassName: string) {
  const day = nutritionByDay.get(dayIndex);
  if (!day) return null;
  const { calories, macros } = day;
  const showKcal = calories.total !== 0;              // current rule unchanged
  const showMacros = macros.countedSlots > 0;          // gate on countedSlots, NOT on total:
                                                       // an all-lean day with F 0 stays visible
  if (!showKcal && !showMacros) return null;

  return (
    <>
      {showKcal && (
        <span className={kcalClassName} title={/* current tooltip unchanged */}>
          {calories.isPartial ? '≥' : ''}{calories.total} kcal
        </span>
      )}
      {showMacros && (
        <span
          className={macrosClassName}
          title={
            macros.isPartial
              ? `Almeno P ${macros.proteinTotal} g · C ${macros.carbsTotal} g · G ${macros.fatTotal} g — ${macros.uncountedSlots} ricett${macros.uncountedSlots === 1 ? 'a' : 'e'} senza macro`
              : `Proteine ${macros.proteinTotal} g · Carboidrati ${macros.carbsTotal} g · Grassi ${macros.fatTotal} g stimati`
          }
        >
          {macros.isPartial ? '≥ ' : ''}P {macros.proteinTotal} · C {macros.carbsTotal} · G {macros.fatTotal}
        </span>
      )}
    </>
  );
}
```

Layout:
- **Desktop** (day header, lines 126-130, column `minmax(150px, 1fr)`): kcal unchanged
  (`block text-[11px] tabular-nums text-muted-foreground`), macros below as
  `block text-[10px] tabular-nums text-muted-foreground/80`. The worst case
  (`≥ P 182 · C 310 · G 95`, ~21 characters at 10px ≈ 110px) fits in 150px without wrapping.
- **Mobile portrait** (card day header, lines 184-190): kcal stays `ml-auto text-xs
  tabular-nums text-muted-foreground` inside the title row; macros go on their own
  line right below the header (`text-[11px] tabular-nums text-muted-foreground`, right-aligned
  with `text-right`), before the meals' `space-y-2`. To do this, the two-className signature
  is called twice or split into two helpers (`renderDayCalories` /
  `renderDayMacros`) — at the implementer's discretion, as long as the resulting markup is
  the one described. The `title` tooltips stay (they don't open on touch: they are
  additional information, the text with `≥` is self-sufficient).

No shopping list: no change to `ingredient-aggregator.ts` or to the shopping views.

### 4.g Edge cases and errors

1. **Legitimate 0 g**: macros can be 0 (fat in a fruit salad). All gates on the
   new fields use `!= null`/`== null`. The **existing** truthy gates on
   `caloriesPerServing` (detail:106, card:110/125/126, preview:137) stay: 0 kcal is
   unreachable by construction (server min 20, form `> 0`).
2. **Division skipped by the model (weight)**: the model gives the total by contract; the
   server always divides. If the model returned a per-serving value already, the
   `30–1500 g` clamp on the division result discards the absurd cases (per-serving/servings
   with servings ≥ 2 almost always drops below 30 g → null, fail-safe).
3. **Atwater failed**: macros inconsistent with kcal (beyond ±30%) → `macrosPerServing: null`,
   kcal and weight preserved. Never an HTTP error: null is a successful outcome.
4. **Null kcal but plausible weight**: the weight passes (independent nullability); kcal/100g is not
   derived (it needs the pair). Macros with null kcal → always null (check impossible).
5. **Partial macro trio in the form**: submit blocked with toast
   `'Per i macronutrienti compila tutti e tre i campi (anche 0) oppure lasciali vuoti'`.
6. **Clearing the fields in edit**: `deleteField()` for `servingWeightGrams` and
   `macrosPerServing` (updateDoc merges: omitting the key would leave the old value).
7. **Re-estimate with partial values**: the mutation writes only the missing fields — a manual
   value is never overwritten. If the model can't estimate exactly the missing
   fields → info toast, no write.
8. **`servingWeightGrams` at 0 in Firestore** (not producible by our flows but
   defensive): the kcal/100g derivation requires `> 0` (no division by zero).
9. **Existing recipes / legacy plans with inline `newRecipe`**: fields absent → nutrition
   row not rendered, planner macros `uncountedSlots`, no migration.
10. **`servings` changed after the estimate**: values stay per-serving so they're
    formally correct, but the estimate can go stale — behavior identical to
    kcal today, documented and accepted (no automatic recalculation).
11. **Malformed AI response** (non-object macros, non-finite numbers): `deriveNutritionPerServing`
    and the client wrapper validate types field by field and degrade to null.
12. **`JSON.parse` throwing** (route): already covered by the existing catch → 500 with a
    generic message, the client degrades to null. Unchanged.

## 5. Phased implementation plan

Each phase leaves the project compiling (`npx tsc --noEmit`).

**Phase 1 — Types (additive)**
- `src/types/index.ts`: new `export interface MacrosPerServing`; `servingWeightGrams?` and
  `macrosPerServing?` on `Recipe` (after line 227) and on `ParsedRecipe` (after line 361).
- `src/lib/utils/recipe-parser.ts`: the same two fields on the local `ParsedRecipe` (after line
  15) + `MacrosPerServing` import.

**Phase 2 — Server**
- New `src/lib/utils/nutrition-estimate.ts` (constants + `deriveNutritionPerServing`).
- `src/app/api/estimate-calories/route.ts`: extended prompt, extended schema, `max_tokens` 1400,
  derivation via `deriveNutritionPerServing`, extended response; removal of local constants.

**Phase 3 — Client wrapper, hook, detail**
- `src/lib/utils/recipe-parser.ts`: `getAICalorieEstimateForRecipe` →
  `getAINutritionEstimateForRecipe` + `RecipeNutritionEstimate`.
- `src/lib/hooks/useEstimateCalories.ts` → `src/lib/hooks/useEstimateNutrition.ts`
  (fill-the-gaps, new toasts).
- `src/app/(dashboard)/assistente-ai/page.tsx`: import and `enrichRecipesWithAI` (`!= null` spread).
- `src/components/recipe/recipe-detail.tsx`: button label, `nutritionIncomplete`, secondary
  nutrition row.

**Phase 4 — Write sites and form**
- `assistente-ai/page.tsx` (`handleSaveRecipe`): two new spreads.
- `src/lib/hooks/useMealPlanner.ts` (`saveNewRecipeToCookbook`): two new spreads.
- `src/components/recipe/recipe-form.tsx`: 4 string states, parse + trio validation,
  create spread, edit `deleteField()`, "Valori nutrizionali per porzione" UI block.
- `src/components/recipe/extracted-recipe-preview.tsx`: two new chips + `Scale` import.

**Phase 5 — Planner**
- `src/lib/utils/meal-plan-calories.ts`: `NutrientTotal`, `DayNutrition`,
  `computeDayNutrition`, `computeWeekNutrition` (removal of the old exports).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: memo + kcal/macro render
  on desktop and mobile.
- `src/lib/utils/meal-plan-calories.test.ts`: rewrite on the new exports (see §6).

**Phase 6 — New tests, build, docs**
- `src/lib/utils/nutrition-estimate.test.ts` (new).
- `npm test`, `npx next build --webpack`.
- CLAUDE.md (Recent Changes + Calories section), AGENTS.md (any gotchas that surfaced),
  checklist in `specs/00-roadmap.md`.

## 6. Test plan

### Unit (Jest — real command: `npm test`, script `"test": "jest"` in package.json)

**New `src/lib/utils/nutrition-estimate.test.ts`** on `deriveNutritionPerServing`:
- plausible kcal pass, outside 20–3000 → null (parity with the current behavior);
- weight: total/servings within 30–1500 → rounded; a total producing a per-serving value
  out of bounds → null; `totalWeightGrams` null/non-numeric → null; null kcal doesn't block the weight;
- macros: consistent trio (e.g. kcal 600, P 30/C 60/F 20 → Atwater 580, within ±30%) → passes
  with rounding; inconsistent trio (Atwater beyond ±30%) → macros null and kcal preserved;
  negative macro → null; per-serving macro > 300 → null; null kcal → macros null even if
  plausible; total `fatGrams` 0 with the rest consistent → passes with `fatGrams: 0`;
- malformed payload (`totalMacros` as a string, missing fields) → all derived values consistently
  null, no throw.

**`src/lib/utils/meal-plan-calories.test.ts` rewritten** on
`computeDayNutrition`/`computeWeekNutrition`, preserving the current scenarios (complete
sum, partial day, inline `newRecipe`, deleted recipe, empty day, days of
other slots, entries per activeDays, exclusion of removed days) plus:
- recipe with kcal but no macros → `calories.isPartial false`, `macros.isPartial true`;
- recipe with `macrosPerServing.fatGrams: 0` → `macros.countedSlots` incremented and
  `fatTotal` 0 (the gate isn't truthy);
- `makeRecipe` fixture extended with optional `servingWeightGrams`/`macrosPerServing` via
  conditional spread (same style as the current line 15).

### Guided test (Playwright + emulators, throwaway script in `e2e/scratch/`)

Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` (see
"Guided testing tooling" in CLAUDE.md). Seed data via a throwaway script with spy words.

- **Phase A — manual form (no AI)**: create a recipe with kcal 500, weight 350,
  P 30/C 55/F 18; assert on the emulated Firestore that the document contains the three fields with the
  right shape; open the detail page and check the nutrition row
  (`1 porzione ≈ 350 g`, `143 kcal/100 g`, `P 30 g · C 55 g · G 18 g`).
- **Phase B — partial trio**: fill in only Proteine → submit blocked, expected toast.
- **Phase C — clearing in edit**: clear weight and macros, save, assert that the fields
  are gone from the document (deleteField).
- **Phase D — visible 0 g**: macros with G 0 → the detail row shows `G 0 g`.
- **Phase E — planner**: plan with 2 recipes (one with macros, one without) → day header
  shows kcal and `≥ P … · C … · G …`; a day with only unestimated recipes → no row.
- **Phase F — real AI estimate** (optional, requires `ANTHROPIC_API_KEY` and a user other than
  test@test.com): detail of a recipe with ingredients only → "Stima valori
  nutrizionali" → the four fields appear; repeat on a recipe with manual kcal →
  kcal do NOT change, the other fields get filled.

Scratch scripts are deleted at the end of the guided test (guided-testing protocol).

## 7. Gotchas and constraints (specific)

- **Never `undefined` in Firestore** (CLAUDE.md "Firebase", AGENTS.md Quick Reference
  "Firebase optional"): conditional spread in create, `deleteField()` in edit.
- **Optional numeric field as a string in state** (AGENTS.md: "Optional numeric
  field as `number` in state"): empty ≠ 0; in `updateDoc` empty becomes
  `deleteField()` because the merge would leave the previous value.
- **`json_schema` without numeric constraints** (AGENTS.md: "`json_schema` with length
  constraints"): no `minimum`/`maximum`/`minItems` → 400 on the whole request with a misleading
  symptom (the client degrades to null and the feature seems to "not work"). Bounds in the
  prompt + server clamp.
- **Sonnet 5 parameters → 400** (AGENTS.md): never `temperature`/`top_p`/`top_k`/
  `budget_tokens`; `thinking: adaptive` + `output_config.effort: 'low'` stay; model only
  via `AI_MODEL`.
- **Total kcal instead of per serving** (AGENTS.md): everything persisted is
  per-serving; totals (and kcal/100g) are derived at render time.
- **Truthiness ban on the new fields**: `fatGrams: 0` and `proteinGrams: 0` are legitimate —
  `!= null` gate everywhere (detail, preview, planner via `countedSlots`). The existing truthy
  gates on kcal remain valid only because 0 kcal is unreachable.
- **React Query**: every write invalidates `['recipe', id, uid]` + `recipesQueryKey(uid)`
  (pattern already in `useEstimateCalories.ts:54-55` and `recipe-form.tsx:472-475`); no
  `onSnapshot`; `enabled: !!user` on auth-bound queries (no new query in this spec).
- **Validation with `react-hot-toast`, never `alert()`** (CLAUDE.md "Confirmations and touch"):
  the partial-trio block uses `toast.error`. No new destructive action → no
  `ConfirmDialog` needed.
- **Semantic tokens, never `bg-white`/raw palette** (AGENTS.md §6): the nutrition row and the
  chips use `text-muted-foreground`/`tabular-nums`; dark mode for free.
- **Controls never `group-hover`-only below `lg`** (AGENTS.md): the "Stima valori
  nutrizionali" button is always visible; the planner's `title` tooltips are redundant
  information, not the only channel (the `≥` text is self-sufficient).
- **No new debounced persistence target**: every write in this spec is
  one-shot (`updateRecipe`/`createRecipe`), so the `flushAll()` gotcha of
  `useShoppingList` doesn't apply — mentioned for completeness: do NOT introduce debounced
  writes here.
- **Build**: validate with `npx tsc --noEmit` + `npx next build --webpack` (no
  `next lint`, removed in Next 16); `spawn EPERM` in the sandbox → rerun outside the sandbox.

## 8. Out of scope

- Shopping list: kcal and macros excluded by documented choice (no change to
  `ingredient-aggregator.ts` or to the shopping views).
- `confidence` in the UI: still not shown (no per-field AI-vs-manual
  provenance to base it on).
- Migration/backfill of existing recipes; automatic recalculation when
  `servings` or ingredients change (staleness identical to kcal today).
- Per-person scaling in the planner (`servingsPlanned`, variants): Spec F.
- Recipe card: no nutrition field beyond the current kcal.
- Cooking mode: no nutrition display while cooking.
- Per-ingredient weight/macros or deterministic parsing of quantities in grams
  (quantities remain free strings end-to-end).
- Changes to `extract-recipes`/`format-recipe`/`chat-recipe`/`suggest-category`.

## 9. Implementation prompt

```markdown
Implement Spec C (complete nutrition) of "Il Mio Ricettario".

1. Read and apply in full: CLAUDE.md, AGENTS.md, COMMENTS.md and
   DEVELOPMENT_GUIDELINES.md (repo root). They are binding on Firestore patterns
   (never undefined, deleteField in edit), React Query, semantic tokens, toast/ConfirmDialog
   and comment style.
2. Read IN FULL specs/00-roadmap.md (shared contract: cross-spec contract 4
   defines the exact field names) and then specs/spec-c-nutrizione.md (this spec):
   it contains the exact types, the route's prompt and schema, server clamps, visibility
   conditions and the Italian copy. Do not deviate from the field/module/type names defined there.
3. Create the branch feature/nutrition-macros from develop.
4. Implement phase by phase following §5 of the spec (6 phases). After EVERY phase run
   `npx tsc --noEmit` and fix before moving on.
5. Tests: run `npm test` (the real script in package.json is "test": "jest") — both the
   rewritten meal-plan-calories tests and the new nutrition-estimate ones must pass.
6. When done: `npx next build --webpack`. If it fails with `spawn EPERM` it's a sandbox
   limitation, not a code error: rerun the build outside the sandbox.
7. Update: CLAUDE.md ("Recent Changes" section + "Calories" section with the new
   invariants), AGENTS.md (only if new gotchas emerge from >30min of debugging) and the
   "Stato" checklist in specs/00-roadmap.md (tick Spec C).
8. NEVER commit without the user's explicit OK (session rule: one branch/one
   commit per session, commit only after approval).
9. At the end, propose to the user a phase-by-phase guided test following §6 of the spec
   (Playwright + Firebase emulators, throwaway script in e2e/scratch/, guided-testing
   protocol in CLAUDE.md), declaring in advance the expected outcome of each phase.
```

## 10. Recommended model and effort

Sonnet · effort high — existing patterns to replicate (kcal), but many touchpoints: route, two ParsedRecipes, two save converters, form, detail, planner.
