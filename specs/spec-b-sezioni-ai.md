# Spec B — Sezioni ingredienti/procedimento: diagnosi e cura completa

> Note coperte: 8 (sezioni AI + riorganizzazione ricette esistenti) | Dipendenze: nessuna | Branch: `feature/ai-recipe-sections`

## 1. Obiettivo

Oggi le ricette generate o formattate dall'AI escono quasi sempre "piatte" (nessuna sezione), anche quando il piatto ha componenti logicamente distinte (impasto + farcitura, pasta + ragù, base + crema). Quando invece le sezioni arrivano, il parser ne perde silenziosamente una parte (i nomi che non iniziano con "per ") e il renderer ne stravolge l'ordine (sort alfabetico sugli ingredienti). Dopo questa spec:

1. il parser riconosce **qualsiasi** nome di sezione dopo `## Ingredienti ` / `## Procedimento ` (con o senza "per"), mantenendo il comportamento `## Ingredienti` nudo → sezione null;
2. `chat-recipe` e `format-recipe` hanno una regola **prescrittiva**: componenti distinte → sezioni obbligatorie, con nomi coerenti tra ingredienti e procedimento; `extract-recipes` resta fedele alla fonte;
3. le sezioni si mostrano in **ordine di prima apparizione** (documento), non alfabetico;
4. una nuova route `POST /api/reorganize-recipe` + un pulsante "Organizza in sezioni" nel dettaglio ricetta permettono di riorganizzare le ricette flat già salvate, senza toccare testi né id (zero rischio per `cooking_sessions` attive e token `{{qty:id}}`).

## 2. Stato attuale (diagnosi verificata sul codice)

### 2.1 Prompt — perché le ricette escono flat

**(a) `CHAT_SYSTEM_PROMPT`** (`src/app/api/chat-recipe/route.ts:38-105`) non contiene NESSUNA regola prescrittiva sulle sezioni. Le uniche menzioni sono due parenthetical descrittivi nel template (righe 65-67 e 75-77):

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

Il blocco `REGOLE PER LE RICETTE:` (righe 88-105) elenca 15+ regole su formato ingredienti, `[ING:n]`/`[QTY:n]`/`[DUR:N]`, decimali, markdown — e **zero** regole sulle sezioni. Un modello che genera una lasagna da zero non ha alcuna istruzione a decomporla: la forma flat è l'attrattore di default.

**(b) `FORMAT_RECIPE_PROMPT`** (`src/app/api/format-recipe/route.ts:30-129`) ha la regola §4 (righe 98-101):

```
### 4. SEZIONI MULTIPLE
- Se la ricetta ha componenti distinti (es: pasta fresca + ragù + besciamella), crea sezioni separate
- Usa ESATTAMENTE i nomi delle sezioni come forniti dall'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")
```

ma il template (righe 38-52) mostra la forma flat **per prima** e quella con sezioni solo come parenthetical, quindi la regola è debole e la forma flat resta il default.

**(c) `EXTRACTION_PROMPT`** (`src/app/api/extract-recipes/route.ts:26-157`) è correttamente fedele alla fonte: la §3 (righe 91-98) impone di copiare i nomi di sezione ESATTAMENTE, con esempi corretti espliciti `"La pasta"`, `"Il ragù"` (riga 97). Non va toccato: non deve inventare sezioni che il PDF non ha.

### 2.2 BUG parser — sezioni non-"per" droppate in silenzio

`src/lib/utils/recipe-parser.ts:78-84` (ingredienti):

```ts
if (line.startsWith('## Ingredienti')) {
  currentSection = 'ingredients';
  // Extract section name (e.g., "## Ingredienti per la pasta" -> "Per la pasta")
  const sectionMatch = line.match(/##\s+Ingredienti(?:\s+(per\s+.+))?$/i);
  currentIngredientSection = capitalizeSectionName(sectionMatch?.[1] || null);
  continue;
}
```

e `recipe-parser.ts:86-99` (procedimento):

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

Il gruppo di cattura `(per\s+.+)` accetta SOLO nomi che iniziano con "per ". Ma `EXTRACTION_PROMPT` §3 ordina di preservare `"La pasta"` / `"Il ragù"`: se il modello obbedisce ed emette `## Ingredienti La pasta`, il gruppo opzionale fallisce **e l'ancora `$` fa fallire l'intera regex** → `sectionMatch` è `null` → sezione `null`. La riga è comunque consumata da `startsWith('## Ingredienti')`, quindi la sezione **sparisce senza errore**: gli item finiscono nel gruppo flat. Il contratto prompt↔parser è rotto oggi.

`capitalizeSectionName` (`recipe-parser.ts:420-429`) ha già il ramo non-"per" (`return sectionName;`) ma è dead code, perché la cattura non produce mai nomi senza "per".

### 2.3 Ordinamento a render — asimmetrico e lossy

**Ingredienti** (`src/components/recipe/ingredient-list-collapsible.tsx:74-79`): le sezioni nominate vengono riordinate **alfabeticamente**, perdendo l'ordine documento:

```ts
groupedIngredients.sort((a, b) => {
  if (a.section === null) return -1; // Null section first
  if (b.section === null) return 1;
  return a.section.localeCompare(b.section); // Alphabetical
});
```

**Step** (`src/components/recipe/steps-list-collapsible.tsx:104-114`): l'ordine documento è preservato via `sectionOrder`, ma il fallback per step senza `sectionOrder` (creati dal form: `addStep` a `recipe-form.tsx:272-277` crea `{ ..., section: '', duration: null }` senza chiave `sectionOrder`) è `999` → tutte le sezioni aggiunte a mano finiscono in coda in ordine casuale:

```ts
const orderA = a.steps[0]?.sectionOrder ?? 999;
const orderB = b.steps[0]?.sectionOrder ?? 999;
```

### 2.4 Round-trip del form — sezione fantasma "Ingredienti"

Al load il form rinomina la sezione null in `'Ingredienti'` (`recipe-form.tsx:245`) e al save persiste **qualsiasi** nome non vuoto, incluso il default (`recipe-form.tsx:409-421`):

```ts
if (section.name && section.name.trim()) {
  newIngredient.section = section.name;
} else {
  delete newIngredient.section; // Explicit removal for clarity
}
```

Quindi una ricetta flat modificata nel form si ritrova con `section: "Ingredienti"` su tutti gli ingredienti: stringa truthy che il renderer NON normalizza → compare un header collassabile "Ingredienti" superfluo. Questa spec non migra i dati, ma il gating del pulsante "Organizza in sezioni" (§4.5) deve trattare questo stato come "senza sezioni".

### 2.5 Nessuna capacità di ristrutturazione AI

La superficie API è `chat-recipe`, `estimate-calories`, `extract-recipes`, `format-recipe`, `suggest-category` (`ls src/app/api`). Nessuna route accetta una ricetta strutturata esistente. Il precedente architetturale per "passaggio di arricchimento separato su ricetta esistente" è `estimate-calories` (`src/app/api/estimate-calories/route.ts`) col suo hook `useEstimateCalories` (`src/lib/hooks/useEstimateCalories.ts`) e il client helper `getAICalorieEstimateForRecipe` (`recipe-parser.ts:579-618`).

### 2.6 Dipendenze a valle di `ingredient.section`

- Lista spesa: `buildContributions` copia `section: ing.section ?? null` (`src/lib/utils/ingredient-aggregator.ts:45`); `aggregateIngredients` usa "first encountered section value for the group" come `ShoppingItem.section`; `useShoppingList` ordina per sezione (`src/lib/hooks/useShoppingList.ts:370-381`, null in coda) e deriva `sectionNames` (righe 386+); la sezione null è etichettata `'Senza categoria'` (`src/components/shopping-list/ShoppingListContent.tsx:31`).
- Numerazione globale step: contatore `let globalStepNumber = 0` incrementato durante il render, anche nelle sezioni collassate (`steps-list-collapsible.tsx:174,194,320`); il contenuto collassato resta montato (`grid-rows-[0fr]`).
- `cooking_sessions` persistono `checkedSteps`/`checkedIngredients` per **id** item; gli step contengono token `{{qty:ingredientId}}` risolti sugli id correnti.

## 3. Decisioni di prodotto (dal roadmap, vincolanti — contratto cross-spec 6)

1. Parser: la regex si amplia per catturare **qualsiasi** nome dopo `## Ingredienti ` / `## Procedimento ` (con e senza "per"), preservando `## Ingredienti` nudo → sezione null.
2. Prompt: `chat-recipe` e `format-recipe` guadagnano una regola **prescrittiva** ("se il piatto ha componenti logicamente distinte DEVI creare sezioni"); `extract-recipes` resta fedele alla fonte (non inventa sezioni).
3. Ordinamento: sezioni ingredienti in **ordine di prima apparizione** nell'array (niente sort alfabetico); il fallback degli step senza `sectionOrder` diventa anch'esso l'ordine di prima apparizione. Nessun nuovo campo su `Ingredient`, nessuna migrazione.
4. Nuova route `POST /api/reorganize-recipe`: riceve la ricetta strutturata (id + testi), restituisce **solo l'assegnazione delle sezioni** keyed sugli id esistenti (`ingredientId → section`, `stepId → section + sectionOrder`). Non tocca testi né id.
5. UI: pulsante "Organizza in sezioni" nel dettaglio ricetta, anteprima in Dialog, conferma → `updateRecipe`, toast per gli esiti.

## 4. Design proposto

### 4.1 Parser: regex ampliata e `capitalizeSectionName`

**Regex attuale (verbatim, `recipe-parser.ts:81` e `:89`):**

```ts
/##\s+Ingredienti(?:\s+(per\s+.+))?$/i
/##\s+Procedimento(?:\s+(per\s+.+))?$/i
```

**Regex proposta:**

```ts
/^##\s+Ingredienti(?:\s+(.+?))?[\s:]*$/i
/^##\s+Procedimento(?:\s+(.+?))?[\s:]*$/i
```

Razionale: `(.+?)` lazy cattura qualsiasi nome; `[\s:]*$` assorbe spazi finali e un eventuale `:` di chiusura (il modello a volte emette `## Ingredienti per la crema:`); il gruppo resta opzionale → `## Ingredienti` nudo non cattura nulla → `sectionMatch[1]` è `undefined` → sezione null, come oggi. L'ancora `^` è innocua (le righe sono già trimmate a `recipe-parser.ts:47`) ma rende la regex autonoma.

**Tabella casi di test (da implementare in `recipe-parser.test.ts`):**

| Input riga | Cattura | Sezione risultante |
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
| `## Procedimento Il ragù` | `Il ragù` | `Il ragù` (e `sectionOrder` incrementa) |
| `## INGREDIENTI PER LA BASE` | — | riga NON riconosciuta come header: il guard `line.startsWith('## Ingredienti')` (`recipe-parser.ts:78` e `:86`) è **case-sensitive** e scarta la variante tutta maiuscola PRIMA che la regex (case-insensitive) venga valutata — vero oggi e dopo la modifica; il guard resta invariato |

**`capitalizeSectionName` aggiornata** (`recipe-parser.ts:420-429`). Attuale (verbatim):

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

Proposta: il ramo non-"per" (ora raggiungibile) capitalizza la prima lettera, lasciando il resto invariato (i nomi da PDF arrivano già capitalizzati per la regola di fedeltà; quelli minuscoli da chat/format vanno normalizzati):

```ts
function capitalizeSectionName(sectionName: string | null): string | null {
  if (!sectionName) return null;

  if (sectionName.toLowerCase().startsWith('per ')) {
    return 'Per' + sectionName.substring(3);
  }

  // Nomi senza "per" ("La pasta", "il ragù"): prima lettera maiuscola, resto invariato
  return sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
}
```

Nessuna modifica alla logica di `sectionOrder` (`recipe-parser.ts:92-98`) né a `parseIngredientLine` (la sezione è passata come parametro, `recipe-parser.ts:139`).

### 4.2 Prompt: regola prescrittiva su chat e format (mirror convention)

**`CHAT_SYSTEM_PROMPT`** (`chat-recipe/route.ts`): aggiungere in coda al blocco `REGOLE PER LE RICETTE:` (dopo la riga 105, `- Includi porzioni e tempi solo se sei ragionevolmente sicuro, altrimenti ometti`) queste righe, nello stile del prompt:

```
- SEZIONI - REGOLA IMPORTANTE: se il piatto ha componenti logicamente distinte (es: impasto + farcitura, pasta + condimento, base + crema, ripieno + salsa), DEVI dividere la ricetta in sezioni, usando "## Ingredienti per [nome componente]" e "## Procedimento per [nome componente]"
- I nomi delle sezioni devono essere COERENTI tra ingredienti e procedimento: se esiste "## Ingredienti per il ragù" deve esistere "## Procedimento per il ragù"
- Le ricette semplici a componente unica restano SENZA sezioni: usa "## Ingredienti" e "## Procedimento" semplici, senza nome
```

I template parenthetical (righe 65-67, 75-77) restano invariati: la forma resta identica, cambia solo la prescrittività.

**`FORMAT_RECIPE_PROMPT`** (`format-recipe/route.ts:98-101`). §4 attuale citata verbatim in §2.1(b). Proposta sostitutiva:

```
### 4. SEZIONI MULTIPLE - REGOLA IMPORTANTE
- Se la ricetta ha componenti logicamente distinte (es: impasto + farcitura, pasta fresca + ragù + besciamella, base + crema), DEVI creare sezioni separate sia per gli ingredienti sia per il procedimento, anche se il testo dell'utente non le separa esplicitamente
- I nomi delle sezioni devono essere COERENTI tra ingredienti e procedimento: se esiste "## Ingredienti per il ragù" deve esistere "## Procedimento per il ragù"
- Usa ESATTAMENTE i nomi delle sezioni come forniti dall'utente, o nomi appropriati se non specificati
- Mantieni "Per" se presente (es: "Per il sugo", "Per la pasta")
- Le ricette semplici a componente unica restano SENZA sezioni: "## Ingredienti" e "## Procedimento" semplici
```

**`EXTRACTION_PROMPT`: NESSUNA modifica** (fedeltà alla fonte, decisione di prodotto). La convenzione mirror documentata in CLAUDE.md/AGENTS.md (regola ingredienti orfani: "Keep the rule mirrored in both prompts") va rispettata al contrario qui: la regola prescrittiva vive in chat + format e **deliberatamente NON** in extract — stesso schema di scope del family context (`AGENTS.md §7 "Family Context Scope"`). Documentarlo in CLAUDE.md (Recent Changes) e in AGENTS.md §7 (accanto agli altri scope: "Family Context Scope", "Web Search & Vision Scope").

### 4.3 Ordinamento a render: prima apparizione

**`ingredient-list-collapsible.tsx`** — sostituire il sort alfabetico (righe 74-79, citate in §2.3) con una partizione stabile che preserva l'ordine di inserzione della `Map` (= ordine di prima apparizione nell'array flat, che a sua volta preserva l'ordine di parse/documento):

```ts
// Null section first, poi le sezioni nominate in ordine di prima apparizione
// nell'array (la Map preserva l'ordine di inserzione = ordine documento).
const nullGroups = groupedIngredients.filter(g => g.section === null);
const namedGroups = groupedIngredients.filter(g => g.section !== null);
const orderedGroups = [...nullGroups, ...namedGroups];
```

e usare `orderedGroups` nel render. Aggiornare i commenti "WHY ALPHABETICAL" (righe 49-57) e l'header del file (righe 20-23): la motivazione nuova è "l'ordine documento è l'ordine di preparazione — un sort alfabetico mette la crema prima della base".

**`steps-list-collapsible.tsx`** — sostituire il fallback `?? 999` (righe 104-114) con l'indice di prima apparizione. La `Map` di grouping già itera in ordine di prima apparizione, quindi al momento della conversione in array si annota l'indice:

```ts
// Sort key: sectionOrder del parser se presente, altrimenti indice di prima
// apparizione del gruppo (stessa scala: entrambi crescono con l'ordine documento).
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

Nota: `Array.prototype.sort` è stabile (ES2019+), quindi a parità di chiave l'ordine di apparizione resta. Il comparator null-first attuale è mantenuto identico. Il contatore globale `globalStepNumber` NON viene toccato: continua a incrementare durante il render attraverso le sezioni collassate (contratto hard, `steps-list-collapsible.tsx:164-174`).

Nessuna modifica a `extracted-recipe-preview.tsx`: raggruppa già in ordine di inserzione della Map.

### 4.4 Nuova route `POST /api/reorganize-recipe`

**File**: `src/app/api/reorganize-recipe/route.ts`. Auth Bearer via `requireAuthenticatedUser` (`src/lib/api/require-user.ts`), modello via `AI_MODEL` (`src/lib/utils/constants.ts`), `thinking: { type: 'adaptive' }` + `output_config: { effort: 'low', format: { type: 'json_schema', schema } }` — stesso pattern di `estimate-calories/route.ts:146-162`. Niente `temperature`/`top_p`/`top_k`.

**Request body:**

```ts
{
  title: string;
  ingredients: { id: string; name: string; quantity: string }[];
  steps: { id: string; description: string }[];
}
```

Validazione input: `title` stringa non vuota, `ingredients` array non vuoto, `steps` array non vuoto → altrimenti 400 `{ error: 'Parametri mancanti: title, ingredients e steps sono richiesti' }`.

**JSON schema della risposta** (structured output — SOLO forma e tipi, NIENTE `minItems`/`maximum`/`minLength`: darebbero 400, vedi gotcha `json_schema` in AGENTS.md):

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

**Prompt** (funzione `createReorganizePrompt(title, ingredients, steps)`; gli id vengono inclusi verbatim così il modello li restituisce keyed):

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

**Parametri chiamata**: `max_tokens: 3000` (output = solo assegnazioni JSON: ~20 token per item, una ricetta grande da 40 ingredienti + 30 step sta sotto i 2000; 3000 dà margine per il tokenizer Sonnet 5).

**Validazione server (dopo il parse del JSON):**

1. Se `reorganizable === false` → risposta `{ success: true, reorganized: false }` (HTTP 200: "nessuna riorganizzazione sensata" è un esito legittimo, non un errore — stesso principio del `null` di `estimate-calories`).
2. Scartare le assegnazioni con id sconosciuti (non presenti nell'input) e con `section` vuota/non stringa (funzione pura condivisa, §4.6).
3. Ricalcolare `sectionOrder` server-side ignorando quello del modello: iterando gli **step originali nell'ordine ricevuto**, la prima sezione incontrata prende 1, la seconda 2, ecc. (elimina la dipendenza dall'aritmetica del modello; il campo resta nello schema perché forza il modello a ragionare sull'ordine, ma il server è l'autorità).
4. Contare le sezioni distinte risultanti **sugli ingredienti** dopo la pulizia: se `< 2` → `{ success: true, reorganized: false }` (una "riorganizzazione" con una sola sezione è la ricetta flat con un header in più).
5. Risposta positiva:

```ts
{
  success: true,
  reorganized: true,
  ingredientSections: { ingredientId: string; section: string }[],
  stepSections: { stepId: string; section: string; sectionOrder: number }[],
}
```

La route **non tocca testi né id e non scrive su Firestore**: restituisce solo la proposta; la persistenza avviene client-side dopo conferma dell'utente (§4.5).

### 4.5 UI: "Organizza in sezioni" nel dettaglio ricetta

**Visibilità del pulsante** (`src/components/recipe/recipe-detail.tsx`). Nuova utility pura `hasNamedSections(recipe)` (in `src/lib/utils/section-assignments.ts`, §4.6):

```ts
export function hasNamedSections(recipe: Pick<Recipe, 'ingredients' | 'steps'>): boolean {
  const ingredientSections = new Set(
    recipe.ingredients.map(i => i.section).filter((s): s is string => !!s)
  );
  const stepSections = new Set(
    recipe.steps.map(s => s.section).filter((s): s is string => !!s)
  );
  // La sezione unica "Ingredienti" è l'artefatto del round-trip del form
  // (recipe-form.tsx:245 rinomina null → 'Ingredienti' al load e la persiste
  // al save): equivale a "nessuna sezione".
  const realIngredientSections =
    ingredientSections.size === 1 && ingredientSections.has('Ingredienti')
      ? 0
      : ingredientSections.size;
  return realIngredientSections > 0 || stepSections.size > 0;
}
```

Condizione di render del pulsante:

```ts
const canReorganize =
  !!user &&
  !hasNamedSections(recipe) &&
  recipe.ingredients.length >= 6 &&
  recipe.steps.length >= 4;
```

**Soglia proposta: ≥ 6 ingredienti E ≥ 4 step.** Sotto, una ricetta non ha materiale per 2 componenti da almeno 2-3 elementi l'una e la proposta uscirebbe quasi sempre `reorganized: false` (chiamata AI sprecata).

**Posizione**: nella colonna Ingredienti del grid (recipe-detail.tsx:137-141), tra l'`<h2>Ingredienti</h2>` e `<IngredientListCollapsible>`, con lo stesso pattern ghost del bottone "Stima calorie" (recipe-detail.tsx:104-134: `Button variant="ghost" size="sm"`, `className="h-auto gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:text-foreground"`, spinner + label in pending). Icona `ListTree` (lucide-react). Il pulsante è sempre visibile quando `canReorganize` (mai solo `group-hover`: contesto touch-primary).

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

**Hook `useReorganizeRecipe`** (`src/lib/hooks/useReorganizeRecipe.ts`, stile `useEstimateCalories`): due mutation.

1. `propose` — chiama il client helper `getAISectionProposalForRecipe(recipe)` (nuovo, in `recipe-parser.ts` accanto a `getAICalorieEstimateForRecipe:579-618`, stesso pattern: `fetch('/api/reorganize-recipe', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await getFirebaseAuthHeader({ forceRefresh: true })) }, body })`). Esiti:
   - `reorganized: false` → toast informativo `toast('La ricetta è già ben organizzata così com\'è.', { icon: 'ℹ️' })`, nessuna scrittura;
   - `reorganized: true` → salva la proposta in uno stato locale e apre il Dialog di anteprima;
   - errore rete/500 → `toast.error('Impossibile organizzare la ricetta in questo momento.')`.
2. `apply` — su conferma nel Dialog: costruisce i nuovi array con `applySectionAssignments` (§4.6), poi `updateRecipe(recipe.id, { ingredients, steps })` (`src/lib/firebase/firestore.ts:125-133`), invalida `['recipe', recipe.id, user.uid]` **e** `recipesQueryKey(user.uid)` (stesse invalidazioni di `useEstimateCalories.ts:54-55`), chiude il Dialog e `toast.success(\`Ricetta organizzata in ${n} sezioni\`)`.

**Dialog di anteprima** (riusa `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter` di `src/components/ui/dialog.tsx`, come `ConfirmDialog`). NON è una conferma distruttiva, quindi non serve `ConfirmDialog`, ma il Dialog Radix condiviso sì (mai `confirm()` nativo). Contenuto:

- Titolo: `Organizza in sezioni`
- Descrizione: `L'AI propone questa suddivisione. Testi e quantità restano invariati.`
- Corpo: una riga per sezione proposta, in ordine di `sectionOrder`: nome in `font-medium text-foreground` + conteggi in `text-sm text-muted-foreground`, es. `Per il ragù — 7 ingredienti · 5 passaggi`. Eventuali item non assegnati (scartati dalla validazione) compaiono come riga `Senza sezione — 1 ingrediente` solo se presenti.
- Footer: `Annulla` (variant secondary) + `Applica` (variant default, con spinner se `apply.isPending`).
- Stili solo con token semantici (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`): dark mode gratis. Su mobile il Dialog Radix esistente è già responsive; nessun pattern `max-lg:portrait:` aggiuntivo necessario.

### 4.6 Modulo condiviso `src/lib/utils/section-assignments.ts`

Funzioni pure, testabili con Jest, usate sia dalla route (sanitizzazione) sia dal client (apply). Nessun `'use client'`.

```ts
import { Ingredient, Step, Recipe } from '@/types';

export interface SectionProposal {
  ingredientSections: { ingredientId: string; section: string }[];
  stepSections: { stepId: string; section: string; sectionOrder: number }[];
}

/**
 * Pulisce una proposta del modello: scarta id sconosciuti e sezioni vuote,
 * ricalcola sectionOrder dall'ordine di prima apparizione negli step originali.
 * Ritorna null se le sezioni ingredienti distinte risultanti sono < 2.
 */
export function sanitizeSectionProposal(
  proposal: SectionProposal,
  ingredients: { id: string }[],
  steps: { id: string }[]
): SectionProposal | null;

/** true se la ricetta ha sezioni "vere" (la sola sezione ingredienti
 *  "Ingredienti" — artefatto del form — conta come nessuna sezione). */
export function hasNamedSections(recipe: Pick<Recipe, 'ingredients' | 'steps'>): boolean;

/**
 * Applica una proposta sanitizzata: ritorna NUOVI array ingredients/steps con
 * section/sectionOrder valorizzati. Id, name, quantity, description, order,
 * duration restano identici byte-per-byte. Item senza assegnazione →
 * section: null (mai undefined: verrebbe rifiutato da Firestore).
 */
export function applySectionAssignments(
  ingredients: Ingredient[],
  steps: Step[],
  proposal: SectionProposal
): { ingredients: Ingredient[]; steps: Step[] };
```

Dettagli implementativi vincolanti di `applySectionAssignments`:
- ingrediente assegnato → `{ ...ing, section: assignment.section }`; non assegnato → `{ ...ing, section: null }` (esplicito, mai chiave `undefined`);
- step assegnato → `{ ...step, section: assignment.section, sectionOrder: assignment.sectionOrder }`; non assegnato → `{ ...step, section: null, sectionOrder: null }`;
- l'ordine degli array e i campi `order`/`id`/`description` NON cambiano mai: le `cooking_sessions` attive (checked per id) e i token `{{qty:ingredientId}}` restano validi per costruzione;
- `sectionOrder` in `sanitizeSectionProposal`: iterare `steps` nell'ordine dato; alla prima occorrenza di ogni sezione assegnare `1, 2, 3…`; riscrivere le assegnazioni con questi valori.

### 4.7 Impatti a valle (accettati e documentati)

- **Lista spesa**: `ShoppingItem.section` deriva da `ingredient.section` (§2.6). Riorganizzare una ricetta cambia i raggruppamenti della lista della spesa in cui quella ricetta contribuisce (es. da `Senza categoria` a `Per il ragù`). Accettato: è coerenza, non regressione — la vista raggruppa già per sezione ricetta. Nota: Spec E affiancherà a questo grouping una vista "Per reparto" (default), ma la vista "Per ricetta" conserva invariato questo grouping su `ingredient.section`; nessun conflitto.
- **Numerazione globale step**: il meccanismo del contatore non viene toccato; dopo una riorganizzazione i numeri visualizzati seguono l'ordine di render per gruppi (come già accade per le ricette estratte da PDF). Il prompt vieta al modello sezioni che richiederebbero riordini; il server non riordina mai.
- **Cache React Query**: la lista spesa è una vista derivata cachata (`['shoppingList', uid, weekStartDate]`, staleTime 2min); l'apply non la invalida perché la ricetta riorganizzata rientra al prossimo fetch e nessuna quantità cambia. Se in collaudo il ritardo di 2min risultasse confusionario, aggiungere l'invalidazione partial-match `['shoppingList', user.uid]` nell'`onSuccess` di `apply` è ammesso.

### 4.8 Edge case ed errori

1. **`## Ingredienti` nudo** → sezione null (invariato, testato).
2. **Nome sezione con soli spazi dopo il prefisso** (`## Ingredienti   `) → `[\s:]*$` assorbe, nessuna cattura → null.
3. **Ricetta con sezione unica "Ingredienti" da round-trip form** → `hasNamedSections` la tratta come flat → pulsante visibile.
4. **Modello restituisce id inventati** → scartati da `sanitizeSectionProposal`; se dopo lo scarto le sezioni ingredienti distinte sono < 2 → `reorganized: false`.
5. **Modello restituisce `reorganizable: true` ma array vuoti** → il conteggio < 2 lo converte in `reorganized: false`.
6. **Modello assegna solo parte degli item** → gli item orfani restano `section: null` e si mostrano nel gruppo flat (che renderizza per primo, senza chrome): degrado leggibile, non rottura. Il Dialog li mostra come "Senza sezione".
7. **JSON non parsabile / risposta senza blocco text** → catch → 500 → toast errore client. Con structured outputs è raro ma il `JSON.parse` va comunque dentro il try (come `estimate-calories/route.ts:170`).
8. **Utente non autenticato / token scaduto** → 401 da `requireAuthenticatedUser`; il client helper usa `getFirebaseAuthHeader({ forceRefresh: true })` come gli altri (gotcha "AI route auth").
9. **Cottura attiva sulla ricetta riorganizzata** → nessun impatto: id invariati, `checkedSteps`/`checkedIngredients` restano validi; cambia solo il grouping visivo al prossimo mount.
10. **Doppio click su "Applica"** → `apply.isPending` disabilita il bottone; il Dialog non è dismissibile durante l'apply (stesso pattern `isConfirming` di `ConfirmDialog`).
11. **Ricetta modificata in un'altra tab tra proposta e apply** → l'apply riscrive `ingredients`/`steps` interi dalla copia in memoria: finestra di race accettata (stessa semantica di ogni salvataggio del form; le mutation partono comunque dalla ricetta della cache appena invalidata).

## 5. Piano di implementazione a fasi

Ogni fase lascia il progetto compilabile (`npx tsc --noEmit`).

**Fase 1 — Parser** (fix del bug, nessuna dipendenza):
- `src/lib/utils/recipe-parser.ts`: le due regex (righe 81, 89) e `capitalizeSectionName` (righe 420-429).
- `src/lib/utils/recipe-parser.test.ts`: casi della tabella §4.1.

**Fase 2 — Ordinamento render**:
- `src/components/recipe/ingredient-list-collapsible.tsx`: partizione stabile al posto del sort alfabetico + aggiornamento commenti.
- `src/components/recipe/steps-list-collapsible.tsx`: fallback prima-apparizione al posto di `?? 999` + aggiornamento commenti.

**Fase 3 — Prompt**:
- `src/app/api/chat-recipe/route.ts`: nuove righe in `REGOLE PER LE RICETTE`.
- `src/app/api/format-recipe/route.ts`: §4 riscritta.

**Fase 4 — Modulo condiviso + route**:
- `src/lib/utils/section-assignments.ts` (nuovo): `SectionProposal`, `sanitizeSectionProposal`, `applySectionAssignments`, `hasNamedSections`.
- `src/lib/utils/section-assignments.test.ts` (nuovo).
- `src/app/api/reorganize-recipe/route.ts` (nuova).
- `src/lib/utils/recipe-parser.ts`: client helper `getAISectionProposalForRecipe` (accanto a `getAICalorieEstimateForRecipe`).

**Fase 5 — Hook + UI**:
- `src/lib/hooks/useReorganizeRecipe.ts` (nuovo).
- `src/components/recipe/recipe-detail.tsx`: pulsante + Dialog anteprima.

**Fase 6 — Documentazione**:
- `CLAUDE.md`: Recent Changes + endpoint `/api/reorganize-recipe` nella tabella API.
- `AGENTS.md`: §7 scope della regola prescrittiva (chat/format sì, extract no); eventuale nuovo gotcha emerso.
- `specs/00-roadmap.md`: checklist Spec B.

## 6. Piano di test

### Unit test (Jest — `npm run test`, comando verificato in package.json: `"test": "jest"`)

**`recipe-parser.test.ts`** (esteso):
- tutti i casi della tabella §4.1 (bare, trailing space, due punti, "per ...", "La ...", "Il ragù", apostrofo, minuscolo→capitalizzato);
- markdown multi-sezione misto (`## Ingredienti per la pasta` + `## Ingredienti Il ragù`): entrambe le sezioni presenti sugli ingredienti giusti;
- `sectionOrder` incrementa correttamente con nomi non-"per";
- regressione: il test esistente con `## Ingredienti per l'impasto` e i riferimenti `[ING:n]`/`[QTY:n]` (recipe-parser.test.ts:8-40) resta verde — la mappa dei riferimenti è globale e non deve risentire delle sezioni.

**`section-assignments.test.ts`** (nuovo):
- `sanitizeSectionProposal`: scarta id sconosciuti; scarta sezioni vuote; ricalcola `sectionOrder` per prima apparizione (proposta con ordini "sbagliati" dal modello → corretti); ritorna `null` con < 2 sezioni ingredienti distinte; ritorna `null` se dopo lo scarto degli id inventati resta 1 sezione;
- `applySectionAssignments`: id/testi/order/duration invariati (deep-equal sui campi non-sezione); item non assegnati → `section: null` (e `sectionOrder: null` sugli step); nessun `undefined` in output (guardia anti-Firestore: `JSON.stringify` round-trip senza perdita di chiavi);
- `hasNamedSections`: flat → false; sola sezione "Ingredienti" → false; "Ingredienti" + "Per la crema" → true; sezioni solo sugli step → true.

### Collaudo guidato (Playwright + emulatori Firebase, script usa-e-getta in `e2e/scratch/`, protocollo in CLAUDE.md §"Guided testing tooling")

Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; serve `ANTHROPIC_API_KEY` reale in `.env.local` (le fasi 3-4 chiamano il modello vero).

- **Fase A (parser, senza AI)**: script che semina via emulatore una ricetta i cui step/ingredienti provengono da `parseExtractedRecipes` su un markdown fixture con sezioni `La pasta` / `Il ragù`; assert che gli oggetti parsati portino le sezioni (spy word nel titolo, es. "Ragù COLLAUDO-B1").
- **Fase B (ordinamento)**: ricetta seminata con sezioni in ordine documento Z→A (es. "Per la copertura" prima di "Per la base"); browser sul dettaglio: assert che l'ordine DOM degli header sia quello documento, non alfabetico.
- **Fase C (riorganizzazione end-to-end)**: seminare una ricetta flat nota (lasagne: ≥ 8 ingredienti, ≥ 6 step); click su "Organizza in sezioni"; attendere il Dialog; assert sui nomi/conteggi proposti; "Applica"; assert su Firestore emulato che `ingredients[].section` e `steps[].sectionOrder` siano valorizzati e che id e description siano **byte-identici** a prima.
- **Fase D (esito negativo)**: ricetta semplice ma sopra soglia (es. insalata con 6 ingredienti, 4 step banali); attesa del toast "già ben organizzata"; assert che il documento Firestore non sia cambiato (`updatedAt` invariato).
- Gli script si eliminano a fine collaudo; una riga va aggiunta alla lista "Collaudi eseguiti" in CLAUDE.md.

## 7. Gotcha e vincoli pertinenti (da AGENTS.md/CLAUDE.md)

- **Mai `undefined` su Firestore** (AGENTS.md §2): `applySectionAssignments` scrive `null` esplicito per gli item senza sezione; il form usa già `delete newIngredient.section` (recipe-form.tsx:419) per lo stesso motivo.
- **`json_schema` senza vincoli di quantità** (AGENTS.md Quick Reference): niente `minItems`/`minimum`/`maxLength` nello schema → 400 con sintomo ingannevole a valle. I vincoli "2-5 sezioni", "assegna ogni id" stanno nel prompt; la garanzia sta nella validazione server (`sanitizeSectionProposal`).
- **Parametri Sonnet 5** (AGENTS.md): mai `temperature`/`top_p`/`top_k`/prefill → 400. Solo `thinking: { type: 'adaptive' }` + `output_config.effort: 'low'`; modello SOLO via `AI_MODEL`.
- **AI route auth** (AGENTS.md §7): header `Authorization: Bearer <idToken>` con `getFirebaseAuthHeader({ forceRefresh: true })`; server con `requireAuthenticatedUser`.
- **React Query**: invalidare sia `['recipe', id, uid]` sia `recipesQueryKey(uid)` dopo l'apply (pattern `useEstimateCalories.ts:54-55`); `enabled: !!user` non serve qui (sono mutation, non query) ma il pulsante è gated su `user`.
- **Global step numbering è un contratto hard** (types/index.ts:80-88, steps-list-collapsible.tsx:164-174): il contatore incrementa anche nelle sezioni collassate e il contenuto collassato resta montato (`grid-rows-[0fr]`); non toccare quel meccanismo.
- **`prevCheckedRef` init** (AGENTS.md "Collapsible auto-close mount"): non toccare l'inizializzazione con il valore corrente nei due collapsible.
- **Dialog, mai `confirm()` nativo**: anteprima su `Dialog` Radix condiviso; `ConfirmDialog` non serve (azione non distruttiva) ma lo stile `isConfirming`-lock sì.
- **Controlli mai solo `group-hover` sotto `lg`** (AGENTS.md): il pulsante "Organizza in sezioni" è sempre visibile.
- **Token semantici** (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`), mai `bg-white`/scale OKLCH inesistenti; per eventuali accenti usare `text-accent`/`bg-accent/10`.
- **Recipe text plain-text**: la route non tocca `description` degli step (nessun rischio markdown); i nomi sezione sono stringhe semplici.
- **Convenzione mirror tra prompt** (CLAUDE.md §"AI model and prompts"): la regola prescrittiva è mirrored tra chat e format, e deliberatamente assente da extract — documentare lo scope come per il family context.
- **Build**: validare con `npx tsc --noEmit` + `npx next build --webpack`; se `spawn EPERM` nel sandbox, rilanciare fuori sandbox (AGENTS.md §8). `next lint` non esiste più.
- (Non pertinente ma citato dal template di spec: qui non si aggiungono target di persistenza debounced, quindi nessuna registrazione in `flushAll` di `useShoppingList`.)

## 8. Fuori scope

- Migrazione batch dei documenti esistenti con `section: "Ingredienti"` fantasma (il gating la neutralizza; la pulizia vera è un eventuale micro-fix futuro).
- Correzione del round-trip del form (recipe-form.tsx:245/416-417) che genera la sezione fantasma: comportamento noto, documentato, non toccato qui.
- Sezioni come entità (tipo `Section`, lista sezioni su `Recipe`, id di sezione): restano stringhe ripetute sugli item.
- Campo di ordinamento sugli ingredienti (`sectionOrder` su `Ingredient`): l'ordine dell'array flat basta.
- UI di editing sezioni step nel form (resta il campo di testo libero per step).
- Riorganizzazione di ricette che HANNO già sezioni ("ri-organizza diversamente").
- Grouping della lista spesa per reparto (Spec E) e qualsiasi tassonomia reparti.
- Prompt caching sulle route AI (già valutato e scartato, CLAUDE.md Recent Changes 2026-07-05).

## 9. Prompt di implementazione

```markdown
Implementa la Spec B "Sezioni ingredienti/procedimento" del progetto Il Mio Ricettario.

PREPARAZIONE (obbligatoria, nell'ordine):
1. Leggi e applica CLAUDE.md, AGENTS.md, COMMENTS.md e DEVELOPMENT_GUIDELINES.md (root del repo).
2. Leggi PER INTERO specs/00-roadmap.md (contratto condiviso vincolante) e specs/spec-b-sezioni-ai.md (questa spec).
3. Crea il branch feature/ai-recipe-sections a partire da develop.

IMPLEMENTAZIONE:
- Segui il piano a fasi della sezione 5 della spec, nell'ordine indicato (1 parser → 2 ordinamento → 3 prompt → 4 modulo condiviso + route → 5 hook + UI → 6 docs).
- Dopo OGNI fase esegui `npx tsc --noEmit` e correggi prima di proseguire.
- A fine lavoro esegui `npx next build --webpack`; se fallisce con `spawn EPERM` nel sandbox, rilancia la build fuori sandbox prima di indagare il codice.
- Esegui i test con `npm run test` (comando reale in package.json: "test": "jest") e verifica che passino sia i nuovi test (recipe-parser.test.ts esteso, section-assignments.test.ts nuovo) sia quelli esistenti.
- Vincoli non negoziabili: mai undefined verso Firestore (null esplicito); niente minItems/minimum/maxLength nello schema json_schema (400); niente temperature/top_p/top_k sulle route AI; modello solo via AI_MODEL; il contatore globale degli step e l'init di prevCheckedRef nei collapsible non si toccano; la route reorganize-recipe non modifica mai testi né id.

CHIUSURA:
- Aggiorna CLAUDE.md (sezione Recent Changes + tabella API Endpoints con POST /api/reorganize-recipe), AGENTS.md (scope della regola prescrittiva sulle sezioni: chat/format sì, extract no; eventuali nuovi gotcha emersi durante il lavoro) e la checklist in specs/00-roadmap.md (Spec B → fatta).
- NON committare MAI senza OK esplicito dell'utente (regola di sessione).
- Al termine proponi un collaudo guidato fase-per-fase secondo la sezione 6 della spec (Playwright + emulatori Firebase, script usa-e-getta in e2e/scratch/, protocollo "Guided testing tooling" in CLAUDE.md), dichiarando per ogni fase l'esito atteso prima di eseguirla.
```

## 10. Modello e effort consigliati

Opus · effort high — tocca prompt AI (equilibrio delicato tra fedeltà e struttura), regex del parser con back-compat e una nuova route con structured output.
