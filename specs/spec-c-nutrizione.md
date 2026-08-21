# Spec C — Nutrizione completa: peso porzione, kcal/100g, macronutrienti

> Note coperte: 2 (kcal/100g, peso porzione), 5 (macronutrienti) | Dipendenze: nessuna (consumata da Spec F per i macro nel planner) | Branch: `feature/nutrition-macros`

## 1. Obiettivo

Oggi l'app stima e mostra solo le kcal per porzione. Con questa spec ogni ricetta può avere
anche il **peso stimato di una porzione** (grammi) e i **macronutrienti per porzione**
(proteine, carboidrati, grassi in grammi). Da questi si deriva a video la densità
**kcal/100g**. L'utente li ottiene in tre modi: (1) la stima AI, che passa dall'unico
endpoint `/api/estimate-calories` esteso — stessa singola chiamata di oggi, nessuna chiamata
in più nemmeno nell'enrichment 2N-parallelo dell'assistente AI; (2) il bottone sul dettaglio
ricetta, che diventa "Stima valori nutrizionali" e sa completare i campi mancanti anche
quando le kcal ci sono già; (3) i campi manuali nel form. La visualizzazione copre dettaglio
ricetta (riga nutrizionale), anteprima estrazione (chip), form (campi) e pianificatore
(totali giornalieri di macro accanto alle kcal). La card ricetta resta com'è (solo kcal).

## 2. Stato attuale

Verificato sul codice al commit `c99e86e` (branch `develop`).

### Modello dati

- `Recipe.caloriesPerServing?: number` — `src/types/index.ts:227`, con doc comment (220-226)
  che fissa l'invariante per-porzione ("Per serving rather than per recipe because
  `servings` is editable in the form and is already scaled at runtime by cooking mode").
- `ParsedRecipe` esiste in **due** dichiarazioni strutturalmente compatibili:
  - `src/types/index.ts:353-365` (canonica: usata da `MealSlot.newRecipe`,
    `meal-plan-calories.ts`, `ingredient-aggregator.ts`), con `caloriesPerServing?: number`
    alla riga 361;
  - `src/lib/utils/recipe-parser.ts:6-17` (variante parser: usata da `/assistente-ai` e
    `ExtractedRecipePreview`), con `caloriesPerServing?: number` alla riga 15. Non ha
    `description`.

### Route `/api/estimate-calories` (`src/app/api/estimate-calories/route.ts`)

- Bound di plausibilità: `MIN_PLAUSIBLE_KCAL = 20` (riga 25), `MAX_PLAUSIBLE_KCAL = 3000`
  (riga 28).
- Prompt costruito da `createCalorieEstimationPrompt` (righe 42-74), citato verbatim in §4.b.
- Schema `CALORIE_ESTIMATION_SCHEMA` (righe 82-97), citato verbatim in §4.b. Nessun
  `minimum`/`maximum` (che darebbero 400).
- Guardia porzioni (righe 136-142): `Number(servings)` finito e `>= 1`, altrimenti 400
  `'Numero di porzioni non valido: serve almeno 1 porzione'`.
- Chiamata Anthropic (righe 146-162): `model: AI_MODEL`, `max_tokens: 900`,
  `thinking: { type: 'adaptive' }`, `output_config: { effort: 'low', format: { type:
  'json_schema', schema } }`.
- Clamp finale (righe 175-185): valori fuori 20-3000 → `caloriesPerServing: null` (mai
  errore); risposta `{ success: true, caloriesPerServing, confidence }`.

### Client

- `getAICalorieEstimateForRecipe(recipeTitle, ingredients, servings)` —
  `src/lib/utils/recipe-parser.ts:579-618`: salta la chiamata se `!servings || servings < 1`
  (righe 586-588), ritorna `Promise<number | null>`, scarta `confidence` (riga 613:
  `typeof data.caloriesPerServing === 'number' ? data.caloriesPerServing : null`).
- `useEstimateCalories` — `src/lib/hooks/useEstimateCalories.ts:23-62`: mutation che su
  numero scrive `updateRecipe(recipe.id, { caloriesPerServing })` (riga 41) e invalida
  `['recipe', id, uid]` + `recipesQueryKey(uid)` (righe 54-55); su `null` mostra toast info
  "Ingredienti troppo vaghi per una stima affidabile…" (riga 48) e non scrive nulla.
- Enrichment assistente AI — `src/app/(dashboard)/assistente-ai/page.tsx:157-176`
  (`enrichRecipesWithAI`): per ogni ricetta `Promise.all([getAISuggestionForRecipe,
  getAICalorieEstimateForRecipe])` (righe 160-167), spread condizionale
  `...(caloriesPerServing !== null ? { caloriesPerServing } : {})` (riga 172). Usato da PDF,
  testo libero (via `processExtractedMarkdown`, riga 178) e chat (via
  `handleChatRecipesExtracted`, riga 206).

### I tre siti di scrittura di `caloriesPerServing`

1. `handleSaveRecipe` — `assistente-ai/page.tsx:358-423`, spread in create (riga 396):
   ```ts
   // Omit the key entirely when the estimate is missing — Firestore rejects undefined.
   ...(recipe.caloriesPerServing ? { caloriesPerServing: recipe.caloriesPerServing } : {}),
   ```
2. `saveNewRecipeToCookbook` — `src/lib/hooks/useMealPlanner.ts:509-571`, spread identico
   alla riga 545.
3. `RecipeForm` — `src/components/recipe/recipe-form.tsx`: stato **stringa** (righe 72-74,
   "Held as a string, not a number, so 'empty' stays distinguishable from 0"); parse in
   submit (righe 425-430: `caloriesPerServing.trim() !== '' && Number.isFinite(...) &&
   caloriesInput > 0 ? Math.round(...) : null`); spread in create (riga 450); in edit
   `...(parsedCalories === null ? { caloriesPerServing: deleteField() } : {})` (riga 466)
   perché `updateDoc` fa merge; input UI righe 555-565, label "kcal / porz.".

### Display

- Dettaglio — `src/components/recipe/recipe-detail.tsx:79-135`: riga meta flex-wrap con
  slot grandi `text-2xl font-bold tabular-nums` (porzioni/prep/cottura/totali/kcal). Lo slot
  kcal è **truthy-gated** (riga 106: `recipe.caloriesPerServing ? (...)`) e in assenza mostra
  il ghost button "Stima calorie" (righe 112-133, `Flame` + spinner, visibile solo con
  `hasIngredients && user`).
- Card — `src/components/recipe/recipe-card.tsx:126-131`: "{n} kcal" con `Flame`, truthy-gated,
  nessun bottone (la card è un `<Link>`, righe 107-109).
- Anteprima — `src/components/recipe/extracted-recipe-preview.tsx:135-142`: chip
  "{n} kcal / porz." con `Flame`, truthy-gated (riga 137).
- Planner — `src/lib/utils/meal-plan-calories.ts`: `DayCalories` (righe 18-27, campi
  `total/countedSlots/uncountedSlots/isPartial`), `readSlotCalories` (37-48, ricetta salvata
  per id poi `newRecipe` inline), `computeDayCalories` (62-92), `computeWeekCalories`
  (100-112, solo `activeDays`). Consumato solo da
  `src/components/meal-planner/WeeklyCalendarGrid.tsx`: memo alla riga 56-59,
  `renderDayCalories` (72-88: nasconde con `total === 0`, prefisso `≥` se `isPartial`,
  tooltip `title`), render nell'header desktop (riga 129, colonna
  `minmax(150px, 1fr)`, riga 121) e nell'header giorno mobile (riga 189, `ml-auto`).
- Test esistenti: `src/lib/utils/meal-plan-calories.test.ts` (8 test: 6 su
  `computeDayCalories`, 2 su `computeWeekCalories`).

## 3. Decisioni di prodotto (dal roadmap, vincolanti)

Dal contratto cross-spec 4 di `specs/00-roadmap.md` e dalla decisione utente 7:

- `Recipe` e **entrambe** le `ParsedRecipe` guadagnano `servingWeightGrams?: number` e
  `macrosPerServing?: { proteinGrams: number; carbsGrams: number; fatGrams: number }`.
- Si persiste **solo il per-porzione**: kcal/100g e ogni altro derivato si calcolano a
  render time (`caloriesPerServing / servingWeightGrams * 100`). Nessun campo derivato salvato.
- `/api/estimate-calories` si estende nella **stessa singola chiamata AI**: il modello stima
  peso totale + macro totali, il **server** divide per le porzioni, applica clamp in stile
  MIN/MAX_PLAUSIBLE_KCAL e il sanity check `4·prot + 4·carb + 9·grassi ≈ kcal`.
- Vincoli numerici nel prompt + clamp server, **mai** nello schema JSON (`minimum`/`maximum`
  → 400).
- Copertura display: dettaglio ricetta (riga nutrizionale: kcal/porz, ≈ peso porzione,
  kcal/100g, P/C/G), form (campi manuali), planner (totali giornalieri kcal + macro).
- kcal e macro **non** entrano nella lista della spesa (scelta già documentata in CLAUDE.md).
- Nessuna migrazione: le ricette esistenti semplicemente non hanno i nuovi campi.

## 4. Design proposto

### 4.a Modello dati

Nuovo tipo esportato in `src/types/index.ts` (sopra `Recipe`):

```ts
/**
 * Macronutrienti stimati per UNA porzione, in grammi.
 *
 * Sempre il trio completo: una stima parziale (solo proteine, ecc.) non è esprimibile
 * né persistibile — o tutti e tre o il campo è assente. 0 è un valore legittimo
 * (es. 0 g di grassi): i gate di visualizzazione devono usare `!= null`, mai truthiness.
 */
export interface MacrosPerServing {
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
}
```

`Recipe` (`src/types/index.ts`, subito dopo `caloriesPerServing` riga 227) — prima:

```ts
  caloriesPerServing?: number;

  notes?: string;
```

dopo:

```ts
  caloriesPerServing?: number;

  /**
   * Peso stimato di UNA porzione della ricetta PRONTA, in grammi (AI o manuale).
   * Per porzione per lo stesso motivo di caloriesPerServing. kcal/100g si deriva
   * a render time: mai persistere valori derivati.
   */
  servingWeightGrams?: number;

  /** Macronutrienti stimati per UNA porzione (vedi MacrosPerServing). */
  macrosPerServing?: MacrosPerServing;

  notes?: string;
```

Le stesse due proprietà opzionali (stessi commenti abbreviati) vanno aggiunte a **entrambe**
le `ParsedRecipe`, dopo `caloriesPerServing`:
- `src/types/index.ts:361`;
- `src/lib/utils/recipe-parser.ts:15` (qui `MacrosPerServing` va aggiunto all'import da
  `@/types` alla riga 2).

Nessuna nuova collection, regola o indice Firestore: i campi vivono sui documenti `recipes`
esistenti (e dentro `meal_plans.slots[].newRecipe` per i piani legacy, dove semplicemente
non ci saranno).

### 4.b Route `/api/estimate-calories`

Request **invariata**: `{ recipeTitle: string, ingredients: {name, quantity}[],
servings: number }`. Response estesa:

```ts
{
  success: true,
  caloriesPerServing: number | null,
  servingWeightGrams: number | null,          // per porzione, derivato dal server
  macrosPerServing: MacrosPerServing | null,  // per porzione, derivato dal server
  confidence: 'alta' | 'media' | 'bassa',
}
```

**Prompt attuale verbatim** (`route.ts:51-73`, template literal; `ingredientList` =
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

**Prompt proposto** (la funzione si rinomina `createNutritionEstimationPrompt`; per kcal la
staging "totale poi dividi" resta al modello com'è oggi; per peso e macro il modello produce
**totali** e la divisione la fa il server — total-first anche qui, ma con un grado in più di
protezione dall'errore tipico "divisione saltata"):

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

**Schema attuale verbatim** (`route.ts:82-97`):

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

**Schema proposto** (rinominato `NUTRITION_ESTIMATION_SCHEMA`; SOLO forma e tipi — niente
`minimum`/`maximum`/`multipleOf`, che fanno fallire l'intera richiesta con 400):

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

**`max_tokens`: 900 → 1400.** Motivazione: con `thinking: adaptive` i token di ragionamento
contano dentro `max_tokens`; il lavoro aritmetico quadruplica (kcal + 3 macro + peso per
ogni ingrediente) e il JSON di output cresce di ~10 campi. 1400 dà headroom senza costo
aggiuntivo a riposo (i token di output si pagano solo se prodotti). `thinking: adaptive` +
`output_config.effort: 'low'` restano invariati; mai `temperature`/`top_p`/`top_k`/
`budget_tokens` (400 su Sonnet 5).

**Derivazione e clamp server-side.** Estrarre la logica pura in un nuovo modulo
`src/lib/utils/nutrition-estimate.ts` (testabile con Jest senza montare la route):

```ts
import { MacrosPerServing } from '@/types';

/** Sotto: guarnizione o errore. Sopra: quasi certamente un totale non diviso. */
export const MIN_PLAUSIBLE_KCAL = 20;
export const MAX_PLAUSIBLE_KCAL = 3000;

/** Peso plausibile di UNA porzione pronta: sotto i 30 g è una guarnizione,
 *  sopra 1,5 kg è quasi certamente il peso dell'intera ricetta non diviso. */
export const MIN_PLAUSIBLE_SERVING_WEIGHT_G = 30;
export const MAX_PLAUSIBLE_SERVING_WEIGHT_G = 1500;

/** Nessun macro per porzione supera plausibilmente questo tetto. */
export const MAX_PLAUSIBLE_MACRO_G = 300;

/** Tolleranza del check di Atwater 4p+4c+9g ≈ kcal: ±30%.
 *  Copre fibra, alcol, arrotondamenti e tabelle nutrizionali divergenti;
 *  oltre, i macro sono incoerenti con le kcal e vanno scartati (kcal preservate). */
export const MACRO_KCAL_TOLERANCE = 0.3;

export interface DerivedNutrition {
  caloriesPerServing: number | null;
  servingWeightGrams: number | null;
  macrosPerServing: MacrosPerServing | null;
}

/**
 * Deriva i valori per-porzione dal payload grezzo del modello (totali) e applica
 * i clamp di plausibilità. Ogni campo degrada a null indipendentemente; i macro
 * richiedono kcal plausibili perché senza kcal il check di coerenza è impossibile.
 */
export function deriveNutritionPerServing(raw: unknown, servings: number): DerivedNutrition {
  const estimate = (raw ?? {}) as Record<string, unknown>;

  // kcal: identico a oggi (il modello divide, il server valida 20-3000)
  const rawCalories = estimate.caloriesPerServing;
  const caloriesPerServing =
    typeof rawCalories === 'number' &&
    Number.isFinite(rawCalories) &&
    rawCalories >= MIN_PLAUSIBLE_KCAL &&
    rawCalories <= MAX_PLAUSIBLE_KCAL
      ? Math.round(rawCalories)
      : null;

  // Peso: il modello dà il totale, il server divide e valida il per-porzione
  let servingWeightGrams: number | null = null;
  const rawWeight = estimate.totalWeightGrams;
  if (typeof rawWeight === 'number' && Number.isFinite(rawWeight)) {
    const perServing = rawWeight / servings;
    if (perServing >= MIN_PLAUSIBLE_SERVING_WEIGHT_G && perServing <= MAX_PLAUSIBLE_SERVING_WEIGHT_G) {
      servingWeightGrams = Math.round(perServing);
    }
  }

  // Macro: totale → per porzione, poi bound [0, 300] e check di Atwater vs kcal.
  // Se il check fallisce: macro null, kcal preservate (l'errore più probabile è nei macro).
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

La route sostituisce il blocco righe 170-185 con:

```ts
const estimate = JSON.parse(responseText);
const derived = deriveNutritionPerServing(estimate, servingsCount);

return NextResponse.json({
  success: true,
  ...derived,
  confidence: estimate.confidence ?? 'bassa',
});
```

`MIN_PLAUSIBLE_KCAL`/`MAX_PLAUSIBLE_KCAL` locali alla route (righe 24-28) vengono rimossi
(vivono ora in `nutrition-estimate.ts`). Guardie di input (recipeTitle/ingredients/servings)
invariate. `confidence` continua a essere restituita e ignorata dai client (nessuna
provenienza AI-vs-manuale sui campi salvati: mostrarla suggerirebbe una affidabilità
per-campo che non abbiamo — resta fuori dalla UI).

### 4.c Client — wrapper e hook

**`getAICalorieEstimateForRecipe` → `getAINutritionEstimateForRecipe`**
(`src/lib/utils/recipe-parser.ts:579-618`). Nuova firma:

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

Comportamento: stesso guard `!servings || servings < 1` → `null`; stessa fetch; su risposta
ok legge i tre campi validando i tipi (`typeof x === 'number'` per i numeri; per
`macrosPerServing` verifica che sia un oggetto con i tre numeri finiti, altrimenti `null`);
su errore/HTTP non-ok → `null` (invariato: tutti i fallimenti degradano a null, mai throw).
Il vecchio nome sparisce; i due call site (`assistente-ai/page.tsx:14,166` e
`useEstimateCalories.ts:7,31`) si aggiornano.

**`enrichRecipesWithAI`** (`assistente-ai/page.tsx:157-176`) — il return diventa:

```ts
const [suggestion, nutrition] = await Promise.all([
  getAISuggestionForRecipe(...),                                    // invariato
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

Sempre **una** chiamata AI per ricetta per la nutrizione: il costo dell'enrichment resta
1 + 2N.

**`useEstimateCalories` → `useEstimateNutrition`** (rinominare il file in
`src/lib/hooks/useEstimateNutrition.ts`). La mutation diventa **fill-the-gaps**: scrive solo
i campi che la ricetta non ha ancora, così una ri-stima non sovrascrive mai un valore già
presente (in particolare kcal inserite a mano):

```ts
mutationFn: async (recipe: Recipe) => {
  if (!user) throw new Error('Autenticazione richiesta');

  const estimate = await getAINutritionEstimateForRecipe(
    recipe.title, recipe.ingredients, recipe.servings
  );

  // Solo i campi mancanti sulla ricetta E presenti nella stima.
  // ATTENZIONE: gate `== null`, mai truthiness — 0 g di grassi è legittimo.
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

`onSuccess`: se `updates === null` → toast info
`'Ingredienti troppo vaghi per una stima affidabile. Puoi inserire i valori a mano in modifica.'`
e nessuna invalidation; altrimenti invalida `['recipe', recipeId, user.uid]` +
`recipesQueryKey(user.uid)` e toast success:
- se `updates.caloriesPerServing != null` → `` `Stima: ${kcal} kcal a porzione` `` (copy attuale);
- altrimenti (solo campi nutrizionali completati) → `'Valori nutrizionali stimati'`.

`onError`: toast `'Impossibile stimare i valori nutrizionali in questo momento.'`.

### 4.d I tre siti di scrittura

1. **`handleSaveRecipe`** (`assistente-ai/page.tsx:373-397`) — dopo lo spread kcal esistente
   (riga 396, che resta com'è) aggiungere:
   ```ts
   ...(recipe.servingWeightGrams != null ? { servingWeightGrams: recipe.servingWeightGrams } : {}),
   ...(recipe.macrosPerServing != null ? { macrosPerServing: recipe.macrosPerServing } : {}),
   ```
2. **`saveNewRecipeToCookbook`** (`useMealPlanner.ts:524-546`) — stesse due righe dopo la 545.
3. **`RecipeForm`** — replica **esatta** del pattern kcal per ciascun nuovo campo:
   - **Stato stringa** (vuoto ≠ 0), accanto a `caloriesPerServing` (righe 72-74):
     ```ts
     const [servingWeightGrams, setServingWeightGrams] = useState(
       recipe?.servingWeightGrams != null ? String(recipe.servingWeightGrams) : ''
     );
     const [proteinGrams, setProteinGrams] = useState(
       recipe?.macrosPerServing != null ? String(recipe.macrosPerServing.proteinGrams) : ''
     );
     // idem carbsGrams, fatGrams
     ```
   - **Parse in `handleSubmit`** (accanto alle righe 425-430). Peso: come le kcal, `> 0`
     (0 g non è un peso). Macro: **`>= 0`** — qui 0 è legittimo:
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

     // MacrosPerServing è tutto-o-niente: un trio parziale non è persistibile.
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
   - **Create** (accanto alla riga 450):
     ```ts
     ...(parsedWeight !== null ? { servingWeightGrams: parsedWeight } : {}),
     ...(parsedMacros !== null ? { macrosPerServing: parsedMacros } : {}),
     ```
   - **Edit** (accanto alla riga 466 — `updateDoc` fa merge, il vuoto deve cancellare):
     ```ts
     ...(parsedWeight === null ? { servingWeightGrams: deleteField() } : {}),
     ...(parsedMacros === null ? { macrosPerServing: deleteField() } : {}),
     ```
   - **UI**: sotto la griglia numerica esistente (righe 524-566) un secondo blocco:
     ```tsx
     <div>
       <p className="mb-2 text-sm font-medium">Valori nutrizionali per porzione <span className="text-muted-foreground font-normal">(opzionali)</span></p>
       <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
         {/* 4 Input type=number: "Peso porz. (g)" min=1, "Proteine (g)" min=0,
             "Carboidrati (g)" min=0, "Grassi (g)" min=0 — tutti placeholder "—",
             id: recipe-serving-weight / recipe-protein / recipe-carbs / recipe-fat */}
       </div>
     </div>
     ```
     Stesso pattern responsive del blocco esistente (commento righe 522-523: 2 colonne su
     telefono, 4 da `sm`). Il campo kcal esistente resta dov'è.

### 4.e Display

**Dettaglio ricetta** (`recipe-detail.tsx`). La riga meta (79-135) resta invariata nella
struttura; lo slot kcal mantiene il suo gate attuale (kcal non può essere 0 per costruzione:
min server 20, form `> 0`). Cambiano:

1. Il label del ghost button: `Stima calorie` → `Stima valori nutrizionali` (e lo stato
   pending `Stimo le calorie…` → `Stimo i valori…`). Icona `Flame` invariata.
2. Condizione di visibilità del bottone (sostituisce l'attuale "solo se kcal assente"):
   ```ts
   const nutritionIncomplete =
     recipe.caloriesPerServing == null ||
     recipe.servingWeightGrams == null ||
     recipe.macrosPerServing == null;
   const canEstimate = hasIngredients && !!user && nutritionIncomplete;
   ```
   - Se `recipe.caloriesPerServing == null`: il bottone occupa lo slot kcal della riga meta,
     come oggi (righe 111-134).
   - Se le kcal ci sono ma `nutritionIncomplete`: il bottone compare in coda alla riga
     nutrizionale secondaria (sotto), stessa variante ghost/sm.
3. **Riga nutrizionale secondaria**, dentro lo stesso contenitore della riga meta (il div
   `mb-8 flex flex-wrap … border-b … pb-6`), come elemento a piena larghezza:
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
         /* ghost button "Stima valori nutrizionali" con spinner, come sopra */
       )}
     </div>
   )}
   ```
   Copy fissi: `1 porzione ≈ {n} g`, `{n} kcal/100 g`, `P {p} g · C {c} g · G {f} g`.
   Tutti i gate dei nuovi campi con `!= null` (0 g di grassi deve restare visibile). Solo
   token semantici (`text-muted-foreground`): dark mode gratis. Nessun hover-only: la riga è
   testo statico + bottone sempre visibile.

**Card ricetta** (`recipe-card.tsx`): **invariata** — solo kcal, per non affollare il footer.

**Anteprima estrazione** (`extracted-recipe-preview.tsx`, chip meta 116-143): dopo il chip
kcal (137-142) aggiungere due chip, gate `!= null`:

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

`Scale` si aggiunge all'import lucide esistente (riga 7).

**Planner** — vedi 4.f.

### 4.f Planner: `meal-plan-calories.ts` → nutrizione giornaliera

Il modulo resta `src/lib/utils/meal-plan-calories.ts` (nessun rename di file: git history e
import path stabili). `DayCalories`/`computeDayCalories`/`computeWeekCalories` vengono
**sostituiti** dalle versioni nutrizionali (unico consumer: `WeeklyCalendarGrid.tsx:6,57`;
i test si riscrivono). Tipi proposti:

```ts
/** Totale di una singola metrica con la semantica ≥ esistente (floor, non totale). */
export interface NutrientTotal {
  /** Somma per porzione sui filled slot del giorno che portano la metrica. */
  total: number;
  /** Slot la cui ricetta porta la metrica. */
  countedSlots: number;
  /** Filled slot saltati perché la metrica manca. */
  uncountedSlots: number;
  /** true quando almeno un filled slot non ha contribuito. */
  isPartial: boolean;
}

/**
 * Nutrizione giornaliera del planner.
 *
 * kcal e macro hanno contatori separati: una ricetta può avere le kcal ma non i macro
 * (tutte quelle create prima di questa spec), quindi lo stesso giorno può essere
 * completo per le kcal e parziale per i macro. I tre macro invece viaggiano insieme
 * (MacrosPerServing è tutto-o-niente), quindi condividono un solo set di contatori.
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

Implementazione: `readSlotCalories` (37-48) si generalizza in

```ts
function readSlotNutrition(slot: MealSlot, recipesById: Map<string, Recipe>): {
  caloriesPerServing: number | null;
  macrosPerServing: MacrosPerServing | null;
} | null
```

con la stessa risoluzione (ricetta salvata per id → `newRecipe` inline → `null` per slot
vuoto/ricetta cancellata); i campi si leggono con `?? null`. `computeDayNutrition` itera i
filled slot una volta sola e aggiorna entrambi i gruppi di contatori: per le kcal identico a
oggi; per i macro, `macrosPerServing != null` incrementa `countedSlots` e somma i tre
totali (un `fatGrams` a 0 **conta** come counted e somma 0), `null` incrementa
`uncountedSlots`. `computeWeekNutrition` identica a `computeWeekCalories` (solo
`activeDays`, giorni vuoti presenti con totali a 0). Come oggi, ogni slot contribuisce
**una** porzione (il per-persona arriva con Spec F).

**`WeeklyCalendarGrid.tsx`**: il memo (56-59) passa a `computeWeekNutrition`;
`renderDayCalories` (72-88) diventa `renderDayNutrition` e produce **due elementi
impilati**, kcal in evidenza e macro in riga secondaria:

```tsx
function renderDayNutrition(dayIndex: number, kcalClassName: string, macrosClassName: string) {
  const day = nutritionByDay.get(dayIndex);
  if (!day) return null;
  const { calories, macros } = day;
  const showKcal = calories.total !== 0;              // regola attuale invariata
  const showMacros = macros.countedSlots > 0;          // gate su countedSlots, NON su total:
                                                       // un giorno tutto-magro con G 0 resta visibile
  if (!showKcal && !showMacros) return null;

  return (
    <>
      {showKcal && (
        <span className={kcalClassName} title={/* tooltip attuale invariato */}>
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
- **Desktop** (header giorno, riga 126-130, colonna `minmax(150px, 1fr)`): kcal invariato
  (`block text-[11px] tabular-nums text-muted-foreground`), macro sotto come
  `block text-[10px] tabular-nums text-muted-foreground/80`. Il caso peggiore
  (`≥ P 182 · C 310 · G 95`, ~21 caratteri a 10px ≈ 110px) sta in 150px senza wrap.
- **Mobile portrait** (header giorno card, righe 184-190): kcal resta `ml-auto text-xs
  tabular-nums text-muted-foreground` dentro la riga del titolo; i macro vanno su una riga
  propria subito sotto l'header (`text-[11px] tabular-nums text-muted-foreground`, allineata
  a destra con `text-right`), prima di `space-y-2` dei pasti. Per farlo la firma con due
  className viene chiamata due volte o si spezza in due helper (`renderDayCalories` /
  `renderDayMacros`) — a discrezione dell'implementatore, purché il markup risultante sia
  quello descritto. I `title` tooltip restano (su touch non si aprono: sono informazione
  aggiuntiva, il testo con `≥` è autosufficiente).

Niente lista della spesa: nessuna modifica a `ingredient-aggregator.ts` o alle viste spesa.

### 4.g Edge case ed errori

1. **0 g legittimo**: i macro possono valere 0 (grassi in una macedonia). Tutti i gate dei
   nuovi campi usano `!= null`/`== null`. I gate truthy **esistenti** su
   `caloriesPerServing` (detail:106, card:110/125/126, preview:137) restano: 0 kcal è
   irraggiungibile per costruzione (server min 20, form `> 0`).
2. **Divisione saltata dal modello (peso)**: il modello dà il totale per contratto; il
   server divide sempre. Se il modello restituisse già un per-porzione, il clamp
   `30–1500 g` sul risultato della divisione scarta i casi assurdi (per-porzione/servings
   con servings ≥ 2 scende quasi sempre sotto 30 g → null, fail-safe).
3. **Atwater fallito**: macro incoerenti con le kcal (oltre ±30%) → `macrosPerServing: null`,
   kcal e peso preservati. Mai errore HTTP: null è un esito di successo.
4. **kcal null ma peso plausibile**: il peso passa (nullabilità indipendente); kcal/100g non
   si deriva (serve la coppia). Macro con kcal null → sempre null (check impossibile).
5. **Trio macro parziale nel form**: submit bloccato con toast
   `'Per i macronutrienti compila tutti e tre i campi (anche 0) oppure lasciali vuoti'`.
6. **Svuotare i campi in edit**: `deleteField()` per `servingWeightGrams` e
   `macrosPerServing` (updateDoc fa merge: omettere la chiave lascerebbe il valore vecchio).
7. **Ri-stima con valori parziali**: la mutation scrive solo i campi mancanti — un valore
   manuale non viene mai sovrascritto. Se il modello non riesce a stimare proprio i campi
   mancanti → toast info, nessuna scrittura.
8. **`servingWeightGrams` a 0 in Firestore** (non producibile dai nostri flussi ma
   difensivo): il derivato kcal/100g richiede `> 0` (niente divisione per zero).
9. **Ricette esistenti / piani legacy con `newRecipe` inline**: campi assenti → riga
   nutrizionale non renderizzata, planner macro `uncountedSlots`, nessuna migrazione.
10. **`servings` modificato dopo la stima**: i valori restano per-porzione quindi
    formalmente corretti, ma la stima può diventare stantia — comportamento identico alle
    kcal oggi, documentato e accettato (nessun ricalcolo automatico).
11. **Risposta AI malformata** (macro non-oggetto, numeri non finiti): `deriveNutritionPerServing`
    e il wrapper client validano i tipi campo per campo e degradano a null.
12. **`JSON.parse` che lancia** (route): già coperto dal catch esistente → 500 con messaggio
    generico, il client degrada a null. Invariato.

## 5. Piano di implementazione a fasi

Ogni fase lascia il progetto compilabile (`npx tsc --noEmit`).

**Fase 1 — Tipi (additiva)**
- `src/types/index.ts`: nuovo `export interface MacrosPerServing`; `servingWeightGrams?` e
  `macrosPerServing?` su `Recipe` (dopo riga 227) e su `ParsedRecipe` (dopo riga 361).
- `src/lib/utils/recipe-parser.ts`: stessi due campi sulla `ParsedRecipe` locale (dopo riga
  15) + import `MacrosPerServing`.

**Fase 2 — Server**
- Nuovo `src/lib/utils/nutrition-estimate.ts` (costanti + `deriveNutritionPerServing`).
- `src/app/api/estimate-calories/route.ts`: prompt esteso, schema esteso, `max_tokens` 1400,
  derivazione via `deriveNutritionPerServing`, response estesa; rimozione costanti locali.

**Fase 3 — Wrapper client, hook, dettaglio**
- `src/lib/utils/recipe-parser.ts`: `getAICalorieEstimateForRecipe` →
  `getAINutritionEstimateForRecipe` + `RecipeNutritionEstimate`.
- `src/lib/hooks/useEstimateCalories.ts` → `src/lib/hooks/useEstimateNutrition.ts`
  (fill-the-gaps, nuovi toast).
- `src/app/(dashboard)/assistente-ai/page.tsx`: import e `enrichRecipesWithAI` (spread `!= null`).
- `src/components/recipe/recipe-detail.tsx`: label bottone, `nutritionIncomplete`, riga
  nutrizionale secondaria.

**Fase 4 — Siti di scrittura e form**
- `assistente-ai/page.tsx` (`handleSaveRecipe`): due spread nuovi.
- `src/lib/hooks/useMealPlanner.ts` (`saveNewRecipeToCookbook`): due spread nuovi.
- `src/components/recipe/recipe-form.tsx`: 4 stati stringa, parse + validazione trio,
  spread create, `deleteField()` edit, blocco UI "Valori nutrizionali per porzione".
- `src/components/recipe/extracted-recipe-preview.tsx`: due chip nuovi + import `Scale`.

**Fase 5 — Planner**
- `src/lib/utils/meal-plan-calories.ts`: `NutrientTotal`, `DayNutrition`,
  `computeDayNutrition`, `computeWeekNutrition` (rimozione dei vecchi export).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: memo + render kcal/macro
  desktop e mobile.
- `src/lib/utils/meal-plan-calories.test.ts`: riscrittura sui nuovi export (vedi §6).

**Fase 6 — Test nuovi, build, docs**
- `src/lib/utils/nutrition-estimate.test.ts` (nuovo).
- `npm test`, `npx next build --webpack`.
- CLAUDE.md (Recent Changes + sezione Calories), AGENTS.md (eventuali gotcha emersi),
  checklist in `specs/00-roadmap.md`.

## 6. Piano di test

### Unit (Jest — comando reale: `npm test`, script `"test": "jest"` in package.json)

**Nuovo `src/lib/utils/nutrition-estimate.test.ts`** su `deriveNutritionPerServing`:
- kcal plausibili passano, fuori 20–3000 → null (parità col comportamento attuale);
- peso: totale/servings dentro 30–1500 → arrotondato; totale che produce per-porzione
  fuori bound → null; `totalWeightGrams` null/non numerico → null; kcal null non blocca il peso;
- macro: trio coerente (es. kcal 600, P 30/C 60/G 20 → Atwater 580, entro ±30%) → passa
  con arrotondamenti; trio incoerente (Atwater fuori ±30%) → macro null e kcal preservate;
  macro negativa → null; macro per-porzione > 300 → null; kcal null → macro null anche se
  plausibili; `fatGrams` totale 0 con resto coerente → passa con `fatGrams: 0`;
- payload malformato (`totalMacros` stringa, campi mancanti) → tutti i derivati coerenti
  con null, nessun throw.

**`src/lib/utils/meal-plan-calories.test.ts` riscritto** su
`computeDayNutrition`/`computeWeekNutrition`, preservando gli scenari attuali (somma
completa, giorno parziale, `newRecipe` inline, ricetta cancellata, giorno vuoto, giorni di
altri slot, entry per activeDays, esclusione giorni rimossi) più:
- ricetta con kcal ma senza macro → `calories.isPartial false`, `macros.isPartial true`;
- ricetta con `macrosPerServing.fatGrams: 0` → `macros.countedSlots` incrementato e
  `fatTotal` 0 (il gate non è truthy);
- fixture `makeRecipe` estesa con `servingWeightGrams`/`macrosPerServing` opzionali via
  spread condizionale (stesso stile della riga 15 attuale).

### Collaudo guidato (Playwright + emulatori, script usa-e-getta in `e2e/scratch/`)

Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` (vedi
"Guided testing tooling" in CLAUDE.md). Dati seed via script throwaway con spy words.

- **Fase A — form manuale (senza AI)**: creare una ricetta con kcal 500, peso 350,
  P 30/C 55/G 18; assert su Firestore emulato che il documento contenga i tre campi con la
  forma giusta; aprire il dettaglio e verificare la riga nutrizionale
  (`1 porzione ≈ 350 g`, `143 kcal/100 g`, `P 30 g · C 55 g · G 18 g`).
- **Fase B — trio parziale**: compilare solo Proteine → submit bloccato, toast atteso.
- **Fase C — svuotamento in edit**: svuotare peso e macro, salvare, assert che i campi
  siano spariti dal documento (deleteField).
- **Fase D — 0 g visibile**: macro con G 0 → la riga del dettaglio mostra `G 0 g`.
- **Fase E — planner**: piano con 2 ricette (una con macro, una senza) → header giorno
  mostra kcal e `≥ P … · C … · G …`; giorno con sole ricette senza stima → nessuna riga.
- **Fase F — stima AI reale** (opzionale, richiede `ANTHROPIC_API_KEY` e utente non
  test@test.com): dettaglio di una ricetta con soli ingredienti → "Stima valori
  nutrizionali" → i quattro campi compaiono; ripetere su una ricetta con kcal manuali →
  le kcal NON cambiano, gli altri campi si riempiono.

Gli script di scratch si eliminano a fine collaudo (protocollo guided-testing).

## 7. Gotcha e vincoli (puntuali)

- **Mai `undefined` su Firestore** (CLAUDE.md "Firebase", AGENTS.md Quick Reference
  "Firebase optional"): spread condizionale in create, `deleteField()` in edit.
- **Campo numerico opzionale come stringa nello stato** (AGENTS.md: "Campo numerico
  opzionale come `number` nello stato"): vuoto ≠ 0; in `updateDoc` il vuoto diventa
  `deleteField()` perché il merge lascerebbe il valore precedente.
- **`json_schema` senza vincoli numerici** (AGENTS.md: "`json_schema` con vincoli di
  lunghezza"): niente `minimum`/`maximum`/`minItems` → 400 sull'intera richiesta con sintomo
  ingannevole (il client degrada a null e la feature sembra "non funzionare"). Bound nel
  prompt + clamp server.
- **Parametri Sonnet 5 → 400** (AGENTS.md): mai `temperature`/`top_p`/`top_k`/
  `budget_tokens`; `thinking: adaptive` + `output_config.effort: 'low'` restano; modello solo
  via `AI_MODEL`.
- **kcal totali invece che per porzione** (AGENTS.md): tutto ciò che si persiste è
  per-porzione; i totali (e kcal/100g) si derivano a render time.
- **Truthiness ban sui nuovi campi**: `fatGrams: 0` e `proteinGrams: 0` sono legittimi —
  gate `!= null` ovunque (dettaglio, preview, planner via `countedSlots`). I gate truthy
  esistenti su kcal restano validi solo perché 0 kcal è irraggiungibile.
- **React Query**: ogni write invalida `['recipe', id, uid]` + `recipesQueryKey(uid)`
  (pattern già in `useEstimateCalories.ts:54-55` e `recipe-form.tsx:472-475`); niente
  `onSnapshot`; `enabled: !!user` sulle query auth-bound (nessuna query nuova in questa spec).
- **Validazioni con `react-hot-toast`, mai `alert()`** (CLAUDE.md "Confirmations and touch"):
  il blocco del trio parziale usa `toast.error`. Nessuna azione distruttiva nuova → nessun
  `ConfirmDialog` necessario.
- **Token semantici, mai `bg-white`/palette raw** (AGENTS.md §6): la riga nutrizionale e i
  chip usano `text-muted-foreground`/`tabular-nums`; dark mode gratis.
- **Controlli mai solo `group-hover` sotto `lg`** (AGENTS.md): il bottone "Stima valori
  nutrizionali" è sempre visibile; i `title` tooltip del planner sono informazione
  ridondante, non l'unico canale (il testo `≥` è autosufficiente).
- **Niente nuovo target di persistenza debounced**: tutte le scritture di questa spec sono
  one-shot (`updateRecipe`/`createRecipe`), quindi il gotcha `flushAll()` di
  `useShoppingList` non si applica — citato per completezza: NON introdurre scritture
  debounced qui.
- **Build**: validare con `npx tsc --noEmit` + `npx next build --webpack` (niente
  `next lint`, rimosso in Next 16); `spawn EPERM` in sandbox → rilanciare fuori sandbox.

## 8. Fuori scope

- Lista della spesa: kcal e macro esclusi per scelta documentata (nessuna modifica ad
  `ingredient-aggregator.ts` o alle viste spesa).
- `confidence` in UI: continua a non essere mostrata (nessuna provenienza per-campo
  AI-vs-manuale su cui fondarla).
- Migrazione/backfill delle ricette esistenti; ricalcolo automatico quando cambiano
  `servings` o ingredienti (staleness identica alle kcal oggi).
- Scaling per persona nel planner (`servingsPlanned`, varianti): Spec F.
- Card ricetta: nessun campo nutrizionale oltre le kcal attuali.
- Cooking mode: nessuna visualizzazione nutrizionale durante la cottura.
- Peso/macro per singolo ingrediente o parsing deterministico delle quantità in grammi
  (le quantità restano stringhe libere end-to-end).
- Modifiche a `extract-recipes`/`format-recipe`/`chat-recipe`/`suggest-category`.

## 9. Prompt di implementazione

```markdown
Implementa la Spec C (nutrizione completa) di "Il Mio Ricettario".

1. Leggi e applica integralmente: CLAUDE.md, AGENTS.md, COMMENTS.md e
   DEVELOPMENT_GUIDELINES.md (root del repo). Sono vincolanti su pattern Firestore
   (mai undefined, deleteField in edit), React Query, token semantici, toast/ConfirmDialog
   e stile dei commenti.
2. Leggi PER INTERO specs/00-roadmap.md (contratto condiviso: il contratto cross-spec 4
   definisce i nomi esatti dei campi) e poi specs/spec-c-nutrizione.md (questa spec):
   contiene tipi esatti, prompt e schema della route, clamp server, condizioni di
   visibilità e copy in italiano. Non deviare dai nomi di campi/moduli/tipi lì definiti.
3. Crea il branch feature/nutrition-macros da develop.
4. Implementa fase per fase seguendo §5 della spec (6 fasi). Dopo OGNI fase esegui
   `npx tsc --noEmit` e correggi prima di proseguire.
5. Test: esegui `npm test` (lo script reale in package.json è "test": "jest") — devono
   passare sia i test riscritti di meal-plan-calories sia i nuovi di nutrition-estimate.
6. A fine lavoro: `npx next build --webpack`. Se fallisce con `spawn EPERM` è un limite
   del sandbox, non un errore del codice: rilancia la build fuori sandbox.
7. Aggiorna: CLAUDE.md (sezione "Recent Changes" + sezione "Calories" con i nuovi
   invarianti), AGENTS.md (solo se emergono gotcha nuovi da >30min di debug) e la
   checklist "Stato" in specs/00-roadmap.md (spunta Spec C).
8. NON committare MAI senza OK esplicito dell'utente (regola di sessione: un branch/un
   commit per sessione, commit solo dopo approvazione).
9. Al termine proponi all'utente un collaudo guidato fase-per-fase secondo §6 della spec
   (Playwright + emulatori Firebase, script usa-e-getta in e2e/scratch/, protocollo
   guided-testing in CLAUDE.md), dichiarando in anticipo l'esito atteso di ogni fase.
```

## 10. Modello e effort consigliati

Sonnet · effort high — pattern gia' esistenti da replicare (kcal), ma tanti punti di contatto: route, due ParsedRecipe, due converter di salvataggio, form, dettaglio, planner.
