# Spec D — Motore di matching ingredienti + integrazione lista spesa ↔ dispensa ↔ cotture

> Note coperte: 1 (ingredienti banali, spunta→dispensa, doppioni, scalo a fine cottura, matching) | Dipendenze: nessuna (Spec E dipende da questa) | Branch: `feature/pantry-shopping-integration`

Leggere insieme a `specs/00-roadmap.md` (contratto vincolante, in particolare "Contratti cross-spec §2" e "Decisioni di prodotto §1–3").

---

## 1. Obiettivo

Oggi lista della spesa e dispensa sono due mondi separati: la lista propone di comprare acqua e ingredienti che l'utente ha già in casa, la spesa spuntata non finisce mai in dispensa, e a fine cottura le scorte restano invariate. Questa spec introduce un **motore di matching ingredienti↔dispensa** condiviso (`ingredient-matching.ts`) e lo usa in tre punti:

1. la lista della spesa **non mostra mai** ingredienti banali (acqua, ghiaccio) e sposta in una sezione collassata **"Hai già in casa"** gli ingredienti matchati in dispensa con scorta sufficiente, re-includibili con un tap;
2. un bottone **"Aggiungi alla dispensa"** trasforma in batch gli articoli spuntati in voci di dispensa (creazione o incremento della voce esistente), con posizione/quantità/scadenza precompilate;
3. al tap su **"Termina cottura"** un dialog propone lo **scalo delle scorte** usate, quantità già adattate alle porzioni cucinate, ogni riga modificabile o escludibile.

I match incerti non fanno mai nulla da soli: l'app **propone**, l'utente conferma una volta, e la conferma diventa un **alias persistente** sulla voce di dispensa (vale per sempre, sia in lista sia nello scalo). Include quattro micro-fix (bottone "Aggiungi articolo" senza piano, ConfirmDialog sul delete dispensa, "Consumato" sensato per unità, rimozione stub morti).

## 2. Stato attuale (riferimenti verificati)

### 2.1 Aggregazione lista spesa

- `src/lib/utils/ingredient-aggregator.ts:19` — `buildContributions(plan, recipesById)` appiattisce tutti gli slot del piano in `IngredientContribution[]` (nessun filtro).
- `src/lib/utils/ingredient-aggregator.ts:75` — `aggregateIngredients(contributions)` raggruppa per chiave canonica; alla riga 89: `const key = canonicalIngredientKey(c.name);`.
- `src/lib/utils/ingredient-aggregator.ts:164` — la funzione chiave è **privata**:
  ```ts
  function canonicalIngredientKey(name: string): string {
  ```
  (NFD accent-strip, lowercase, `singularizeWord` per parola — riga 184; conservativa: parole <4 caratteri intoccate, multi-parola mai collassate).
- `src/lib/utils/ingredient-aggregator.ts:218` — `NON_SCALABLE_RE` (`q.b.`, `un pizzico`, `a piacere`…): influenza solo il parsing quantità, **non** esclude articoli.
- `src/lib/utils/ingredient-aggregator.ts:224` — `UNIT_ALIASES` privata (massa base g, volume base ml, alias italiani `etti`, `chili`, `lt`…).
- `src/lib/utils/ingredient-aggregator.ts:298` — `parseQuantity(quantity): ParsedQuantity | null` privata; `ParsedQuantity` (riga 210) = `{ baseValue, dimension: 'mass'|'volume'|'count', unit }`.
- `src/lib/utils/ingredient-aggregator.ts:322` — `formatQuantity(baseValue, dimension)` privata (g↔kg, ml↔l, virgola italiana).
- `src/lib/utils/ingredient-aggregator.ts:127` — id item piano = `toSlug(key)` (stabile tra ricomputazioni).
- **Nessun filtro di ingredienti banali esiste** (verificato: nessun riferimento ad acqua/ghiaccio nell'aggregatore, nel hook o nei componenti).

### 2.2 Hook lista spesa e persistenza

- `src/lib/hooks/useShoppingList.ts:84` — orchestrazione completa. Query `['shoppingList', uid, weekStartDate]` (riga 106) → `getMealPlanByWeek` + `getRecipesByIds` + aggregazione. Query separata `['adHocShopping', uid]` (riga 145).
- Persistenza a **due target indipendenti**: piano su `meal_plans` (debounce 500 ms righe 315–339, flush `flushPendingShoppingState` riga 191) e ad-hoc su `users/{uid}` (debounce righe 261–272, flush `flushPendingAdHocState` riga 234). `flushAll` (righe 345–365) su `visibilitychange:hidden`, `pagehide`, unmount.
- `src/lib/hooks/useShoppingList.ts:20` — fallback localStorage: `interface PersistedState { checkedIds: string[]; customItems: ShoppingItem[]; }`.
- `src/lib/firebase/meal-plans.ts:181` — scrittura stato piano, che questa spec estende:
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
  Unico call-site: `useShoppingList.ts` (righe 203 e 327).
- `src/lib/firebase/shopping-adhoc.ts:38` — `addRecipeToAdHocShoppingList` copia gli ingredienti **verbatim** (righe 50–55):
  ```ts
  items: recipe.ingredients.map((ingredient): AdHocShoppingItem => ({
    id: crypto.randomUUID(),
    name: ingredient.name,
    quantity: ingredient.quantity,
    checked: false,
  })),
  ```
- `src/components/shopping-list/ShoppingListContent.tsx:125–134` — il bottone "Aggiungi articolo" è gated su `hasPlan`:
  ```tsx
  {hasPlan && (
    <Button variant="outline" className="w-full" onClick={() => setAddSheetOpen(true)}>
      <PlusCircle className="w-4 h-4 mr-2" />
      Aggiungi articolo
    </Button>
  )}
  ```
  e l'empty state "no piano" (righe 52–69) ritorna prima di montare la sheet.
- `src/components/shopping-list/ShoppingSection.tsx:28` — sezione collassabile (animazione `grid-rows`), `ShoppingItemRow.tsx:22` — riga generica a props esplicite (`name`/`quantity`/`checked`/`footnote`/`onToggle`/`onRemove`).

### 2.3 Dispensa

- `src/types/pantry.ts:3–17` — `PantryItem` (qty `number`, `unit: string` con vocabolario `PANTRY_UNITS`, `categoryId` slug, `position`, `purchased`/`expires` stringhe `YYYY-MM-DD` o null, `min`, `notes`). **Nessun campo `aliases`**.
- `src/lib/firebase/pantry.ts:22/29/43/54` — `getPantryItems` (solo `where('userId','==',userId)`, nessun orderBy), `createPantryItem`, `updatePantryItem(itemId, partial)`, `deletePantryItem`. Nessun helper batch.
- `src/lib/hooks/usePantry.ts:13–24` — `pantryQueryKey(uid) = ['pantryItems', uid]`, `staleTime: 2min`, `enabled: !!user`; mutazioni invalidano la chiave.
- `src/lib/utils/pantry-utils.ts:7–18` — `PANTRY_CATEGORIES` (10 slug hardcoded); riga 20 `PANTRY_UNITS = ['g','kg','ml','L','pz','vasetti','mazzo','testa']`; riga 106 `formatQty(item)`.
- `src/components/pantry/PantryItemQuickSheet.tsx:38–43` — "Consumato" decrementa sempre di 1 a prescindere dall'unità:
  ```ts
  async function handleConsume() {
    if (!item) return;
    const newQty = Math.max(0, item.qty - 1);
    await updateItem.mutateAsync({ id: item.id, data: { qty: newQty } });
    onClose();
  }
  ```
- `src/components/pantry/PantryItemQuickSheet.tsx:120–128` — delete **senza ConfirmDialog** (viola la regola di progetto):
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
- `src/components/pantry/PantryItemQuickSheet.tsx:86–92` — "Aggiungi a lista" è un no-op (`onClick={onClose}`).
- `src/components/pantry/PantryAddSheet.tsx:18` — `type Tab = 'manuale' | 'voce' | 'lista';`; righe 100–104 array tab; righe 276–310 i due tab stub "In arrivo".
- `src/components/pantry/PantryItemRow.tsx:90–121` — azioni desktop hover-only `onConsume`/`onAddToList`/`onEdit`; la pagina (`dispensa/page.tsx:63–69`) passa **solo** `onEdit`: consume/add-to-list sono morte anche su desktop.
- `src/components/pantry/PantryDesktopSidebar.tsx:54–71` — card "Dalla lista spesa" con copy promissorio ("Segna gli acquisti come completati…") e link a `/lista-spesa`.
- `firebase/firestore.rules:70–75` — ownership su `pantry_items`; `firebase/firestore.indexes.json` ha già `(userId ASC, createdAt DESC)` per `pantry_items` (inutilizzato, nessuna modifica).

### 2.4 Cottura

- `src/app/(dashboard)/ricette/[id]/cooking/page.tsx:278–298` — la funzione da agganciare:
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
  In scope al momento del tap: `recipe` completo, `servings` (porzioni cucinate), `scaledIngredients` (effetto righe 162–173 via `scaleQuantity`), `cookingSession`. Bottone alle righe 518–525, abilitato solo a progresso 100%.
- **Bug latente documentato**: `createCookingHistoryEntry` (`src/lib/firebase/cooking-history.ts:34–51`) usa `addDoc`; se `deleteCookingSession` fallisce dopo la history, il retry di "Termina cottura" **duplica la entry** in `cooking_history`.
- Percorso abbandono: `src/app/(dashboard)/cotture-in-corso/page.tsx:73–87` (`handleConfirmDeleteSession`) cancella la sessione **senza** history — non va MAI toccato dallo scalo.
- `src/lib/utils/ingredient-scaler.ts:29` — `scaleQuantity(quantity, originalServings, newServings)`: string-in/string-out, pass-through per q.b. e parse failure, **mai** conversione di unità.

## 3. Decisioni di prodotto (vincoli dal roadmap)

1. **Matching ibrido** (decisione 1): match automatico solo conservativo (chiave canonica esistente, accenti + singolare/plurale); casi incerti → proposta + conferma utente una tantum → **alias persistente su `PantryItem.aliases`**, valido per lista spesa E scalo cottura. Filosofia invariata: **il non-match è il fallimento sicuro** — un falso "già in dispensa" è peggio di un falso negativo.
2. **Spunta → dispensa in batch** (decisione 2): nessuna interruzione durante la spesa; un bottone apre un flusso unico con tutti gli articoli spuntati, ognuno con posizione/quantità/scadenza precompilate e modificabili.
3. **Banali e doppioni** (decisione 3): lista fissa curata **mai** mostrata in lista; match con scorta sufficiente → sezione collassata "Hai già in casa" re-includibile con un tap; match non quantificabile → resta in lista con badge informativo ("In dispensa: 500 g").
4. Contratto cross-spec §2: il modulo si chiama **`src/lib/utils/ingredient-matching.ts`** ed esporta almeno `canonicalIngredientKey`, `isTrivialIngredient`, `matchIngredientToPantry` con le firme lì definite; `PantryItem.aliases?: string[]`; `parseQuantity`/conversioni unità esportate e riusabili. Spec E importerà da qui: **non cambiare questi nomi**.

## 4. Design proposto

### 4.1 Modello dati (prima/dopo)

**`src/types/pantry.ts`** — `PantryItem` guadagna un campo (nessuna migrazione: assente = nessun alias):

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
   * Chiavi canoniche (canonicalIngredientKey) confermate dall'utente come
   * "questo ingrediente è questa voce di dispensa". Scritte solo dal flusso
   * di conferma suggerimenti; mai undefined su Firestore (omesso o array).
   */
  aliases?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**`src/types/index.ts`** — `MealPlan` (dopo riga 442) guadagna:

```ts
  /** Shopping list state stored here to sync across devices. */
  shoppingCheckedIds?: string[] | null;
  shoppingCustomItems?: ShoppingItem[] | null;
  /**
   * Item ids (ShoppingItem.id) che l'utente ha ri-incluso in lista pur avendo
   * l'ingrediente in dispensa ("Mi serve comunque"). Persistito insieme a
   * checked/custom nello stesso write (nessun nuovo target di persistenza).
   */
  shoppingPantryIncludedIds?: string[] | null;
```

**`AdHocShoppingItem`** (`src/types/index.ts:496`) guadagna il flag equivalente — viaggia dentro l'array già persistito su `users/{uid}`, quindi riusa debounce/flush ad-hoc esistenti:

```ts
export interface AdHocShoppingItem {
  id: string;
  name: string;
  quantity: string;
  checked: boolean;
  /** true = ri-incluso in lista nonostante il match dispensa. Assente = false. */
  pantryIncluded?: boolean;
}
```

Attenzione Firestore: quando si riscrive l'array ad-hoc, `pantryIncluded` va scritto come boolean oppure **omesso** (mai `undefined` dentro l'oggetto — usare spread condizionale nella costruzione dell'item aggiornato).

### 4.2 Modulo `src/lib/utils/ingredient-matching.ts` (contratto 2 — vincolante)

**Layout delle dipendenze** (per evitare cicli): la macchineria quantità **resta definita** in `ingredient-aggregator.ts` che passa da `function` a `export function` / `export const`; `ingredient-matching.ts` importa da lì e **ri-esporta** ciò che il contratto richiede. Direzione unica `matching → aggregator`, zero churn sui test esistenti.

**Modifiche a `ingredient-aggregator.ts`** — diventano esportati (solo keyword, nessun cambio di corpo):
- `export function canonicalIngredientKey(...)` (riga 164) e, per i test, `export function singularizeWord(...)` (riga 184);
- `export function parseQuantity(...)` (riga 298);
- `export const UNIT_ALIASES` (riga 224), `export const NON_SCALABLE_RE` (riga 218);
- `export function formatQuantity(...)` (riga 322) e `export function formatItalianNumber(...)` (riga 332);
- `export type QuantityDimension` (riga 208) e `export interface ParsedQuantity` (riga 210).

**Contenuto di `ingredient-matching.ts`**:

```ts
import { PantryItem } from '@/types/pantry';
import {
  canonicalIngredientKey,
  parseQuantity,
  UNIT_ALIASES,
  ParsedQuantity,
  QuantityDimension,
} from './ingredient-aggregator';

// Ri-esporta per Spec E e per i consumatori del contratto (roadmap §2).
export { canonicalIngredientKey, parseQuantity, UNIT_ALIASES };
export type { ParsedQuantity, QuantityDimension };
```

#### 4.2.1 `isTrivialIngredient(name: string): boolean`

Criterio della lista: **solo cose che nessuno compra** — acqua di rubinetto in tutte le sue temperature/forme e ghiaccio fatto in casa. Sale, olio, pepe, zucchero **non** sono banali: si comprano, e li gestisce il match dispensa. La lista è di **frasi intere** in italiano leggibile; le chiavi si derivano una volta con `canonicalIngredientKey` così lo stemming resta coerente col resto del sistema:

```ts
/**
 * SOLO cose che nessuno compra al supermercato. Lista fissa curata, chiusa.
 * NON aggiungere sale/olio/pepe/zucchero: si comprano, li gestisce il match
 * dispensa. Il confronto è per uguaglianza esatta della chiave canonica:
 * "acqua di rose" o "acqua di mare" NON matchano e restano in lista (corretto).
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

/** Variante per chi ha già la chiave canonica in mano (aggregatore). */
export function isTrivialIngredientKey(key: string): boolean {
  return TRIVIAL_KEYS.has(key);
}
```

Match **esatto sulla chiave intera**, niente sottostringhe: fail-safe (una frase non in lista resta in lista). Nota su "acqua frizzante": inclusa perché nelle ricette compare come componente di pastelle/impasti, non come bevanda da comprare — decisione del brainstorming, non rimetterla in discussione.

#### 4.2.2 `matchIngredientToPantry(name, pantryItems)`

Firma dal contratto (invariante):

```ts
export type PantryMatch =
  | { item: PantryItem; confidence: 'exact' | 'alias' }
  | { item: null; suggestions: PantryItem[] };

export function matchIngredientToPantry(
  name: string,
  pantryItems: PantryItem[]
): PantryMatch
```

Algoritmo:

1. `key = canonicalIngredientKey(name)`.
2. **Exact**: item con `canonicalIngredientKey(item.name) === key`. Se più d'uno (doppioni in dispensa): scegliere quello con `qty` maggiore, a parità il primo in ordine d'array (deterministico, e mostra la scorta più utile).
3. **Alias**: item con `(item.aliases ?? []).includes(key)`. Exact vince sempre su alias; stessa regola di disambiguazione.
4. **Nessun match** → `{ item: null, suggestions }` con l'euristica fuzzy sotto (max 3, mai azzardata).

**Euristica suggerimenti** (proposta, conservativa):

```ts
const STOPWORD_TOKENS = new Set(['di', 'd', 'al', 'all', 'alla', 'con', 'senza', 'per', 'e', 'in', 'da', 'dell', 'della', 'dello', 'del']);
// NB: le stopword vanno espresse come TOKEN GIÀ STEMMATI (es. "della" → "dell"
// dopo singularizeWord): derivarle nel modulo applicando canonicalIngredientKey
// alla lista leggibile, come per TRIVIAL_KEYS.

function significantTokens(key: string): Set<string> {
  return new Set(key.split(' ').filter(t => !STOPWORD_TOKENS.has(t)));
}
```

Un `PantryItem` è suggerito per `name` se, detti `A = significantTokens(key)` e `B = significantTokens(canonicalIngredientKey(item.name))`:
- `A ⊆ B` oppure `B ⊆ A` (sottoinsieme **proprio**: insiemi uguali si scartano — quasi sempre coincidono con l'exact match sulla chiave; i rari casi con stessi token significativi ma chiave diversa per sole stopword/ordine restano non suggeriti, coerente col fail-safe), **e**
- l'intersezione contiene almeno un token di lunghezza ≥ 4 (post-stemming; esclude match su token corti tipo "the", "uva" → "uva" ha 3 char e non basta da solo), **e**
- entrambe le parti hanno almeno 1 token significativo.

Esempi: "spaghetti" (`{spaghett}`) ⊂ "Spaghetti fini" (`{spaghett, fin}`) → suggerito. "Pomodori" (`{pomodor}`) ⊂ "Passata di pomodoro" (`{passat, pomodor}`) → suggerito (l'utente conferma o rifiuta: nessun automatismo). "Farina" vs "Farina di mandorle" → suggerito. "Latte" vs "Latte di cocco" → suggerito. "Sale" (`{sal}`) vs "Salsa di soia" (`{sals, soi}`) → **non** suggerito (nessun token in comune: i token si confrontano per uguaglianza esatta, mai per prefisso — "sal" ≠ "sals"). "Uva" (`{uva}`) vs "Uva passa" (`{uva, pass}`) → **non** suggerito (unico token comune di 3 char, sotto la soglia ≥ 4). Ordinamento: per numero di token extra crescente (il più simile primo), poi alfabetico; `slice(0, 3)`.

#### 4.2.3 Confronto scorte: `comparePantryStock`

Serve alla sezione "Hai già in casa" e allo scalo cottura. Union discriminata (gotcha "Union non discriminata"):

```ts
export type PantryStockComparison =
  | {
      comparable: true;
      sufficient: boolean;        // availableBase >= requiredBase && availableBase > 0
      requiredBase: number;       // nell'unità base della dimensione
      availableBase: number;
      dimension: QuantityDimension;
    }
  | { comparable: false; reason: 'unparsable' | 'dimension-mismatch' | 'unit-mismatch' | 'empty' };

/** Converte qty+unit di una voce dispensa in ParsedQuantity (base g/ml o count). */
export function parsePantryQty(item: PantryItem): ParsedQuantity;

export function comparePantryStock(
  ingredientQuantity: string,
  item: PantryItem
): PantryStockComparison;
```

Regole:
- `ingredientQuantity` che contiene `' + '` (displayQuantity concatenata, es. `"200 g + q.b."`) → `{ comparable: false, reason: 'unparsable' }` senza tentare il parse (il concatenato è per definizione non sommabile).
- `parseQuantity(ingredientQuantity) === null` (q.b., testo libero) → `'unparsable'`.
- Lato dispensa: `unit.toLowerCase()` prima del lookup in `UNIT_ALIASES` (gestisce `'L'`); unità non in alias (`pz`, `vasetti`, `mazzo`, `testa`, stringa vuota) → dimensione `'count'` col token come unit.
- **Equivalenza count**: i token `''`, `'pz'`, `'pezzo'`, `'pezzi'` sono lo stesso count ("2" in ricetta vs "6 pz" in dispensa → confrontabili). Altri token count devono coincidere esattamente (`mazzo` ≠ `vasetti` → `'unit-mismatch'`).
- Dimensioni diverse (count vs massa: "2 pomodori" vs "500 g") → `'dimension-mismatch'`. **Nessuna tabella di densità**: fuori scope per scelta.
- `item.qty <= 0` → `{ comparable: false, reason: 'empty' }` (una scorta a zero non deve né spostare l'item né mostrare badge).

### 4.3 Parte 2 — Filtro banali in lista

**Dove**: in `aggregateIngredients`, non in `buildContributions`. Motivazione: (a) `buildContributions` descrive "cosa contiene il piano" ed è il punto giusto per consumatori futuri che vogliono fedeltà totale; il filtro è una policy di presentazione/aggregazione; (b) in `aggregateIngredients` la chiave canonica è già calcolata per ogni contribution (riga 89), quindi il check è gratuito con `isTrivialIngredientKey(key)` senza doppia canonicalizzazione.

```ts
// in aggregateIngredients, nel loop delle contributions:
for (const c of contributions) {
  const key = canonicalIngredientKey(c.name);
  if (isTrivialIngredientKey(key)) continue;   // <— NUOVO
  ...
}
```

Import `isTrivialIngredientKey` da `./ingredient-matching`: la direzione `aggregator → matching` per questa sola funzione è aciclica perché `isTrivialIngredientKey` non dipende dall'aggregatore a runtime? **No — dipende** (usa `canonicalIngredientKey`). Per evitare il ciclo di import: spostare `TRIVIAL_INGREDIENT_NAMES`/`TRIVIAL_KEYS`/`isTrivialIngredientKey` **dentro `ingredient-aggregator.ts`** (dove vive `canonicalIngredientKey`) e ri-esportarli da `ingredient-matching.ts` come il resto. È lo stesso pattern di ri-esportazione già scelto per `canonicalIngredientKey`: il contratto richiede solo che `ingredient-matching.ts` **esporti** `isTrivialIngredient`, non dove sia definita.

**Percorso ad-hoc** — filtro a monte, in `addRecipeToAdHocShoppingList` (`shopping-adhoc.ts:50`):

```ts
items: recipe.ingredients
  .filter(ingredient => !isTrivialIngredient(ingredient.name))
  .map((ingredient): AdHocShoppingItem => ({ ... })),
```

Filtrare alla copia (non al render) mantiene puliti i dati persistiti e corretti i conteggi progresso. I gruppi ad-hoc **già salvati** prima del rilascio possono contenere banali: restano visibili finché l'utente non li rimuove o ri-aggiunge la ricetta (dedup su recipeId li rimpiazza) — accettato, nessuna migrazione.

**MAI sugli articoli custom**: `addCustomItem` (`useShoppingList.ts:452`) non cambia — se l'utente digita "acqua frizzante" la vuole in lista.

**Igiene checkedIds**: gli id degli item filtrati diventano voci **inerti** in `shoppingCheckedIds` (il set contiene id che nessun item mostra più) — innocuo e già vero oggi quando una ricetta esce dal piano; documentarlo con un commento accanto al filtro.

### 4.4 Parte 3 — Sezione "Hai già in casa"

#### 4.4.1 Derivazione (in `useShoppingList`)

Il hook monta `usePantry()` (riusa `pantryQueryKey`, `staleTime 2min`, `enabled: !!user` — nessun nuovo percorso di fetch) e calcola in un `useMemo` una mappa di classificazione:

```ts
export type PantryMatchInfo =
  | { kind: 'in-pantry'; item: PantryItem }          // match + confrontabile + scorta sufficiente
  | { kind: 'badge'; item: PantryItem }              // match ma non confrontabile / insufficiente (qty > 0)
  | { kind: 'suggestion'; candidates: PantryItem[] } // nessun match, candidati fuzzy
  | { kind: 'none' };

// nel hook:
const pantryInfoById = useMemo(() => {
  const map = new Map<string, PantryMatchInfo>();
  // pre-indicizza la dispensa UNA volta: Map<chiave, item> per exact e per alias
  // (O(n+m), liste piccole — <100 voci per lato, nessun problema di performance)
  for (const it of planItems) map.set(it.id, classify(it.name, it.displayQuantity));
  for (const g of adHocRecipesList)
    for (const it of g.items) map.set(it.id, classify(it.name, it.quantity));
  return map;
}, [planItems, adHocRecipesList, pantryItems]);
```

`classify(name, quantity)`:
1. `matchIngredientToPantry(name, pantryItems)`;
2. match trovato → `comparePantryStock(quantity, item)`:
   - `comparable && sufficient` → `'in-pantry'`;
   - `comparable && !sufficient` → `'badge'`;
   - `!comparable && reason !== 'empty'` → `'badge'` (match non quantificabile: resta in lista con badge, decisione 3);
   - `reason === 'empty'` → `'none'` (scorta a zero: né sezione né badge);
3. nessun match, `suggestions.length > 0` → `'suggestion'`; altrimenti `'none'`.

**Scope**: solo item derivati dal piano e item ad-hoc. Gli **articoli custom** non vengono mai classificati (l'utente li ha scritti apposta).

#### 4.4.2 Persistenza dei re-include

**Item del piano** (gli articoli custom non sono mai classificati, §4.4.1, quindi non entrano mai qui): nuovo stato locale `pantryIncludedIds: string[]` che **viaggia nello stesso write** del piano — NON è un terzo target di persistenza, è un terzo campo del target esistente. Il gotcha "Nuovo target di persistenza dimenticato nel flush" (AGENTS.md riga 42) si applica in forma attenuata: niente nuovo timer, ma il campo deve entrare in **tutti** i punti del circuito esistente. Checklist esaustiva in `useShoppingList.ts`:

1. `useState<string[]>([])` accanto a `checkedIdsList`/`customItems` (riga 153);
2. `latestStateRef` (riga 165): aggiungere `pantryIncludedIds` allo snapshot e al sync effect (riga 173);
3. `flushPendingShoppingState` (riga 191): leggerlo dal ref e passarlo al write;
4. reset al cambio settimana (riga 276): azzerarlo;
5. init effect (riga 286): `setPantryIncludedIds(data.initialPantryIncludedIds)` — la query (riga 120) ritorna anche `initialPantryIncludedIds: plan.shoppingPantryIncludedIds ?? []`;
6. persist effect (riga 315): aggiungerlo alle dependency e allo snapshot debounced;
7. `PersistedState` localStorage (riga 20): `pantryIncludedIds: string[]`, con default `[]` in `loadPersistedState` per i JSON legacy (`parsed.pantryIncludedIds ?? []`);
8. `updateMealPlanShoppingState` (meal-plans.ts:181): quarta posizione nella firma, scrive `shoppingPantryIncludedIds: pantryIncludedIds` (sempre array, mai undefined).

**Item ad-hoc**: `pantryIncluded?: boolean` sull'item — il toggle muta `adHocRecipesList` e la persistenza avviene col debounce/flush ad-hoc **già esistente** (righe 261–272 + 234). Zero nuovi timer. In `flushAll` non serve aggiungere nulla: entrambi i flush esistenti coprono i nuovi campi perché leggono dai latest-ref aggiornati.

API del hook (aggiunte a `UseShoppingListReturn`):

```ts
pantryInfoById: Map<string, PantryMatchInfo>;
pantryIncludedIds: Set<string>;                                  // item piano ri-inclusi
togglePantryIncluded: (id: string, adHocGroupId?: string) => void; // piano o ad-hoc
confirmPantryAlias: (pantryItem: PantryItem, ingredientName: string) => Promise<void>;
dismissPantrySuggestion: (id: string) => void;                   // solo sessione, non persistito
```

`confirmPantryAlias`: `updatePantryItem(pantryItem.id, { aliases: [...new Set([...(pantryItem.aliases ?? []), canonicalIngredientKey(ingredientName)])] })` poi `queryClient.invalidateQueries({ queryKey: pantryQueryKey(uid) })` → il memo si ricalcola e l'item si ricategorizza da solo. `dismissPantrySuggestion` alimenta un `Set<string>` in stato locale (id item): i suggerimenti rifiutati non ricompaiono nella sessione corrente ma **non** sono persistiti (ricompaiono alla prossima visita — accettato: sono discreti, e persistere i rifiuti sarebbe un nuovo campo con nuovo circuito di flush per un beneficio marginale).

#### 4.4.3 UI

**Partizione** (in `ShoppingListContent`, sui soli item piano): un item con `kind === 'in-pantry'` e id **non** in `pantryIncludedIds` esce dalle sezioni normali e finisce nella sezione "Hai già in casa". Stessa logica per gli item ad-hoc (`pantryIncluded !== true`). Tutto il resto resta dov'è.

**Sezione "Hai già in casa"**: renderizzata **dopo** le sezioni piano e **prima** dei gruppi ad-hoc, stile `ShoppingSection` ma `defaultExpanded={false}` e senza checkbox: righe non spuntabili (non c'è nulla da comprare). Ogni riga: nome, caption `In dispensa: {formatQty(item)}` (es. "In dispensa: 500 g"), e bottone testuale **"Mi serve comunque"** (touch-target ≥ 44px, sempre visibile — mai `group-hover` sotto `lg`). Tap → `togglePantryIncluded(id[, groupId])` → l'item torna nella sua sezione d'origine.

**Item ri-incluso**: torna nella sezione normale, spuntabile, con footnote estesa: `"{fonte} · In dispensa: 500 g"` e un'azione secondaria discreta **"Ce l'ho già"** (testo, `text-muted-foreground`) per rimandarlo nella sezione.

**Badge informativo** (`kind === 'badge'`): l'item resta in lista normale con footnote `In dispensa: {formatQty(item)}` accodata alla fonte esistente. Colori: `text-accent` su `bg-accent/10` per il badge, mai verdi raw (token semantici, dark mode gratis).

**Riga suggerimento** (`kind === 'suggestion'`, non dismissato): sotto la riga dell'item, una riga compatta:

> Forse ce l'hai già: **Spaghetti fini** — è lo stesso?  [Sì, è lo stesso] [No]

- "Sì, è lo stesso" → `confirmPantryAlias(candidato, item.name)` + toast `Collegato a "Spaghetti fini" in dispensa` → l'item si ricategorizza (sezione o badge a seconda della scorta);
- "No" → `dismissPantrySuggestion(id)`.
- Se i candidati sono più d'uno si mostra solo il primo (il più simile); niente caroselli.
- **Nessuno spostamento automatico**: finché l'utente non conferma, l'item resta in lista normale.

**Progress bar**: gli item in "Hai già in casa" (non ri-inclusi) escono dal conteggio `progress.total` (e i loro eventuali id spuntati dal `checked`), così il 100% resta raggiungibile. `clearChecked` non tocca `pantryIncludedIds`.

**Staleness**: dati dispensa con `staleTime 2min` — la sezione può riflettere con ritardo modifiche fatte altrove (altro device). Le mutazioni locali (alias, batch, scalo) invalidano `pantryQueryKey` e aggiornano subito. Accettato e da documentare in un commento nel hook.

### 4.5 Parte 4 — Batch spunta → dispensa

#### 4.5.1 Entry point

In `ShoppingListContent`, quando esiste **almeno un articolo spuntato** (piano/custom via `checkedIds` ∩ item visibili, oppure ad-hoc con `checked === true`), sopra il bottone "Aggiungi articolo":

```tsx
<Button className="w-full" onClick={() => setPantrySheetOpen(true)}>
  <Archive className="w-4 h-4 mr-2" />
  Aggiungi alla dispensa ({checkedCount})
</Button>
```

#### 4.5.2 Builder puro delle righe — `src/lib/utils/pantry-batch.ts`

```ts
export interface PantryDraftRow {
  sourceId: string;               // ShoppingItem.id o AdHocShoppingItem.id
  include: boolean;               // default true
  name: string;                   // editabile solo se existingItem === null
  qty: number;                    // nell'unità scelta
  unit: string;                   // valore di PANTRY_UNITS
  categoryId: string;
  position: PantryItem['position']; // default 'dispensa'
  expires: string;                // '' = nessuna scadenza
  existingItem: PantryItem | null; // match exact/alias → UPDATE (incremento)
  /** Copy informativa mostrata sotto la riga (es. incremento proposto). */
  note: string | null;
}

export function buildPantryDraftRows(
  checked: Array<{ id: string; name: string; quantity: string }>,
  pantryItems: PantryItem[]
): PantryDraftRow[];
```

Precompilazione quantità da `parseQuantity(quantity)`:
- massa: `baseValue >= 1000` → `{ qty: base/1000, unit: 'kg' }`, altrimenti `{ qty: base, unit: 'g' }`; volume idem con `L`/`ml` (nota: unità dispensa `'L'` maiuscola);
- count con token in `{'', 'pz', 'pezzo', 'pezzi'}` → `{ qty: value, unit: 'pz' }`;
- count con altro token ("3 cucchiai") o parse `null` (q.b.) → **fallback `{ qty: 1, unit: 'pz' }`** con `note: 'Quantità in lista: "3 cucchiai"'` così l'utente corregge a vista;
- **displayQuantity concatenata** (`"200 g + q.b."`, `"200 g + 3"`): split su `' + '`, parse di ogni segmento; se i segmenti parsati condividono una sola dimensione massa/volume → somma delle basi (mirror di `mergeQuantities`) e i segmenti non parsabili si ignorano (`"200 g + q.b."` → 200 g, `note: 'Quantità in lista: "200 g + q.b."'`); se nessun segmento è utilizzabile o le dimensioni sono miste → fallback 1 pz con nota.

Categoria: se `existingItem` → `existingItem.categoryId`; altrimenti **`'altro'`** — slug non presente in `PANTRY_CATEGORIES` che la pagina dispensa già raggruppa sotto "Altro" (`dispensa/page.tsx:242–255`) e che Spec E formalizzerà nella tassonomia. Il select della riga mostra le 10 categorie + voce "Altro" (value `altro`). Motivazione contro il default `'condimenti'` di `PantryAddSheet`: silenziosamente sbagliato per quasi tutto; "Altro" è onesto e ordinabile dopo.

Match esistente (via `matchIngredientToPantry`):
- stessa dimensione confrontabile → la riga è un **incremento**: `qty` precompilata = quantità acquistata **convertita nell'unità della voce esistente** (base / factor dell'unità, arrotondata a 1 decimale), `unit` bloccata su quella della voce, nome **non editabile** (si aggiorna quel documento), `note: 'Già in dispensa: 500 g → diventa 1,5 kg'`;
- dimensioni non confrontabili → resta un incremento ma `qty` precompilata `0` e `note: 'Già in dispensa: 6 pz — unità non confrontabili, imposta tu l'incremento'`;
- l'update imposta anche `purchased = oggi`; `expires` solo se compilata (altrimenti il valore esistente resta).

Righe multiple che puntano alla **stessa voce esistente** (es. item piano + item ad-hoc dello stesso ingrediente): in fase di apply gli incrementi si **accumulano** sulla stessa `qty` (mai due update indipendenti sullo stesso doc in batch: l'ultimo vincerebbe).

Creazioni: `purchased = oggi` in formato locale via `formatLocalDate(new Date())` (`src/lib/constants/seasons.ts:72` — MAI `toISOString().slice(0,10)`, gotcha timezone), `min: 0`, `notes: null`, `expires: form || null`.

#### 4.5.3 Apply — `applyPantryBatch` in `src/lib/firebase/pantry.ts`

```ts
export interface PantryBatchOp {
  kind: 'create' | 'update';
  itemId?: string;                 // per update
  data: Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>  // create
      | Partial<Omit<PantryItem, 'id' | 'userId' | 'createdAt'>>;      // update
}

export async function applyPantryBatch(userId: string, ops: PantryBatchOp[]): Promise<void>
```

Implementazione con `writeBatch(db)`: create = `batch.set(doc(collection(db, 'pantry_items')), {...data, userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp()})`; update = `batch.update(ref, {...data, updatedAt: serverTimestamp()})`; un solo `commit()` → **atomico** (o tutto o niente, niente dispense a metà). Le rules esistenti coprono entrambe le operazioni.

#### 4.5.4 Sheet `AddCheckedToPantrySheet` — `src/components/shopping-list/AddCheckedToPantrySheet.tsx`

Pattern `PantryAddSheet`: bottom sheet mobile, modale centrata 540px su `lg` (stessa `className` di `PantryAddSheet.tsx:111`), `SheetDescription` sr-only, contenuto scrollabile `max-h-[92dvh]`.

- Titolo: **"Aggiungi alla dispensa"**; sottotitolo: *"Gli articoli spuntati, pronti da salvare. Controlla e conferma."*
- Una card per riga (`PantryDraftRow`): checkbox include (`accent-primary`), nome (input se creazione, testo fisso se incremento), riga qty+unit (input number `step 0.1` + select `PANTRY_UNITS`), select categoria, toggle posizione (3 bottoni, pattern PantryAddSheet), input date scadenza opzionale, `note` in `text-xs text-muted-foreground`.
- Footer: "Annulla" + **"Salva in dispensa (N)"** (N = righe incluse; disabilitato a N=0 o durante il salvataggio).
- Conferma → costruisce le op (accumulo incrementi per doc, clamp `qty` a ≥ 0), `applyPantryBatch`, invalida `pantryQueryKey(uid)`, toast riepilogo: `"3 prodotti aggiunti, 1 aggiornato in dispensa"` (declinazioni singolare/plurale); errore → `toast.error('Impossibile aggiornare la dispensa. Riprova.')` e sheet aperta (l'atomicità del batch rende il retry sicuro).
- **Gli articoli restano spuntati**: nessuna modifica a `checkedIds`/`checked` (la spunta significa "comprato", non "archiviato").

### 4.6 Parte 5 — Scalo dispensa a fine cottura

#### 4.6.1 Calcolo puro — `src/lib/utils/pantry-deduction.ts`

```ts
export type PantryDeductionRow =
  | {
      kind: 'proposed';
      pantryItem: PantryItem;
      ingredientName: string;
      scaledQuantity: string;   // per display ("300 g")
      deductQty: number;        // nell'unità della voce dispensa, già clampato a item.qty
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
      candidate: PantryItem;    // il migliore, uno solo
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

Per ogni ingrediente (saltando `isTrivialIngredient`): `scaled = scaleQuantity(ingredient.quantity, originalServings, cookedServings)`; `matchIngredientToPantry(name, pantryItems)`:
- match → `comparePantryStock(scaled, item)`: confrontabile → riga `proposed` con `deductQty = min(requiredBase, availableBase)` convertito nell'unità della voce (arrotondato a 1 decimale); non confrontabile → riga `excluded` col motivo;
- nessun match ma suggestions → riga `suggestion` (solo il primo candidato);
- nessun match, nessun suggerimento → nessuna riga.

Più ingredienti sulla stessa voce dispensa (ricetta multi-sezione): le righe `proposed` si **fondono sommando** i `deductQty` prima del clamp finale a `item.qty`.

#### 4.6.2 Dialog `PantryDeductionDialog` — `src/components/pantry/PantryDeductionDialog.tsx`

Componente controllato costruito sui primitivi `Dialog` Radix (come `ConfirmDialog`, ma con contenuto ricco — `ConfirmDialog` non basta: righe editabili). Titolo **"Scala la dispensa"**, descrizione *"Hai usato questi ingredienti: aggiorno le scorte?"*.

- Righe `proposed`: checkbox include (default **on**), nome ingrediente → nome voce dispensa, input number del decremento nell'unità della voce (`step 0.1`, min 0, max `item.qty`), caption `"{formatQty(item)} → {nuovo valore}"` aggiornata live.
- Righe `suggestion`: checkbox default **off**, copy *"Forse è {nome voce} — conferma per scalare"*; se inclusa alla conferma, prima si salva l'alias (stesso `updatePantryItem` della parte 3) e poi si applica il decremento **solo se** `comparePantryStock` risulta confrontabile, altrimenti la riga viene ignorata con `console.warn`.
- Righe `excluded`: visibili, opache, non selezionabili, con motivo in italiano: `unparsable` → *"Quantità non quantificabile (es. q.b.)"*; `dimension-mismatch`/`unit-mismatch` → *"Unità non confrontabili"*; `empty` → *"Scorta già a zero"*.
- Footer: **"Salta"** (variant outline) e **"Aggiorna e termina"** (primary). Entrambi chiudono il flusso di cottura; "Salta" salta solo lo scalo.
- Il decremento scrive `qty = Math.max(0, item.qty - deduct)` — **clamp a 0, mai delete automatico** della voce.

#### 4.6.3 Wiring in `handleFinishCooking` (cooking/page.tsx:278)

La pagina monta `usePantry()` (dati cache ≤ 2 min: accettabile, il dialog è comunque editabile). Nuovo flusso:

```ts
const pantryDeductedRef = useRef(false);   // guardia anti doppio-scalo su retry

const handleFinishCooking = () => {
  if (!user || !cookingSession || !recipe) return;
  const rows = pantryDeductedRef.current
    ? []
    : computePantryDeductions(recipe.ingredients, recipe.servings || 4, servings, pantryItems);
  if (rows.some(r => r.kind !== 'excluded')) {
    setDeductionRows(rows);
    setDeductionDialogOpen(true);          // il completamento prosegue da onConfirm/onSkip
  } else {
    void finalizeCooking(null);            // nessun match: comportamento identico a oggi
  }
};

const finalizeCooking = async (deductions: ConfirmedDeduction[] | null) => {
  try {
    if (deductions && deductions.length > 0 && !pantryDeductedRef.current) {
      await applyPantryDeductions(user.uid, deductions);   // writeBatch di updateDoc, clamp a 0
      pantryDeductedRef.current = true;
      queryClient.invalidateQueries({ queryKey: pantryQueryKey(user.uid) });
    }
    await createCookingHistoryEntry({
      userId: user.uid,
      recipeId: recipe.id,
      recipeTitle: recipe.title,
      servings: servings || null,
      entryId: cookingSession.id,          // NUOVO — idempotenza, vedi sotto
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

**Ordine delle scritture e fallimenti parziali** (da documentare in un commento nel codice):
1. **Batch dispensa per primo**: se fallisce, niente è successo (batch atomico) e la sessione sopravvive — retry pulito.
2. **History con id deterministico**: `createCookingHistoryEntry` guadagna `entryId?: string`; quando presente usa `setDoc(doc(db, 'cooking_history', entryId), ...)` invece di `addDoc`. L'id di sessione è unico per cottura → un retry **sovrascrive lo stesso documento** invece di duplicarlo. Questo **risolve il bug di duplicazione già esistente oggi** (history via `addDoc` + delete fallita + retry). Le rules attuali permettono sia create sia update al proprietario. I chiamanti senza `entryId` (nessuno oggi oltre la cooking page) mantengono `addDoc`.
3. **Delete sessione per ultimo**: se fallisce dopo history, il retry riscrive la stessa history (innocuo) e non ri-scala (`pantryDeductedRef`).
4. **Rischio residuo documentato**: se dopo un batch riuscito l'utente **ricarica la pagina** e ritenta, `pantryDeductedRef` è perso e il dialog ripropone lo scalo → possibile doppio decremento. Mitigazione accettata: il dialog è sempre esplicito e mostra le scorte correnti (già decrementate), quindi l'utente vede numeri già scalati e può premere "Salta". Un flag persistito sulla sessione (`pantryDeducted: boolean` su `cooking_sessions`) è la mitigazione completa: **implementarlo** (un `updateCookingSession(sessionId, { pantryDeducted: true })` subito dopo il batch, e il computo delle righe salta se `cookingSession.pantryDeducted`), aggiungendo il campo opzionale a `CookingSession` (`src/types/index.ts:285`). Costo minimo, chiude il buco del reload.

`applyPantryDeductions` è una thin-wrapper su `applyPantryBatch` (solo update `qty`).

**Il percorso abbandono non scala MAI**: `cotture-in-corso/page.tsx:73–87` resta intatto.

### 4.7 Parte 6 — Micro-fix

1. **"Aggiungi articolo" senza piano** (`ShoppingListContent.tsx:125`): rimuovere il gate `hasPlan &&` attorno al bottone; nell'empty state "Nessun piano" (righe 52–69) aggiungere sotto il CTA "Vai al pianificatore" un bottone secondario "Aggiungi articolo" e montare comunque `AddCustomItemSheet` (spostare il `return` anticipato in un render condizionale che condivide la sheet). La persistenza no-plan esiste già: `useShoppingList.ts:336–338` scrive su localStorage quando `planId` è null. Motivazione: la feature funziona già a livello dati, il gate è solo UI.
2. **ConfirmDialog sul delete di `PantryItemQuickSheet`** (righe 120–128): stato locale `confirmDeleteOpen`, `ConfirmDialog` renderizzato come fratello della `Sheet` con `title: 'Eliminare {item.name}?'`, `description: 'Il prodotto verrà rimosso dalla dispensa.'`, `confirmLabel: 'Elimina'`, `isConfirming` legato alla mutation; alla conferma `deleteItem.mutateAsync` → chiudi entrambi. Motivazione: regola di progetto (mai delete distruttivi diretti), stesso pattern di `AdHocRecipeGroup`.
3. **"Consumato" con semantica per unità** (righe 38–43): per unità count (`pz`, `vasetti`, `mazzo`, `testa`) resta il decremento di 1 (clamp a 0). Per `g`/`kg`/`ml`/`L` il bottone si espande in tre chip proporzionali nella stessa sheet: **"Un po' (−25%)"**, **"Metà (−50%)"**, **"Tutto"** (→ 0); arrotondamento a 1 decimale (coerente con `formatQty`), clamp a 0. Motivazione: in cucina non si digita — tre tap proporzionali coprono i casi reali senza tastiera; il valore esatto resta modificabile da "Modifica prodotto".
4. **Stub morti dispensa**:
   - **Tab "A voce"**: rimossa del tutto (`Tab` type, entry nell'array, JSX stub, import `Mic`). Motivazione: promessa senza roadmap; se tornerà, tornerà col suo design.
   - **Tab "Da lista spesa"**: rimossa come tab; con una sola tab rimasta si elimina l'intera tab bar e `PantryAddSheet` diventa un form puro (meno UI, stesso comportamento). L'entry point verso il nuovo flusso batch vive: (a) nella card desktop "Dalla lista spesa" di `PantryDesktopSidebar` (righe 54–71), aggiornandone la copy a: *"Spunta gli articoli in lista e usa 'Aggiungi alla dispensa' per salvarli qui in un passaggio."* (il link a `/lista-spesa` resta); (b) il flusso reale sta nella lista spesa (parte 4), dove l'utente si trova a fine spesa. Motivazione: niente doppioni di implementazione, il signpost sostituisce lo stub.
   - **"Aggiungi a lista" in `PantryItemQuickSheet` (righe 86–92) e `onAddToList` in `PantryItemRow`**: rimossi. Motivazione: scrivere sul doc del piano da fuori `useShoppingList` andrebbe in **race con i write debounced full-array** del hook (last-write-wins sul medesimo campo) — implementarlo bene richiede un canale condiviso che non vale il costo ora. Meglio nessuna promessa che una promessa rotta.
   - **`onConsume` desktop mai wired** (`PantryItemRow.tsx:91–99`): rimosso il prop e il bottone. Motivazione: la nuova UX "Consumato" (chip proporzionali) vive nella quick sheet che è `lg:hidden`; un consume desktop `−1` secco reintrodurrebbe la semantica sbagliata appena corretta. Su desktop si usa "Modifica". (Il blocco hover-only resta legittimo perché `lg`-only, gotcha touch rispettato.)

### 4.8 Indici, regole, query

- **Nessun nuovo indice**: `getPantryItems` resta `where('userId','==',userId)` senza orderBy; nessuna nuova query composita.
- **Nessuna modifica alle rules**: `aliases`, `shoppingPantryIncludedIds`, `pantryIncluded`, `pantryDeducted` sono campi su documenti esistenti già coperti da ownership; `cooking_history` via `setDoc` è create/update dal proprietario, già permessi.
- **Nessuna nuova collection**.
- React Query: nessuna nuova query key; `useShoppingList` riusa `pantryQueryKey` via `usePantry()`; ogni mutazione dispensa invalida quella chiave.

## 5. Piano di implementazione a fasi

Ogni fase lascia `npx tsc --noEmit` e la build verdi. Le fasi 1–3 sono rilasciabili da sole (filtro banali + micro-fix), 4–6 costruiscono sopra.

**Fase 1 — Modulo di matching (nessun cambiamento visibile)**
- `src/lib/utils/ingredient-aggregator.ts`: `export` su `canonicalIngredientKey`, `singularizeWord`, `parseQuantity`, `UNIT_ALIASES`, `NON_SCALABLE_RE`, `formatQuantity`, `formatItalianNumber`, tipi `ParsedQuantity`/`QuantityDimension`; aggiunta di `TRIVIAL_INGREDIENT_NAMES`/`isTrivialIngredient`/`isTrivialIngredientKey` (definite qui, vicino a `canonicalIngredientKey`).
- Nuovo `src/lib/utils/ingredient-matching.ts`: ri-esporta il contratto, definisce `matchIngredientToPantry`, `parsePantryQty`, `comparePantryStock`, `PantryMatch`, `PantryStockComparison`.
- `src/types/pantry.ts`: `aliases?: string[]`.
- Nuovo `src/lib/utils/ingredient-matching.test.ts` (+ estensione `ingredient-aggregator.test.ts` per gli export).

**Fase 2 — Filtro banali + "Aggiungi articolo" senza piano**
- `src/lib/utils/ingredient-aggregator.ts`: skip in `aggregateIngredients` (commento igiene checkedIds).
- `src/lib/firebase/shopping-adhoc.ts`: filtro in `addRecipeToAdHocShoppingList`.
- `src/components/shopping-list/ShoppingListContent.tsx`: rimozione gate `hasPlan`, empty state con azione secondaria, sheet sempre montata.
- Test aggregatore aggiornati.

**Fase 3 — Micro-fix dispensa**
- `src/components/pantry/PantryItemQuickSheet.tsx`: ConfirmDialog delete, chip "Consumato" per unità, rimozione "Aggiungi a lista".
- `src/components/pantry/PantryAddSheet.tsx`: rimozione tab bar e stub.
- `src/components/pantry/PantryItemRow.tsx`: rimozione `onConsume`/`onAddToList`.
- `src/components/pantry/PantryDesktopSidebar.tsx`: nuova copy card "Dalla lista spesa".

**Fase 4 — Sezione "Hai già in casa"**
- `src/types/index.ts`: `MealPlan.shoppingPantryIncludedIds`, `AdHocShoppingItem.pantryIncluded`.
- `src/lib/firebase/meal-plans.ts`: quarta arg di `updateMealPlanShoppingState`.
- `src/lib/hooks/useShoppingList.ts`: `usePantry()`, memo `pantryInfoById`, stato/persistenza `pantryIncludedIds` (checklist §4.4.2 punto per punto), `togglePantryIncluded`, `confirmPantryAlias`, `dismissPantrySuggestion`, esclusione dal progress.
- `src/components/shopping-list/`: nuova `PantryOwnedSection.tsx`, estensioni `ShoppingListContent.tsx`/`ShoppingItemRow.tsx` (footnote badge, riga suggerimento, azione "Ce l'ho già"), `AdHocRecipeGroup.tsx` (stessa partizione per item ad-hoc).
- `src/app/(dashboard)/lista-spesa/page.tsx`: pass-through delle nuove props.

**Fase 5 — Batch spunta → dispensa**
- Nuovo `src/lib/utils/pantry-batch.ts` (+ test).
- `src/lib/firebase/pantry.ts`: `applyPantryBatch`.
- Nuovo `src/components/shopping-list/AddCheckedToPantrySheet.tsx`; bottone in `ShoppingListContent.tsx`.

**Fase 6 — Scalo a fine cottura**
- Nuovo `src/lib/utils/pantry-deduction.ts` (+ test).
- `src/lib/firebase/cooking-history.ts`: param `entryId` + `setDoc`.
- `src/types/index.ts`: `CookingSession.pantryDeducted?: boolean`.
- Nuovo `src/components/pantry/PantryDeductionDialog.tsx`.
- `src/app/(dashboard)/ricette/[id]/cooking/page.tsx`: `usePantry()`, split `handleFinishCooking`/`finalizeCooking`, guardie idempotenza.

A fine lavoro: aggiornare CLAUDE.md (Recent Changes + collezioni/campi), AGENTS.md (gotcha emersi: campo che viaggia nel write esistente ≠ nuovo target ma stessa checklist; `setDoc` idempotente per history), checklist in `specs/00-roadmap.md`.

## 6. Piano di test

### 6.1 Unit test (Jest — comando: `npm test`, config `jest.config.js`, stile di `src/lib/utils/ingredient-aggregator.test.ts` con factory di default)

`ingredient-matching.test.ts`:
- `canonicalIngredientKey` ri-esportata: pomodoro/pomodori stessa chiave; "pomodori pelati" ≠ "pomodori"; accenti.
- `isTrivialIngredient`: true per "Acqua", "acqua fredda", "Acqua di cottura", "ghiaccio", "Cubetti di ghiaccio"; **false** per "sale", "olio", "acqua di rose", "acqua di cocco", "sale e acqua" (frase non in lista).
- `matchIngredientToPantry`: exact su singolare/plurale/accenti; alias vince quando exact assente; exact vince su alias; doppioni → qty maggiore; nessun match → suggestions: "spaghetti"↔"Spaghetti fini" (entrambe le direzioni), "pomodori"↔"Passata di pomodoro"; NON suggerito: "sale"↔"Salsa di soia" (stem disgiunti: "sal" ≠ "sals", mai match per prefisso), "uva"↔"Uva passa" (unico token comune < 4 char), nomi disgiunti; cap a 3 e ordinamento per similarità.
- `parsePantryQty`/`comparePantryStock`: `'L'` maiuscola; "200 g" vs 1 kg → sufficient; "2 kg" vs 500 g → insufficiente; "2" vs 6 pz → sufficient (equivalenza count); "2 pomodori" vs 500 g → `dimension-mismatch`; "q.b." → `unparsable`; `"200 g + q.b."` → `unparsable`; qty 0 → `empty`; "1 mazzo" vs "2 vasetti" → `unit-mismatch`.

`ingredient-aggregator.test.ts` (estensioni):
- contributions con "acqua"/"ghiaccio" non producono item; "acqua di rose" sì; il filtro non tocca gli altri gruppi.
- `parseQuantity`/`formatQuantity` esportate: casi virgola italiana, etti, cl.

`pantry-batch.test.ts`:
- precompilazioni (massa→g/kg, volume→ml/L, count→pz, q.b.→1 pz con nota, concatenata con somma segmenti e con fallback);
- match esistente stessa dimensione → incremento convertito nell'unità della voce; dimensioni diverse → qty 0 + nota;
- accumulo di due righe sullo stesso item.

`pantry-deduction.test.ts`:
- scaling alle porzioni (4→6) e conversione all'unità della voce; clamp a `item.qty`;
- q.b. → `excluded/unparsable`; count vs massa → `excluded/dimension-mismatch`; banali saltati;
- fusione di più ingredienti sulla stessa voce; suggestion row per il fuzzy.

### 6.2 Collaudo guidato (Playwright + emulatori Firebase — vedi "Guided testing tooling" in CLAUDE.md)

Script usa-e-getta in `e2e/scratch/` (gitignorata, da cancellare a fine collaudo), `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; seed via script throwaway con spy-word nei nomi (es. "Spaghetti COLLAUDO"). Fasi, una per messaggio, esito atteso dichiarato prima:

1. **Banali**: piano con ricetta contenente "acqua" e "acqua di cottura della pasta" → la lista non li mostra; "Voglio preparare questo" sulla stessa ricetta → il gruppo ad-hoc non li contiene; articolo custom "acqua frizzante" → resta.
2. **Hai già in casa**: dispensa con "Farina 00" 2 kg; piano che richiede "farina 00 300 g" → item nella sezione collassata con "In dispensa: 2 kg"; tap "Mi serve comunque" → torna in lista; reload → persiste (assert su `meal_plans.shoppingPantryIncludedIds` in Firestore emulato).
3. **Badge non confrontabile**: dispensa "Uova 6 pz", ricetta "uova 200 g" → resta in lista con badge.
4. **Alias**: dispensa "Spaghetti fini", ricetta "spaghetti" → riga suggerimento; "Sì, è lo stesso" → assert `aliases` sul doc dispensa + ricategorizzazione immediata.
5. **Batch**: spunta 3 articoli → "Aggiungi alla dispensa (3)" → sheet con precompilazioni attese → conferma → assert creazioni/incremento su `pantry_items` (un solo incremento se una voce esisteva), toast, spunte intatte.
6. **Scalo cottura**: sessione al 100% su ricetta con match; "Termina cottura" → dialog con decremento scalato alle porzioni; conferma → assert qty decrementata (clamp a 0), **una sola** entry `cooking_history` con id = session id, sessione cancellata. Ripetere con "Salta" → nessun decremento. Abbandono da /cotture-in-corso → nessun decremento, nessuna history.
7. **Micro-fix**: settimana senza piano → "Aggiungi articolo" visibile e funzionante (localStorage); delete dispensa → ConfirmDialog; "Consumato" su voce in g → chip −25%/−50%/Tutto.

## 7. Gotcha e vincoli pertinenti (AGENTS.md / CLAUDE.md)

- **Mai `undefined` su Firestore** (AGENTS.md riga 23): `aliases` omesso o array; `pantryIncluded` boolean o chiave omessa (spread condizionale); `shoppingPantryIncludedIds` sempre array nel write; `expires`/`purchased` `null` non `''` sul documento.
- **Nuovo target di persistenza → proprio debounce + registrazione in `flushAll`** (AGENTS.md riga 42): questa spec **evita deliberatamente** nuovi target — `shoppingPantryIncludedIds` viaggia nel write del piano esistente, `pantryIncluded` nell'array ad-hoc esistente. La checklist §4.4.2 (latestStateRef, init, reset, persist effect, flush, localStorage) va eseguita integralmente: dimenticare un punto riproduce il bug delle spunte perse per il solo campo nuovo.
- **`enabled: !!user`** su ogni query auth-bound (AGENTS.md riga 48): `usePantry` lo fa già; non introdurre query nuove senza.
- **Niente `onSnapshot`** (CLAUDE.md): il matching è ricalcolo client-side su cache React Query, staleTime dispensa 2 min accettato.
- **`ConfirmDialog` per azioni distruttive, mai `confirm()`/`alert()`** (AGENTS.md riga 75): delete dispensa (micro-fix 2); lo scalo cottura usa un Dialog dedicato perché non è distruttivo-binario.
- **Structured outputs / schema JSON**: nessuna route AI in questa spec — vincolo non applicabile (nessun `minItems`/`minimum` da evitare perché non ci sono schema).
- **Token colore semantici** (AGENTS.md righe 53–62): badge e sezione con `text-accent`/`bg-accent/10`/`text-muted-foreground`/`bg-card`; mai `green-*`/`bg-white`; input/select nativi nelle sheet con `bg-background text-foreground` espliciti.
- **Controlli mai solo `group-hover` sotto `lg`** (AGENTS.md riga 74): "Mi serve comunque", "Ce l'ho già", chip Consumato e bottoni riga sempre visibili su mobile; area tap ≥ 44px.
- **`max-lg:portrait:`** invece di `portrait:` (AGENTS.md riga 19) per ogni classe orientamento nelle nuove UI; sheet bottom su mobile e centrata su `lg` (pattern `PantryAddSheet.tsx:111`).
- **Date `YYYY-MM-DD`**: parse con suffisso `'T00:00:00'` e formattazione con `formatLocalDate` (AGENTS.md righe 34, 47) — mai `toISOString().slice(0,10)` per `purchased`.
- **Collapsible con `grid-rows`**, non `max-height` (AGENTS.md riga 69) per la sezione "Hai già in casa".
- **Checkbox native**: `accent-primary` (AGENTS.md riga 80).
- **Lista spesa = vista derivata cachata** (AGENTS.md riga 60): le mutazioni dispensa non toccano `['shoppingList', ...]` (giusto così: la classificazione dipende da `pantryQueryKey`, che va invalidata); non aggiungere invalidazioni superflue.
- **Merge conservativo**: non allentare `canonicalIngredientKey`/`singularizeWord` (test esistenti + filosofia non-merge = fallimento sicuro).
- **`cooking_history` append-only, statistiche leggono solo da lì** (CLAUDE.md): il passaggio a `setDoc` con id deterministico non cambia la forma del documento; i doc legacy restano leggibili.
- **Cache stale dopo write** (AGENTS.md riga 59): invalidare `pantryQueryKey` dopo alias/batch/scalo e `['cookingSessions', uid]` a fine cottura (già presente).
- **Build**: `npx tsc --noEmit` + `npx next build --webpack`; `spawn EPERM` in sandbox → rilanciare fuori sandbox (AGENTS.md riga 73). `next lint` non esiste più (riga 81).

## 8. Fuori scope

- Tassonomia reparti e raggruppamento della lista per reparto (**Spec E**, che consuma questo modulo).
- Tabella densità/peso per convertire count ↔ massa ("2 pomodori" vs "500 g"): il mismatch resta non confrontabile per scelta.
- Persistenza dei suggerimenti rifiutati (solo sessione).
- "Aggiungi a lista" dalla dispensa (rimosso, non reimplementato — race coi write debounced).
- Lista spesa automatica da scorte sotto soglia (card "In arrivo" resta).
- Inserimento vocale (tab rimossa).
- Migrazioni batch di dati esistenti (gruppi ad-hoc con banali, checkedIds inerti).
- Scaling delle quantità ad-hoc alle porzioni (gli item ad-hoc restano copie verbatim non scalate).
- Qualsiasi endpoint AI o modifica ai prompt.

## 9. Prompt di implementazione

```markdown
Implementa la Spec D di "Il Mio Ricettario".

PREPARAZIONE (obbligatoria, nell'ordine):
1. Leggi e applica CLAUDE.md, AGENTS.md, COMMENTS.md e DEVELOPMENT_GUIDELINES.md (root del repo).
2. Leggi PER INTERO specs/00-roadmap.md: è il contratto vincolante — non deviare da nomi
   di moduli/tipi/campi lì definiti (in particolare "Contratti cross-spec §2").
3. Leggi PER INTERO specs/spec-d-dispensa-matching.md: contiene modello dati esatto,
   algoritmi, copy italiana, edge case e la checklist di persistenza §4.4.2.
4. Crea il branch feature/pantry-shopping-integration da develop.

IMPLEMENTAZIONE:
- Procedi fase per fase (sezione 5 della spec, Fasi 1→6). Dopo OGNI fase esegui
  `npx tsc --noEmit` e correggi prima di proseguire.
- Esegui i test con `npm test` (comando verificato in package.json) dopo le fasi che
  toccano o aggiungono file .test.ts; i nuovi test sono elencati in sezione 6.1.
- Rispetta i gotcha di sezione 7 (mai undefined su Firestore; checklist completa per
  shoppingPantryIncludedIds; enabled: !!user; niente onSnapshot; ConfirmDialog;
  token semantici; niente controlli hover-only sotto lg; max-lg:portrait:).
- A fine lavoro: `npx next build --webpack` (se fallisce con spawn EPERM, rilanciala
  fuori sandbox: non è un errore applicativo).

CHIUSURA:
- Aggiorna CLAUDE.md (sezione Recent Changes + eventuali campi/collezioni),
  AGENTS.md (nuovi gotcha se emersi durante il lavoro) e spunta la Spec D nella
  checklist di specs/00-roadmap.md.
- NON committare MAI senza OK esplicito dell'utente (regola di sessione:
  un branch/commit per sessione).
- Al termine proponi un collaudo guidato fase-per-fase con Playwright + emulatori
  Firebase (script usa-e-getta in e2e/scratch/, protocollo in CLAUDE.md sezione
  "Guided testing tooling" e sezione 6.2 della spec), dichiarando per ogni fase
  l'esito atteso prima di eseguirla.
```

## 10. Modello e effort consigliati

**Opus · effort xhigh** — motore nuovo con molte cuciture (lista spesa, dispensa, cottura), scelte conservative da rispettare e persistenza delicata (debounce/flush).
