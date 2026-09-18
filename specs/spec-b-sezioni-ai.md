# Spec B — Ingredient/method sections: diagnosis and complete fix

> Notes covered: 8 (AI sections + reorganization of existing recipes) | Dependencies: none | Branch: `feature/ai-recipe-sections`

## 1. Goal

Today recipes generated or formatted by the AI almost always come out "flat" (no sections), even when the dish has logically distinct components (dough + filling, pasta + ragù, base + cream). When sections do arrive, the parser silently loses part of them (names that don't start with "per ") and the renderer scrambles their order (alphabetical sort on ingredients). After this spec:

1. the parser recognizes **any** section name after `## Ingredienti ` / `## Procedimento ` (with or without "per"), keeping the bare `## Ingredienti` behavior → null section;
2. `chat-recipe` and `format-recipe` have a **prescriptive** rule: distinct components → mandatory sections, with names consistent between ingredients and method; `extract-recipes` stays faithful to the source;
3. sections are shown in **order of first appearance** (document), not alphabetically;
4. a new `POST /api/reorganize-recipe` route + an "Organizza in sezioni" button on the recipe detail page make it possible to reorganize flat recipes already saved, without touching text or ids (zero risk for active `cooking_sessions` and `{{qty:id}}` tokens).

## 2. Current state (diagnosis verified against the code)

### 2.1 Prompts — why recipes come out flat

**(a) `CHAT_SYSTEM_PROMPT`** (`src/app/api/chat-recipe/route.ts:38-105`) contains NO prescriptive rule about sections. The only mentions are two descriptive parentheticals in the template (lines 65-67 and 75-77):

```
*(Se la ricetta ha più sezioni di ingredienti, usa:)*
## Ingredienti per [nome sezione]
- [Ingrediente, quantità]
```

```
*(Se la ricetta ha più sezioni di procedimento, usa:)*
## Procedimento per [nome sezione]
- [Passo]
```

The `REGOLE PER LE RICETTE:` block (lines 88-105) lists 15+ rules on ingredient format, `[ING:n]`/`[QTY:n]`/`[DUR:N]`, decimals, markdown — and **zero** rules about sections. A model generating a lasagna from scratch has no instruction to decompose it: the flat form is the default attractor.

**(b) `FORMAT_RECIPE_PROMPT`** (`src/app/api/format-recipe/route.ts:30-129`) has rule §4 (lines 98-101):

```
### 4. SEZIONI MULTIPLE
- Se la ricetta ha componenti distinti (es: pasta fresca + ragù + besciamella), crea sezioni separate
- Usa ESATTAMENTE i nomi delle sezioni come forniti dall'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")
```

but the template (lines 38-52) shows the flat form **first** and the sectioned one only as a parenthetical, so the rule is weak and the flat form remains the default.

**(c) `EXTRACTION_PROMPT`** (`src/app/api/extract-recipes/route.ts:26-157`) is correctly faithful to the source: §3 (lines 91-98) requires copying section names EXACTLY, with explicit correct examples `"La pasta"`, `"Il ragù"` (line 97). It must not be touched: it must not invent sections the PDF doesn't have.

### 2.2 Parser BUG — non-"per" sections silently dropped

`src/lib/utils/recipe-parser.ts:78-84` (ingredients):

```ts
if (line.startsWith('## Ingredienti')) {
  currentSection = 'ingredients';
  // Extract section name (e.g., "## Ingredienti per la pasta" -> "Per la pasta")
  const sectionMatch = line.match(/##\s+Ingredienti(?:\s+(per\s+.+))?$/i);
  currentIngredientSection = capitalizeSectionName(sectionMatch?.[1] || null);
  continue;
}
```

and `recipe-parser.ts:86-99` (method):

```ts
if (line.startsWith('## Procedimento')) {
  currentSection = 'steps';
  const sectionMatch = line.match(/##\s+Procedimento(?:\s+(per\s+.+))?$/i);
  const newStepSection = capitalizeSectionName(sectionMatch?.[1] || null);

  if (newStepSection !== currentStepSection) {
    sectionOrder++;
    currentSectionOrder = sectionOrder;
  }

  currentStepSection = newStepSection;
  continue;
}
```

The capture group `(per\s+.+)` accepts ONLY names starting with "per ". But `EXTRACTION_PROMPT` §3 orders preserving `"La pasta"` / `"Il ragù"`: if the model obeys and emits `## Ingredienti La pasta`, the optional group fails **and the `$` anchor makes the whole regex fail** → `sectionMatch` is `null` → section `null`. The line is consumed anyway by `startsWith('## Ingredienti')`, so the section **disappears without an error**: the items end up in the flat group. The prompt↔parser contract is broken today.

`capitalizeSectionName` (`recipe-parser.ts:420-429`) already has the non-"per" branch (`return sectionName;`) but it is dead code, because the capture never produces names without "per".

### 2.3 Render ordering — asymmetric and lossy

**Ingredients** (`src/components/recipe/ingredient-list-collapsible.tsx:74-79`): named sections are re-sorted **alphabetically**, losing document order:

```ts
groupedIngredients.sort((a, b) => {
  if (a.section === null) return -1; // Null section first
  if (b.section === null) return 1;
  return a.section.localeCompare(b.section); // Alphabetical
});
```

**Steps** (`src/components/recipe/steps-list-collapsible.tsx:104-114`): document order is preserved via `sectionOrder`, but the fallback for steps without `sectionOrder` (created from the form: `addStep` at `recipe-form.tsx:272-277` creates `{ ..., section: '', duration: null }` with no `sectionOrder` key) is `999` → all sections added by hand end up at the bottom in random order:

```ts
const orderA = a.steps[0]?.sectionOrder ?? 999;
const orderB = b.steps[0]?.sectionOrder ?? 999;
```

### 2.4 Form round-trip — phantom "Ingredienti" section

On load the form renames the null section to `'Ingredienti'` (`recipe-form.tsx:245`) and on save it persists **any** non-empty name, including the default (`recipe-form.tsx:409-421`):

```ts
if (section.name && section.name.trim()) {
  newIngredient.section = section.name;
} else {
  delete newIngredient.section; // Explicit removal for clarity
}
```

So a flat recipe edited in the form ends up with `section: "Ingredienti"` on every ingredient: a truthy string the renderer does NOT normalize → a superfluous collapsible "Ingredienti" header appears. This spec does not migrate data, but the gating of the "Organizza in sezioni" button (§4.5) must treat this state as "no sections".

### 2.5 No AI restructuring capability

The API surface is `chat-recipe`, `estimate-calories`, `extract-recipes`, `format-recipe`, `suggest-category` (`ls src/app/api`). No route accepts an existing structured recipe. The architectural precedent for "separate enrichment pass on an existing recipe" is `estimate-calories` (`src/app/api/estimate-calories/route.ts`) with its hook `useEstimateCalories` (`src/lib/hooks/useEstimateCalories.ts`) and the client helper `getAICalorieEstimateForRecipe` (`recipe-parser.ts:579-618`).

### 2.6 Downstream dependencies of `ingredient.section`

- Shopping list: `buildContributions` copies `section: ing.section ?? null` (`src/lib/utils/ingredient-aggregator.ts:45`); `aggregateIngredients` uses "first encountered section value for the group" as `ShoppingItem.section`; `useShoppingList` sorts by section (`src/lib/hooks/useShoppingList.ts:370-381`, null last) and derives `sectionNames` (lines 386+); the null section is labeled `'Senza categoria'` (`src/components/shopping-list/ShoppingListContent.tsx:31`).
- Global step numbering: counter `let globalStepNumber = 0` incremented during render, even in collapsed sections (`steps-list-collapsible.tsx:174,194,320`); collapsed content stays mounted (`grid-rows-[0fr]`).
- `cooking_sessions` persist `checkedSteps`/`checkedIngredients` by item **id**; steps contain `{{qty:ingredientId}}` tokens resolved against the current ids.

## 3. Product decisions (from the roadmap, binding — cross-spec contract 6)

1. Parser: the regex is widened to capture **any** name after `## Ingredienti ` / `## Procedimento ` (with and without "per"), preserving bare `## Ingredienti` → null section.
2. Prompts: `chat-recipe` and `format-recipe` gain a **prescriptive** rule ("if the dish has logically distinct components you MUST create sections"); `extract-recipes` stays faithful to the source (does not invent sections).
3. Ordering: ingredient sections in **order of first appearance** in the array (no alphabetical sort); the fallback for steps without `sectionOrder` also becomes order of first appearance. No new field on `Ingredient`, no migration.
4. New route `POST /api/reorganize-recipe`: receives the structured recipe (ids + text), returns **only the section assignment** keyed on the existing ids (`ingredientId → section`, `stepId → section + sectionOrder`). Does not touch text or ids.
5. UI: "Organizza in sezioni" button on the recipe detail page, preview in a Dialog, confirm → `updateRecipe`, toasts for the outcomes.

## 4. Proposed design

### 4.1 Parser: widened regex and `capitalizeSectionName`

**Current regex (verbatim, `recipe-parser.ts:81` and `:89`):**

```ts
/##\s+Ingredienti(?:\s+(per\s+.+))?$/i
/##\s+Procedimento(?:\s+(per\s+.+))?$/i
```

**Proposed regex:**

```ts
/^##\s+Ingredienti(?:\s+(.+?))?[\s:]*$/i
/^##\s+Procedimento(?:\s+(.+?))?[\s:]*$/i
```

Rationale: lazy `(.+?)` captures any name; `[\s:]*$` absorbs trailing spaces and an optional closing `:` (the model sometimes emits `## Ingredienti per la crema:`); the group stays optional → bare `## Ingredienti` captures nothing → `sectionMatch[1]` is `undefined` → null section, as today. The `^` anchor is harmless (lines are already trimmed at `recipe-parser.ts:47`) but makes the regex self-contained.

**Test case table (to implement in `recipe-parser.test.ts`):**

| Input line | Capture | Resulting section |
|---|---|---|
| `## Ingredienti` | — | `null` |
| `## Ingredienti ` (trailing space) | — | `null` |
| `## Ingredienti:` | — | `null` |
| `## Ingredienti per la pasta` | `per la pasta` | `Per la pasta` |
| `## Ingredienti La pasta` | `La pasta` | `La pasta` |
| `## Ingredienti Il ragù` | `Il ragù` | `Il ragù` |
| `## Ingredienti per l'impasto` | `per l'impasto` | `Per l'impasto` |
| `## Ingredienti la farcitura` | `la farcitura` | `La farcitura` |
| `## Ingredienti per la crema:` | `per la crema` | `Per la crema` |
| `## Procedimento Il ragù` | `Il ragù` | `Il ragù` (and `sectionOrder` increments) |
| `## INGREDIENTI PER LA BASE` | — | line NOT recognized as a header: the `line.startsWith('## Ingredienti')` guard (`recipe-parser.ts:78` and `:86`) is **case-sensitive** and discards the all-caps variant BEFORE the (case-insensitive) regex is evaluated — true today and after the change; the guard stays unchanged |

**Updated `capitalizeSectionName`** (`recipe-parser.ts:420-429`). Current (verbatim):

```ts
function capitalizeSectionName(sectionName: string | null): string | null {
  if (!sectionName) return null;

  // If starts with "per " (any case), normalize to "Per " with capital P
  if (sectionName.toLowerCase().startsWith('per ')) {
    return 'Per' + sectionName.substring(3);
  }

  return sectionName;
}
```

Proposal: the non-"per" branch (now reachable) capitalizes the first letter, leaving the rest unchanged (names from PDFs already arrive capitalized because of the fidelity rule; lowercase ones from chat/format need normalizing):

```ts
function capitalizeSectionName(sectionName: string | null): string | null {
  if (!sectionName) return null;

  if (sectionName.toLowerCase().startsWith('per ')) {
    return 'Per' + sectionName.substring(3);
  }

  // Names without "per" ("La pasta", "il ragù"): first letter uppercase, rest unchanged
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}
```

No change to the `sectionOrder` logic (`recipe-parser.ts:92-98`) nor to `parseIngredientLine` (the section is passed as a parameter, `recipe-parser.ts:139`).

### 4.2 Prompts: prescriptive rule on chat and format (mirror convention)

**`CHAT_SYSTEM_PROMPT`** (`chat-recipe/route.ts`): append to the end of the `REGOLE PER LE RICETTE:` block (after line 105, `- Includi porzioni e tempi solo se sei ragionevolmente sicuro, altrimenti ometti`) these lines, in the prompt's style:

```
- SEZIONI - REGOLA IMPORTANTE: se il piatto ha componenti logicamente distinte (es: impasto + farcitura, pasta + condimento, base + crema, ripieno + salsa), DEVI dividere la ricetta in sezioni, usando "## Ingredienti per [nome componente]" e "## Procedimento per [nome componente]"
- I nomi delle sezioni devono essere COERENTI tra ingredienti e procedimento: se esiste "## Ingredienti per il ragù" deve esistere "## Procedimento per il ragù"
- Le ricette semplici a componente unica restano SENZA sezioni: usa "## Ingredienti" e "## Procedimento" semplici, senza nome
```

The parenthetical templates (lines 65-67, 75-77) stay unchanged: the form stays identical, only the prescriptiveness changes.

**`FORMAT_RECIPE_PROMPT`** (`format-recipe/route.ts:98-101`). Current §4 quoted verbatim in §2.1(b). Replacement proposal:

```
### 4. SEZIONI MULTIPLE - REGOLA IMPORTANTE
- Se la ricetta ha componenti logicamente distinte (es: impasto + farcitura, pasta fresca + ragù + besciamella, base + crema), DEVI creare sezioni separate sia per gli ingredienti sia per il procedimento, anche se il testo dell'utente non le separa esplicitamente
- I nomi delle sezioni devono essere COERENTI tra ingredienti e procedimento: se esiste "## Ingredienti per il ragù" deve esistere "## Procedimento per il ragù"
- Usa ESATTAMENTE i nomi delle sezioni come forniti dall'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")
- Le ricette semplici a componente unica restano SENZA sezioni: "## Ingredienti" e "## Procedimento" semplici
```

**`EXTRACTION_PROMPT`: NO changes** (fidelity to the source, product decision). The mirror convention documented in CLAUDE.md/AGENTS.md (orphan ingredients rule: "Keep the rule mirrored in both prompts") must be respected in reverse here: the prescriptive rule lives in chat + format and **deliberately NOT** in extract — the same scoping scheme as the family context (`AGENTS.md §7 "Family Context Scope"`). Document it in CLAUDE.md (Recent Changes) and in AGENTS.md §7 (next to the other scopes: "Family Context Scope", "Web Search & Vision Scope").

### 4.3 Render ordering: first appearance

**`ingredient-list-collapsible.tsx`** — replace the alphabetical sort (lines 74-79, quoted in §2.3) with a stable partition that preserves the `Map`'s insertion order (= order of first appearance in the flat array, which in turn preserves parse/document order):

```ts
// Null section first, then the named sections in order of first appearance
// in the array (the Map preserves insertion order = document order).
const nullGroups = groupedIngredients.filter(g => g.section === null);
const namedGroups = groupedIngredients.filter(g => g.section !== null);
const orderedGroups = [...nullGroups, ...namedGroups];
```

and use `orderedGroups` in the render. Update the "WHY ALPHABETICAL" comments (lines 49-57) and the file header (lines 20-23): the new rationale is "document order is preparation order — an alphabetical sort puts the cream before the base".

**`steps-list-collapsible.tsx`** — replace the `?? 999` fallback (lines 104-114) with the first-appearance index. The grouping `Map` already iterates in order of first appearance, so the index is recorded when converting to an array:

```ts
// Sort key: the parser's sectionOrder if present, otherwise the group's index of
// first appearance (same scale: both grow with document order).
const sortKeys = new Map<string | null, number>();
let insertionIndex = 0;
stepsBySection.forEach((steps, section) => {
  groupedSteps.push({ section, steps });
  sortKeys.set(section, steps[0]?.sectionOrder ?? insertionIndex);
  insertionIndex++;
});

groupedSteps.sort((a, b) => {
  if (a.section === null) return -1;
  if (b.section === null) return 1;
  return (sortKeys.get(a.section) ?? 0) - (sortKeys.get(b.section) ?? 0);
});
```

Note: `Array.prototype.sort` is stable (ES2019+), so with equal keys the order of appearance is kept. The current null-first comparator is kept identical. The global `globalStepNumber` counter is NOT touched: it keeps incrementing during render across collapsed sections (hard contract, `steps-list-collapsible.tsx:164-174`).

No change to `extracted-recipe-preview.tsx`: it already groups in the Map's insertion order.

### 4.4 New route `POST /api/reorganize-recipe`

**File**: `src/app/api/reorganize-recipe/route.ts`. Bearer auth via `requireAuthenticatedUser` (`src/lib/api/require-user.ts`), model via `AI_MODEL` (`src/lib/utils/constants.ts`), `thinking: { type: 'adaptive' }` + `output_config: { effort: 'low', format: { type: 'json_schema', schema } }` — same pattern as `estimate-calories/route.ts:146-162`. No `temperature`/`top_p`/`top_k`.

**Request body:**

```ts
{
  title: string;
  ingredients: { id: string; name: string; quantity: string }[];
  steps: { id: string; description: string }[];
}
```

Input validation: `title` non-empty string, `ingredients` non-empty array, `steps` non-empty array → otherwise 400 `{ error: 'Parametri mancanti: title, ingredients e steps sono richiesti' }`.

**Response JSON schema** (structured output — ONLY shape and types, NO `minItems`/`maximum`/`minLength`: they would return 400, see the `json_schema` gotcha in AGENTS.md):

```ts
const REORGANIZE_SCHEMA = {
  type: 'object',
  properties: {
    reorganizable: {
      type: 'boolean',
      description: 'true se la ricetta ha almeno 2 componenti logicamente distinte; false se è a componente unica.',
    },
    ingredientSections: {
      type: 'array',
      description: 'Assegnazione di OGNI ingrediente a una sezione. Vuoto se reorganizable è false.',
      items: {
        type: 'object',
        properties: {
          ingredientId: { type: 'string' },
          section: { type: 'string', description: 'Nome sezione, es. "Per la pasta".' },
        },
        required: ['ingredientId', 'section'],
        additionalProperties: false,
      },
    },
    stepSections: {
      type: 'array',
      description: 'Assegnazione di OGNI step a una sezione. Vuoto se reorganizable è false.',
      items: {
        type: 'object',
        properties: {
          stepId: { type: 'string' },
          section: { type: 'string' },
          sectionOrder: { type: 'integer', description: 'Ordine della sezione: 1 per la prima che compare nel procedimento, 2 per la seconda, ecc.' },
        },
        required: ['stepId', 'section', 'sectionOrder'],
        additionalProperties: false,
      },
    },
  },
  required: ['reorganizable', 'ingredientSections', 'stepSections'],
  additionalProperties: false,
} as const;
```

**Prompt** (function `createReorganizePrompt(title, ingredients, steps)`; ids are included verbatim so the model returns them keyed):

```
Analizza questa ricetta italiana e proponi una suddivisione in sezioni per componenti logicamente distinte.

**Ricetta:** ${title}

**Ingredienti (con id):**
${ingredients.map(i => `- [${i.id}] ${i.name}${i.quantity ? `, ${i.quantity}` : ''}`).join('\n')}

**Procedimento (con id, in ordine):**
${steps.map((s, idx) => `${idx + 1}. [${s.id}] ${s.description}`).join('\n')}

**Regole:**
- Una sezione = una componente logicamente distinta della ricetta (es: impasto + farcitura, pasta + ragù, base + crema + copertura).
- Proponi da 2 a 5 sezioni. Se la ricetta è a componente unica (non ci sono almeno 2 componenti chiaramente distinte), imposta reorganizable a false e lascia gli array vuoti: NON inventare divisioni artificiali.
- Nomi sezione brevi in italiano, preferibilmente nella forma "Per la/il/i/le [componente]" (es: "Per la pasta", "Per il ragù"). Prima lettera maiuscola.
- Usa ESATTAMENTE gli stessi nomi di sezione per ingredienti e procedimento: ogni sezione di ingredienti deve avere la sezione di procedimento corrispondente.
- Assegna OGNI ingrediente e OGNI step a una sezione, usando ESATTAMENTE gli id forniti tra parentesi quadre. Non inventare id, non ometterne.
- Rispetta la sequenza del procedimento: gli step di una stessa sezione sono in genere contigui. NON proporre sezioni che richiederebbero di riordinare gli step.
- sectionOrder: 1 per la sezione il cui primo step compare per primo nel procedimento, 2 per la successiva, ecc.
- Un ingrediente usato in più componenti va assegnato alla sezione dove viene usato per primo o in quantità maggiore.
```

**Call parameters**: `max_tokens: 3000` (output = JSON assignments only: ~20 tokens per item, a large recipe with 40 ingredients + 30 steps stays under 2000; 3000 leaves margin for the Sonnet 5 tokenizer).

**Server validation (after parsing the JSON):**

1. If `reorganizable === false` → response `{ success: true, reorganized: false }` (HTTP 200: "no sensible reorganization" is a legitimate outcome, not an error — same principle as the `null` of `estimate-calories`).
2. Discard assignments with unknown ids (not present in the input) and with an empty/non-string `section` (shared pure function, §4.6).
3. Recompute `sectionOrder` server-side, ignoring the model's: iterating the **original steps in the order received**, the first section encountered gets 1, the second 2, etc. (removes the dependency on the model's arithmetic; the field stays in the schema because it forces the model to reason about order, but the server is the authority).
4. Count the resulting distinct sections **on the ingredients** after cleanup: if `< 2` → `{ success: true, reorganized: false }` (a "reorganization" with a single section is the flat recipe with one extra header).
5. Positive response:

```ts
{
  success: true,
  reorganized: true,
  ingredientSections: { ingredientId: string; section: string }[],
  stepSections: { stepId: string; section: string; sectionOrder: number }[],
}
```

The route **does not touch text or ids and does not write to Firestore**: it only returns the proposal; persistence happens client-side after the user confirms (§4.5).

### 4.5 UI: "Organizza in sezioni" on the recipe detail page

**Button visibility** (`src/components/recipe/recipe-detail.tsx`). New pure utility `hasNamedSections(recipe)` (in `src/lib/utils/section-assignments.ts`, §4.6):

```ts
export function hasNamedSections(recipe: Pick<Recipe, 'ingredients' | 'steps'>): boolean {
  const ingredientSections = new Set(
    recipe.ingredients.map(i => i.section).filter((s): s is string => !!s)
  );
  const stepSections = new Set(
    recipe.steps.map(s => s.section).filter((s): s is string => !!s)
  );
  // The single "Ingredienti" section is the artifact of the form round-trip
  // (recipe-form.tsx:245 renames null → 'Ingredienti' on load and persists it
  // on save): it is equivalent to "no sections".
  const realIngredientSections =
    ingredientSections.size === 1 && ingredientSections.has('Ingredienti')
      ? 0
      : ingredientSections.size;
  return realIngredientSections > 0 || stepSections.size > 0;
}
```

Button render condition:

```ts
const canReorganize =
  !!user &&
  !hasNamedSections(recipe) &&
  recipe.ingredients.length >= 6 &&
  recipe.steps.length >= 4;
```

**Proposed threshold: ≥ 6 ingredients AND ≥ 4 steps.** Below that, a recipe doesn't have enough material for 2 components of at least 2-3 items each and the proposal would almost always come out `reorganized: false` (wasted AI call).

**Position**: in the Ingredients column of the grid (recipe-detail.tsx:137-141), between the `<h2>Ingredienti</h2>` and `<IngredientListCollapsible>`, with the same ghost pattern as the "Stima calorie" button (recipe-detail.tsx:104-134: `Button variant="ghost" size="sm"`, `className="h-auto gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"`, spinner + label while pending). Icon `ListTree` (lucide-react). The button is always visible when `canReorganize` (never `group-hover` only: touch-primary context).

```tsx
{canReorganize && (
  <Button type="button" variant="ghost" size="sm"
    disabled={reorganize.isPending}
    onClick={() => reorganize.mutate(recipe)}
    className="mb-3 h-auto gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
    {reorganize.isPending
      ? (<><Spinner size="sm" /> Analizzo la ricetta…</>)
      : (<><ListTree className="h-4 w-4" /> Organizza in sezioni</>)}
  </Button>
)}
```

**Hook `useReorganizeRecipe`** (`src/lib/hooks/useReorganizeRecipe.ts`, `useEstimateCalories` style): two mutations.

1. `propose` — calls the client helper `getAISectionProposalForRecipe(recipe)` (new, in `recipe-parser.ts` next to `getAICalorieEstimateForRecipe:579-618`, same pattern: `fetch('/api/reorganize-recipe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getFirebaseAuthHeader({ forceRefresh: true })) }, body })`). Outcomes:
   - `reorganized: false` → informational toast `toast('La ricetta è già ben organizzata così com\'è.', { icon: 'ℹ️' })`, no write;
   - `reorganized: true` → stores the proposal in local state and opens the preview Dialog;
   - network error/500 → `toast.error('Impossibile organizzare la ricetta in questo momento.')`.
2. `apply` — on confirmation in the Dialog: builds the new arrays with `applySectionAssignments` (§4.6), then `updateRecipe(recipe.id, { ingredients, steps })` (`src/lib/firebase/firestore.ts:125-133`), invalidates `['recipe', recipe.id, user.uid]` **and** `recipesQueryKey(user.uid)` (same invalidations as `useEstimateCalories.ts:54-55`), closes the Dialog and `toast.success(\`Ricetta organizzata in ${n} sezioni\`)`.

**Preview Dialog** (reuses `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` from `src/components/ui/dialog.tsx`, like `ConfirmDialog`). It is NOT a destructive confirmation, so `ConfirmDialog` isn't needed, but the shared Radix Dialog is (never native `confirm()`). Content:

- Title: `Organizza in sezioni`
- Description: `L'AI propone questa suddivisione. Testi e quantità restano invariati.`
- Body: one row per proposed section, in `sectionOrder` order: name in `font-medium text-foreground` + counts in `text-sm text-muted-foreground`, e.g. `Per il ragù — 7 ingredienti · 5 passaggi`. Any unassigned items (discarded by validation) appear as a `Senza sezione — 1 ingrediente` row only if present.
- Footer: `Annulla` (variant secondary) + `Applica` (variant default, with spinner if `apply.isPending`).
- Styles with semantic tokens only (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`): dark mode for free. On mobile the existing Radix Dialog is already responsive; no additional `max-lg:portrait:` pattern needed.

### 4.6 Shared module `src/lib/utils/section-assignments.ts`

Pure functions, testable with Jest, used both by the route (sanitization) and by the client (apply). No `'use client'`.

```ts
import { Ingredient, Step, Recipe } from '@/types';

export interface SectionProposal {
  ingredientSections: { ingredientId: string; section: string }[];
  stepSections: { stepId: string; section: string; sectionOrder: number }[];
}

/**
 * Cleans a model proposal: discards unknown ids and empty sections,
 * recomputes sectionOrder from the order of first appearance in the original steps.
 * Returns null if the resulting distinct ingredient sections are < 2.
 */
export function sanitizeSectionProposal(
  proposal: SectionProposal,
  ingredients: { id: string }[],
  steps: { id: string }[]
): SectionProposal | null;

/** true if the recipe has "real" sections (the lone ingredient section
 *  "Ingredienti" — a form artifact — counts as no sections). */
export function hasNamedSections(recipe: Pick<Recipe, 'ingredients' | 'steps'>): boolean;

/**
 * Applies a sanitized proposal: returns NEW ingredients/steps arrays with
 * section/sectionOrder filled in. Id, name, quantity, description, order,
 * duration stay byte-for-byte identical. Items without an assignment →
 * section: null (never undefined: Firestore would reject it).
 */
export function applySectionAssignments(
  ingredients: Ingredient[],
  steps: Step[],
  proposal: SectionProposal
): { ingredients: Ingredient[]; steps: Step[] };
```

Binding implementation details of `applySectionAssignments`:
- assigned ingredient → `{ ...ing, section: assignment.section }`; unassigned → `{ ...ing, section: null }` (explicit, never an `undefined` key);
- assigned step → `{ ...step, section: assignment.section, sectionOrder: assignment.sectionOrder }`; unassigned → `{ ...step, section: null, sectionOrder: null }`;
- the array order and the `order`/`id`/`description` fields NEVER change: active `cooking_sessions` (checked by id) and `{{qty:ingredientId}}` tokens stay valid by construction;
- `sectionOrder` in `sanitizeSectionProposal`: iterate `steps` in the given order; on the first occurrence of each section assign `1, 2, 3…`; rewrite the assignments with these values.

### 4.7 Downstream impacts (accepted and documented)

- **Shopping list**: `ShoppingItem.section` derives from `ingredient.section` (§2.6). Reorganizing a recipe changes the groupings of the shopping lists that recipe contributes to (e.g. from `Senza categoria` to `Per il ragù`). Accepted: it's consistency, not regression — the view already groups by recipe section. Note: Spec E will add a "Per reparto" view (default) alongside this grouping, but the "Per ricetta" view keeps this grouping on `ingredient.section` unchanged; no conflict.
- **Global step numbering**: the counter mechanism is not touched; after a reorganization the displayed numbers follow the render order by group (as already happens for recipes extracted from PDFs). The prompt forbids the model from proposing sections that would require reordering; the server never reorders.
- **React Query cache**: the shopping list is a cached derived view (`['shoppingList', uid, weekStartDate]`, staleTime 2min); apply doesn't invalidate it because the reorganized recipe comes back on the next fetch and no quantity changes. If during the guided test the 2min delay turns out to be confusing, adding the partial-match invalidation `['shoppingList', user.uid]` in `apply`'s `onSuccess` is allowed.

### 4.8 Edge cases and errors

1. **Bare `## Ingredienti`** → null section (unchanged, tested).
2. **Section name with only spaces after the prefix** (`## Ingredienti   `) → `[\s:]*$` absorbs, no capture → null.
3. **Recipe with a single "Ingredienti" section from the form round-trip** → `hasNamedSections` treats it as flat → button visible.
4. **Model returns invented ids** → discarded by `sanitizeSectionProposal`; if after discarding the distinct ingredient sections are < 2 → `reorganized: false`.
5. **Model returns `reorganizable: true` but empty arrays** → the < 2 count turns it into `reorganized: false`.
6. **Model assigns only some of the items** → orphan items stay `section: null` and show in the flat group (which renders first, without chrome): readable degradation, not breakage. The Dialog shows them as "Senza sezione".
7. **Unparseable JSON / response without a text block** → catch → 500 → client error toast. With structured outputs it's rare, but `JSON.parse` still goes inside the try (as in `estimate-calories/route.ts:170`).
8. **Unauthenticated user / expired token** → 401 from `requireAuthenticatedUser`; the client helper uses `getFirebaseAuthHeader({ forceRefresh: true })` like the others ("AI route auth" gotcha).
9. **Active cooking session on the reorganized recipe** → no impact: ids unchanged, `checkedSteps`/`checkedIngredients` stay valid; only the visual grouping changes on the next mount.
10. **Double click on "Applica"** → `apply.isPending` disables the button; the Dialog is not dismissible during apply (same `isConfirming` pattern as `ConfirmDialog`).
11. **Recipe modified in another tab between proposal and apply** → apply rewrites the whole `ingredients`/`steps` from the in-memory copy: accepted race window (same semantics as every form save; the mutations start anyway from the recipe in the freshly invalidated cache).

## 5. Phased implementation plan

Each phase leaves the project compilable (`npx tsc --noEmit`).

**Phase 1 — Parser** (bug fix, no dependencies):
- `src/lib/utils/recipe-parser.ts`: the two regexes (lines 81, 89) and `capitalizeSectionName` (lines 420-429).
- `src/lib/utils/recipe-parser.test.ts`: cases from the §4.1 table.

**Phase 2 — Render ordering**:
- `src/components/recipe/ingredient-list-collapsible.tsx`: stable partition instead of the alphabetical sort + comment updates.
- `src/components/recipe/steps-list-collapsible.tsx`: first-appearance fallback instead of `?? 999` + comment updates.

**Phase 3 — Prompts**:
- `src/app/api/chat-recipe/route.ts`: new lines in `REGOLE PER LE RICETTE`.
- `src/app/api/format-recipe/route.ts`: §4 rewritten.

**Phase 4 — Shared module + route**:
- `src/lib/utils/section-assignments.ts` (new): `SectionProposal`, `sanitizeSectionProposal`, `applySectionAssignments`, `hasNamedSections`.
- `src/lib/utils/section-assignments.test.ts` (new).
- `src/app/api/reorganize-recipe/route.ts` (new).
- `src/lib/utils/recipe-parser.ts`: client helper `getAISectionProposalForRecipe` (next to `getAICalorieEstimateForRecipe`).

**Phase 5 — Hook + UI**:
- `src/lib/hooks/useReorganizeRecipe.ts` (new).
- `src/components/recipe/recipe-detail.tsx`: button + preview Dialog.

**Phase 6 — Documentation**:
- `CLAUDE.md`: Recent Changes + `/api/reorganize-recipe` endpoint in the API table.
- `AGENTS.md`: §7 scope of the prescriptive rule (chat/format yes, extract no); any new gotcha that emerged.
- `specs/00-roadmap.md`: Spec B checklist.

## 6. Test plan

### Unit tests (Jest — `npm run test`, command verified in package.json: `"test": "jest"`)

**`recipe-parser.test.ts`** (extended):
- all cases from the §4.1 table (bare, trailing space, colon, "per ...", "La ...", "Il ragù", apostrophe, lowercase→capitalized);
- mixed multi-section markdown (`## Ingredienti per la pasta` + `## Ingredienti Il ragù`): both sections present on the right ingredients;
- `sectionOrder` increments correctly with non-"per" names;
- regression: the existing test with `## Ingredienti per l'impasto` and the `[ING:n]`/`[QTY:n]` references (recipe-parser.test.ts:8-40) stays green — the reference map is global and must not be affected by sections.

**`section-assignments.test.ts`** (new):
- `sanitizeSectionProposal`: discards unknown ids; discards empty sections; recomputes `sectionOrder` by first appearance (proposal with "wrong" orders from the model → corrected); returns `null` with < 2 distinct ingredient sections; returns `null` if after discarding invented ids 1 section remains;
- `applySectionAssignments`: ids/text/order/duration unchanged (deep-equal on non-section fields); unassigned items → `section: null` (and `sectionOrder: null` on steps); no `undefined` in output (anti-Firestore guard: `JSON.stringify` round-trip without losing keys);
- `hasNamedSections`: flat → false; only the "Ingredienti" section → false; "Ingredienti" + "Per la crema" → true; sections on steps only → true.

### Guided test (Playwright + Firebase emulators, throwaway scripts in `e2e/scratch/`, protocol in CLAUDE.md §"Guided testing tooling")

Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; a real `ANTHROPIC_API_KEY` is needed in `.env.local` (phases 3-4 call the real model).

- **Phase A (parser, no AI)**: script that seeds via the emulator a recipe whose steps/ingredients come from `parseExtractedRecipes` on a markdown fixture with sections `La pasta` / `Il ragù`; assert that the parsed objects carry the sections (spy word in the title, e.g. "Ragù COLLAUDO-B1").
- **Phase B (ordering)**: recipe seeded with sections in Z→A document order (e.g. "Per la copertura" before "Per la base"); browser on the detail page: assert that the DOM order of the headers is the document order, not alphabetical.
- **Phase C (end-to-end reorganization)**: seed a known flat recipe (lasagne: ≥ 8 ingredients, ≥ 6 steps); click "Organizza in sezioni"; wait for the Dialog; assert on the proposed names/counts; "Applica"; assert on emulated Firestore that `ingredients[].section` and `steps[].sectionOrder` are filled in and that ids and description are **byte-identical** to before.
- **Phase D (negative outcome)**: simple recipe but above the threshold (e.g. a salad with 6 ingredients, 4 trivial steps); wait for the "già ben organizzata" toast; assert that the Firestore document hasn't changed (`updatedAt` unchanged).
- Scripts are deleted at the end of the guided test; a line must be added to the "Guided tests run with this tooling" list in CLAUDE.md.

## 7. Relevant gotchas and constraints (from AGENTS.md/CLAUDE.md)

- **Never `undefined` on Firestore** (AGENTS.md §2): `applySectionAssignments` writes an explicit `null` for items without a section; the form already uses `delete newIngredient.section` (recipe-form.tsx:419) for the same reason.
- **`json_schema` without quantity constraints** (AGENTS.md Quick Reference): no `minItems`/`minimum`/`maxLength` in the schema → 400 with a misleading downstream symptom. The "2-5 sections" and "assign every id" constraints live in the prompt; the guarantee lives in server validation (`sanitizeSectionProposal`).
- **Sonnet 5 parameters** (AGENTS.md): never `temperature`/`top_p`/`top_k`/prefill → 400. Only `thinking: { type: 'adaptive' }` + `output_config.effort: 'low'`; model ONLY via `AI_MODEL`.
- **AI route auth** (AGENTS.md §7): `Authorization: Bearer <idToken>` header with `getFirebaseAuthHeader({ forceRefresh: true })`; server with `requireAuthenticatedUser`.
- **React Query**: invalidate both `['recipe', id, uid]` and `recipesQueryKey(uid)` after apply (pattern `useEstimateCalories.ts:54-55`); `enabled: !!user` isn't needed here (these are mutations, not queries) but the button is gated on `user`.
- **Global step numbering is a hard contract** (types/index.ts:80-88, steps-list-collapsible.tsx:164-174): the counter increments even in collapsed sections and collapsed content stays mounted (`grid-rows-[0fr]`); don't touch that mechanism.
- **`prevCheckedRef` init** (AGENTS.md "Collapsible auto-close mount"): don't touch the initialization with the current value in the two collapsibles.
- **Dialog, never native `confirm()`**: preview on the shared Radix `Dialog`; `ConfirmDialog` isn't needed (non-destructive action) but the `isConfirming`-lock style is.
- **Controls never `group-hover` only below `lg`** (AGENTS.md): the "Organizza in sezioni" button is always visible.
- **Semantic tokens** (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`), never `bg-white`/nonexistent OKLCH scales; for any accents use `text-accent`/`bg-accent/10`.
- **Recipe text plain-text**: the route doesn't touch step `description` (no markdown risk); section names are plain strings.
- **Mirror convention between prompts** (CLAUDE.md §"AI model and prompts"): the prescriptive rule is mirrored between chat and format, and deliberately absent from extract — document the scope as for the family context.
- **Build**: validate with `npx tsc --noEmit` + `npx next build --webpack`; if `spawn EPERM` in the sandbox, rerun outside the sandbox (AGENTS.md §8). `next lint` no longer exists.
- (Not relevant but mentioned by the spec template: no debounced persistence targets are added here, so no registration in `useShoppingList`'s `flushAll`.)

## 8. Out of scope

- Batch migration of existing documents with the phantom `section: "Ingredienti"` (the gating neutralizes it; the real cleanup is a possible future micro-fix).
- Fixing the form round-trip (recipe-form.tsx:245/416-417) that generates the phantom section: known behavior, documented, not touched here.
- Sections as entities (`Section` type, list of sections on `Recipe`, section ids): they stay strings repeated on the items.
- Ordering field on ingredients (`sectionOrder` on `Ingredient`): the flat array order is enough.
- Step section editing UI in the form (the free-text field per step stays).
- Reorganizing recipes that ALREADY have sections ("reorganize differently").
- Shopping list grouping by aisle (Spec E) and any aisle taxonomy.
- Prompt caching on the AI routes (already evaluated and discarded, CLAUDE.md Recent Changes 2026-07-05).

## 9. Implementation prompt

```markdown
Implement Spec B "Sezioni ingredienti/procedimento" of the Il Mio Ricettario project.

PREPARATION (mandatory, in order):
1. Read and apply CLAUDE.md, AGENTS.md, COMMENTS.md and DEVELOPMENT_GUIDELINES.md (repo root).
2. Read IN FULL specs/00-roadmap.md (binding shared contract) and specs/spec-b-sezioni-ai.md (this spec).
3. Create the branch feature/ai-recipe-sections from develop.

IMPLEMENTATION:
- Follow the phased plan in section 5 of the spec, in the order given (1 parser → 2 ordering → 3 prompts → 4 shared module + route → 5 hook + UI → 6 docs).
- After EVERY phase run `npx tsc --noEmit` and fix before continuing.
- At the end run `npx next build --webpack`; if it fails with `spawn EPERM` in the sandbox, rerun the build outside the sandbox before investigating the code.
- Run the tests with `npm run test` (actual command in package.json: "test": "jest") and verify that both the new tests (extended recipe-parser.test.ts, new section-assignments.test.ts) and the existing ones pass.
- Non-negotiable constraints: never undefined towards Firestore (explicit null); no minItems/minimum/maxLength in the json_schema schema (400); no temperature/top_p/top_k on the AI routes; model only via AI_MODEL; the global step counter and the prevCheckedRef init in the collapsibles are not touched; the reorganize-recipe route never modifies text or ids.

CLOSING:
- Update CLAUDE.md (Recent Changes section + API Endpoints table with POST /api/reorganize-recipe), AGENTS.md (scope of the prescriptive sections rule: chat/format yes, extract no; any new gotchas that emerged during the work) and the checklist in specs/00-roadmap.md (Spec B → done).
- NEVER commit without the user's explicit OK (session rule).
- At the end propose a phase-by-phase guided test following section 6 of the spec (Playwright + Firebase emulators, throwaway scripts in e2e/scratch/, "Guided testing tooling" protocol in CLAUDE.md), declaring for each phase the expected outcome before running it.
```

## 10. Recommended model and effort

Opus · effort high — touches AI prompts (delicate balance between fidelity and structure), the parser regex with back-compat, and a new route with structured output.
