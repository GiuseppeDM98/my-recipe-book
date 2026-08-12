# Spec E — Lista della spesa raggruppata per reparto del supermercato

> Note coperte: 6 (raggruppamento per reparto) | Dipendenze: Spec D (motore di matching — vedi §4.0 per il sottoinsieme minimo da anticipare se D non è ancora implementata) | Branch: `feature/shopping-departments`

---

## 1. Obiettivo

Oggi la lista della spesa è organizzata "per ricetta": le sezioni riflettono le sotto-sezioni interne delle ricette ("Per la pasta", "Per il ragù") più i gruppi ad-hoc "Voglio preparare questo". Al supermercato questo ordine è inutile: si gira per reparti, non per ricette. Con questa spec la lista guadagna una **vista "Per reparto"** (default): ogni articolo — derivato dal piano, custom o ad-hoc — viene classificato in un reparto della tassonomia dispensa estesa (13 reparti: i 10 esistenti + `surgelati`, `panetteria`, `altro`) e mostrato in sezioni collassabili in ordine fisso, con gli articoli in ordine alfabetico. Un toggle "Per reparto / Per ricetta" permette di tornare al layout attuale, che resta invariato. La classificazione segue una catena di precedenza (dispensa → override utente → dizionario statico → `altro`) e l'utente può correggere per sempre un reparto sbagliato con l'azione di riga "Sposta in reparto…". Gli id degli articoli non cambiano: le spunte esistenti restano valide.

## 2. Stato attuale

Riferimenti verificati sul codice al 2026-08-12 (branch `develop`, HEAD `c99e86e`).

### 2.1 Tassonomia dispensa

`src/lib/utils/pantry-utils.ts:7-18` — 10 categorie hardcoded (non documenti Firestore):

```ts
export const PANTRY_CATEGORIES: PantryCategory[] = [
  { id: 'latticini', name: 'Latticini', color: 'oklch(88% 0.04 80)' },
  { id: 'verdura', name: 'Verdura', color: 'oklch(82% 0.09 148)' },
  { id: 'frutta', name: 'Frutta', color: 'oklch(85% 0.10 60)' },
  { id: 'carne', name: 'Carne', color: 'oklch(75% 0.12 25)' },
  { id: 'pesce', name: 'Pesce', color: 'oklch(82% 0.07 230)' },
  { id: 'cereali', name: 'Cereali e farine', color: 'oklch(85% 0.06 85)' },
  { id: 'legumi', name: 'Legumi', color: 'oklch(78% 0.08 60)' },
  { id: 'condimenti', name: 'Condimenti', color: 'oklch(80% 0.10 95)' },
  { id: 'spezie', name: 'Spezie', color: 'oklch(72% 0.13 55)' },
  { id: 'bevande', name: 'Bevande', color: 'oklch(82% 0.07 250)' },
];
```

`PantryCategory` è `{ id: string; name: string; color: string }` (`src/types/pantry.ts:19-23`). `PantryItem.categoryId` è uno slug in questa costante (`src/types/pantry.ts:9`). La pagina dispensa (`src/app/(dashboard)/dispensa/page.tsx:231-255`) renderizza una `CategorySection` per ogni categoria presente e raccoglie gli slug sconosciuti in una sezione fallback "Altro" costruita con una IIFE:

```tsx
{/* Items with unknown category */}
{(() => {
  const knownIds = new Set(PANTRY_CATEGORIES.map(c => c.id));
  const unknownItems = filteredItems.filter(item => !knownIds.has(item.categoryId));
  if (unknownItems.length === 0) return null;
  return (
    <CategorySection
      categoryId="altro"
      categoryName="Altro"
      ...
```

Il raggruppamento a monte è `itemsByCategory` (`dispensa/page.tsx:110-117`), una `Map<string, PantryItem[]>` keyed su `item.categoryId` raw.

### 2.2 Chiave canonica ingredienti (privata)

`src/lib/utils/ingredient-aggregator.ts:164-174` — oggi **non esportata**:

```ts
function canonicalIngredientKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (à → a, é → e …)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(singularizeWord)
    .join(' ');
}
```

`singularizeWord` (`ingredient-aggregator.ts:184-206`) è lo stemmer conservativo italiano: gestisce velari (`-chi/-che → c`, `-ghi/-ghe → g`), `-io → i`, poi toglie una vocale finale su parole ≥ 4 caratteri. Nota bene: **la chiave canonica è uno stem**, non la forma singolare — `canonicalIngredientKey('pomodoro') === 'pomodor'`, `canonicalIngredientKey('caffè') === 'caff'`. Gli id degli articoli piano sono `toSlug(chiave canonica)` (`ingredient-aggregator.ts:127` e `148-154`).

### 2.3 Lista della spesa

- **Derivazione**: `useShoppingList(weekStartDate)` (`src/lib/hooks/useShoppingList.ts:84`) — query `['shoppingList', uid, weekStartDate]` → `getMealPlanByWeek` + `getRecipesByIds` → `buildContributions` → `aggregateIngredients`. Gli articoli aggregati sono effimeri; si persistono solo `shoppingCheckedIds` e `shoppingCustomItems` sul documento `meal_plans` (debounce 500ms + flush, `useShoppingList.ts:315-365`).
- **Ordinamento e sezioni attuali**: `useShoppingList.ts:370-381` ordina `[...planItems, ...customItems]` per `section → name` (sezione `null` in coda); `sectionNames` (`386-398`) usa la sentinella `'__null__'`. `ShoppingListContent.tsx:30-31` la traduce in `"Senza categoria"`. Questa logica **non viene toccata**: serve la vista "Per ricetta".
- **Rendering**: `ShoppingListContent.tsx:82-142` — progress bar, una `ShoppingSection` per sezione, poi un `AdHocRecipeGroup` per gruppo ad-hoc, poi il bottone "Aggiungi articolo" (gated su `hasPlan`, riga 125) che apre `AddCustomItemSheet`.
- **Footnote**: `ShoppingSection.tsx:18-26` — `DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']` e `footnoteFor(item)` che produce `"Ricetta (Lun), …"` oppure `"Aggiunto manualmente"` per i custom.
- **Riga**: `ShoppingItemRow.tsx:6-14` — props generiche:

```ts
interface ShoppingItemRowProps {
  name: string;
  quantity?: string;
  checked: boolean;
  footnote?: string;
  onToggle: () => void;
  onRemove?: () => void;
}
```

- **Ad-hoc**: gruppi su `users/{uid}.adHocShoppingRecipes` (`src/lib/firebase/shopping-adhoc.ts:17-28`), `checked` embedded per item (`AdHocShoppingItem`, `src/types/index.ts:496-501`), renderizzati da `AdHocRecipeGroup.tsx` con `ConfirmDialog` sulla rimozione di gruppo.
- **Custom item form**: `AddCustomItemSheet.tsx:79-91` ha il campo libero "Sezione (opzionale)" (`placeholder="es. Latticini"`) che alimenta `ShoppingItem.section`.
- **Tipi**: `ShoppingItem` (`src/types/index.ts:474-486`), `User` con `familyProfile` e `adHocShoppingRecipes` (`src/types/index.ts:26-41`), pattern "estensione del doc utente" già consolidato (`AGENTS.md` §2 "User Profile Extensions"; regola owner su `users/{uid}` in `firebase/firestore.rules:14-18`).
- **Pagina**: `src/app/(dashboard)/lista-spesa/page.tsx:18-129` — stato `weekStartDate`, header + "Azzera spunti", navigazione settimana, skeleton, `ShoppingListContent`.

### 2.4 Cosa NON esiste oggi

- Nessuna nozione di reparto sugli articoli di lista; `ShoppingItem.section` ha semantica di preparazione ("Per la pasta"), non di negozio.
- Nessun collegamento lista ↔ dispensa (zero import incrociati, verificato).
- Nessun modulo `ingredient-matching.ts` né `ingredient-departments.ts` (Spec D è specificata in `specs/spec-d-dispensa-matching.md` ma non ancora implementata alla data di scrittura: nessun file corrispondente in `src/`).

## 3. Decisioni di prodotto (vincoli dal roadmap)

Dal contratto cross-spec n. 3 di `specs/00-roadmap.md` (vincolante):

1. **Tassonomia unica**: si riusa `PANTRY_CATEGORIES` estesa con `surgelati`, `panetteria` e `altro` (fallback esplicito), mantenendo i 10 slug esistenti e i colori OKLCH terrosi.
2. **Catena di classificazione** di un articolo di lista, in ordine di precedenza:
   1. `categoryId` della voce dispensa matchata (via contratto 2, motore di matching di Spec D);
   2. override manuale dell'utente (`users/{uid}.ingredientDepartmentOverrides`, mappa `chiaveCanonica → categoryId`);
   3. dizionario statico curato `src/lib/utils/ingredient-departments.ts` (~200–400 ingredienti comuni italiani);
   4. fallback `altro`.
3. **Toggle di vista** "Per reparto" / "Per ricetta", default **reparto**; la vista per-ricetta conserva il layout attuale.
4. Dal contratto n. 2: la chiave canonica arriva da `canonicalIngredientKey` esportata dal nuovo modulo `src/lib/utils/ingredient-matching.ts`; il non-match resta il fallimento sicuro.
5. Regola di progetto invariata: le kcal restano fuori dalla lista della spesa (CLAUDE.md).

## 4. Design proposto

### 4.0 Prerequisito: sottoinsieme minimo di Spec D da anticipare

L'ordine consigliato è D → E, ma questa spec deve essere implementabile anche se D non è ancora sul branch. **Se `src/lib/utils/ingredient-matching.ts` esiste già** (Spec D fatta): usare i suoi export e saltare questo paragrafo. **Altrimenti** crearlo con questo sottoinsieme, firma-compatibile col contratto 2 del roadmap così D potrà solo estenderlo:

```ts
// src/lib/utils/ingredient-matching.ts  (sottoinsieme anticipato da Spec E)
import { PantryItem } from '@/types/pantry';

/** SPOSTATA qui da ingredient-aggregator.ts (era privata), insieme a singularizeWord. */
export function canonicalIngredientKey(name: string): string { /* corpo identico a §2.2 */ }

export type PantryMatch =
  | { item: PantryItem; confidence: 'exact' | 'alias' }
  | { item: null; suggestions: PantryItem[] };

/**
 * Tier 'exact': stessa chiave canonica del nome della voce dispensa.
 * Tier 'alias': la chiave è tra gli alias confermati dall'utente (campo
 * opzionale introdotto da Spec D; qui basta il check difensivo).
 * suggestions: sempre [] in questo sottoinsieme — il fuzzy è compito di Spec D.
 */
export function matchIngredientToPantry(name: string, pantryItems: PantryItem[]): PantryMatch {
  const key = canonicalIngredientKey(name);
  for (const item of pantryItems) {
    if (canonicalIngredientKey(item.name) === key) return { item, confidence: 'exact' };
  }
  for (const item of pantryItems) {
    if (item.aliases?.includes(key)) return { item, confidence: 'alias' };
  }
  return { item: null, suggestions: [] };
}
```

- In `src/types/pantry.ts` aggiungere a `PantryItem` il campo del contratto 2: `aliases?: string[];` (chiavi canoniche confermate — qui solo letto, mai scritto; opzionale ⇒ nessuna migrazione, e in scrittura non va mai persistito `undefined`).
- `ingredient-aggregator.ts` importa `canonicalIngredientKey` dal nuovo modulo e **elimina** la propria copia privata (insieme a `singularizeWord`, che si sposta). `toSlug` resta nell'aggregatore. Comportamento invariato: la suite `ingredient-aggregator.test.ts` deve passare senza modifiche.
- Quando Spec D arriverà, sostituirà/estenderà `matchIngredientToPantry` (alias persistenti, suggestions fuzzy, `isTrivialIngredient`, export di `parseQuantity`) senza toccare i call site di E.

### 4.1 Modello dati

#### (a) Tassonomia estesa — `pantry-utils.ts`

`PANTRY_CATEGORIES` diventa (i 10 esistenti invariati, 3 nuove voci **in coda**, `altro` ultimo — l'ordine dell'array è anche l'ordine di rendering dei reparti in lista e delle sezioni in dispensa):

```ts
export const PANTRY_CATEGORIES: PantryCategory[] = [
  // ... i 10 esistenti, invariati ...
  { id: 'surgelati', name: 'Surgelati', color: 'oklch(86% 0.05 220)' },
  { id: 'panetteria', name: 'Panetteria', color: 'oklch(83% 0.08 75)' },
  { id: 'altro', name: 'Altro', color: 'oklch(85% 0.02 85)' },
];
```

Motivazione colori (coerenti con la palette terrosa esistente, L 72–88%, C 0.02–0.13):
- `surgelati` `oklch(86% 0.05 220)` — "ghiaccio caldo", hue tra pesce (230) e bevande (250), chroma basso come latticini;
- `panetteria` `oklch(83% 0.08 75)` — crosta di pane, tra frutta (60) e latticini (80), distinto da condimenti (95) per hue e chroma;
- `altro` `oklch(85% 0.02 85)` — neutro caldo quasi-grigio, dichiaratamente "non colore" da fallback.

Effetti collaterali da gestire in dispensa (stessa fase):
- `PantryAddSheet` mostra automaticamente le 3 nuove opzioni nel select categoria (itera `PANTRY_CATEGORIES`) — nessuna modifica necessaria.
- `dispensa/page.tsx`: ora che `altro` è una categoria reale, la IIFE fallback di §2.1 produrrebbe **due** sezioni "Altro" (una per gli item con `categoryId === 'altro'`, una per gli slug sconosciuti). Fix: nel memo `itemsByCategory` (righe 110-117) rimappare gli slug sconosciuti su `'altro'` prima del raggruppamento ed **eliminare la IIFE** (righe 241-255):

```ts
const itemsByCategory = useMemo(() => {
  const knownIds = new Set(PANTRY_CATEGORIES.map(c => c.id));
  const map = new Map<string, PantryItem[]>();
  for (const item of filteredItems) {
    const catId = knownIds.has(item.categoryId) ? item.categoryId : 'altro';
    if (!map.has(catId)) map.set(catId, []);
    map.get(catId)!.push(item);
  }
  return map;
}, [filteredItems]);
```

#### (b) Tipo `User` — override reparti

`src/types/index.ts`, dentro `interface User` (dopo `adHocShoppingRecipes`, riga 38):

```ts
/**
 * Override manuali "ingrediente → reparto" per la vista per-reparto della
 * lista della spesa. Chiave = canonicalIngredientKey(nome) (stem), valore =
 * slug in PANTRY_CATEGORIES. Vale per sempre per quella chiave canonica.
 * Precedenza: perde solo contro il categoryId della voce dispensa matchata.
 * Stesso pattern di familyProfile/adHocShoppingRecipes: campo su users/{uid},
 * nessuna nuova collection/regola/indice.
 */
ingredientDepartmentOverrides?: Record<string, string> | null;
```

#### (c) `ShoppingItem`, `AdHocShoppingItem`, `MealPlan`: **invariati**

Nessun campo nuovo persistito sugli articoli: la classificazione è derivata a render time, quindi gli id (`toSlug(chiave canonica)` / UUID) e `shoppingCheckedIds` non cambiano. Nessuna migrazione.

### 4.2 Dizionario statico — `src/lib/utils/ingredient-departments.ts`

Nuovo modulo. Struttura:

```ts
import { canonicalIngredientKey, matchIngredientToPantry } from './ingredient-matching';
import { PANTRY_CATEGORIES } from './pantry-utils';
import { PantryItem } from '@/types/pantry';

export const DEPARTMENT_FALLBACK_ID = 'altro';

/**
 * Dizionario seed "nome ingrediente → reparto".
 *
 * CONVENZIONE DELLE CHIAVI (verificata dai test, vedi §6):
 * - minuscole, senza accenti (es. "caffe", "baccala"), spazi singoli;
 * - forma SINGOLARE quando singolare e plurale condividono lo stem (caso
 *   normale: "pomodoro" copre "pomodori"); per le coppie -cia/-ce e -io/-a
 *   irregolari che NON condividono lo stem si aggiungono entrambe le forme
 *   (es. "arancia" e "arance", "salsiccia" e "salsicce");
 * - le voci multi-parola sono ammesse e consigliate per i casi specifici:
 *   lo stemming è per-parola, quindi "pomodoro pelato" matcha "pomodori
 *   pelati" ma NON viene matchato da "pomodoro" (coerente con la filosofia
 *   conservativa dell'aggregatore).
 *
 * A runtime il modulo normalizza ogni chiave con canonicalIngredientKey e
 * costruisce una Map stem → slug (vedi DEPARTMENT_BY_KEY sotto): la lookup
 * avviene sempre su stem, mai sulla forma scritta qui.
 */
export const RAW_INGREDIENT_DEPARTMENTS: Record<string, string> = {
  // ... vedi seed completo sotto ...
};

/** Mappa di lookup: stem canonico → slug reparto. Costruita una volta al load. */
export const DEPARTMENT_BY_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [rawKey, dept] of Object.entries(RAW_INGREDIENT_DEPARTMENTS)) {
    const key = canonicalIngredientKey(rawKey);
    if (!map.has(key)) map.set(key, dept); // prima dichiarazione vince; i test vietano conflitti
  }
  return map;
})();

const KNOWN_DEPARTMENT_IDS = new Set(PANTRY_CATEGORIES.map(c => c.id));

export type DepartmentSource = 'pantry' | 'override' | 'dictionary' | 'fallback';

export interface DepartmentClassification {
  departmentId: string;      // slug in PANTRY_CATEGORIES (sempre valido)
  source: DepartmentSource;  // da quale anello della catena arriva
  canonicalKey: string;      // chiave canonica del nome (per l'override)
}

/**
 * Catena di precedenza (contratto 3 del roadmap):
 * 1. categoryId della voce dispensa matchata (solo se slug noto — uno slug
 *    sconosciuto sul doc dispensa NON classifica e la catena prosegue);
 * 2. override utente (ignorato se punta a uno slug non più noto);
 * 3. dizionario statico;
 * 4. fallback 'altro'.
 */
export function classifyIngredientDepartment(
  name: string,
  pantryItems: PantryItem[],
  overrides: Record<string, string>
): DepartmentClassification {
  const canonicalKey = canonicalIngredientKey(name);

  const match = matchIngredientToPantry(name, pantryItems);
  if (match.item && KNOWN_DEPARTMENT_IDS.has(match.item.categoryId)) {
    return { departmentId: match.item.categoryId, source: 'pantry', canonicalKey };
  }

  const override = overrides[canonicalKey];
  if (override && KNOWN_DEPARTMENT_IDS.has(override)) {
    return { departmentId: override, source: 'override', canonicalKey };
  }

  const fromDictionary = DEPARTMENT_BY_KEY.get(canonicalKey);
  if (fromDictionary) {
    return { departmentId: fromDictionary, source: 'dictionary', canonicalKey };
  }

  return { departmentId: DEPARTMENT_FALLBACK_ID, source: 'fallback', canonicalKey };
}
```

#### Seed completo del dizionario (~290 voci)

Da riportare integralmente in `RAW_INGREDIENT_DEPARTMENTS`, organizzato e ordinato così (chiavi multi-parola tra apici):

```ts
// ── Verdura ──────────────────────────────────────────────
pomodoro: 'verdura', pomodorino: 'verdura', 'pomodoro ciliegino': 'verdura',
'pomodoro datterino': 'verdura', zucchina: 'verdura', melanzana: 'verdura',
peperone: 'verdura', friggitello: 'verdura', carota: 'verdura',
sedano: 'verdura', 'sedano rapa': 'verdura', cipolla: 'verdura',
'cipolla rossa': 'verdura', cipollotto: 'verdura', scalogno: 'verdura',
aglio: 'verdura', patata: 'verdura', 'patata dolce': 'verdura',
zucca: 'verdura', spinacio: 'verdura', bietola: 'verdura',
cavolo: 'verdura', 'cavolo nero': 'verdura', cavolfiore: 'verdura',
broccolo: 'verdura', verza: 'verdura', 'cavoletto di bruxelles': 'verdura',
lattuga: 'verdura', insalata: 'verdura', rucola: 'verdura',
radicchio: 'verdura', indivia: 'verdura', scarola: 'verdura',
finocchio: 'verdura', carciofo: 'verdura', asparago: 'verdura',
porro: 'verdura', fagiolino: 'verdura', cetriolo: 'verdura',
ravanello: 'verdura', rapa: 'verdura', 'cima di rapa': 'verdura',
barbabietola: 'verdura', fungo: 'verdura', 'fungo porcino': 'verdura',
porcino: 'verdura', champignon: 'verdura',

// ── Frutta (incl. frutta secca) ──────────────────────────
mela: 'frutta', pera: 'frutta', banana: 'frutta',
arancia: 'frutta', arance: 'frutta', // -cia/-ce: stem diversi, servono entrambe
limone: 'frutta', lime: 'frutta', mandarino: 'frutta', clementina: 'frutta',
pompelmo: 'frutta', kiwi: 'frutta', uva: 'frutta', uvetta: 'frutta',
'uva passa': 'frutta', 'uva sultanina': 'frutta', 'pesca noce': 'frutta',
nettarina: 'frutta', albicocca: 'frutta', prugna: 'frutta', susina: 'frutta',
ciliegia: 'frutta', fragola: 'frutta', lampone: 'frutta', mirtillo: 'frutta',
mora: 'frutta', ribes: 'frutta', 'frutto di bosco': 'frutta',
melone: 'frutta', anguria: 'frutta', cocomero: 'frutta', fico: 'frutta',
cachi: 'frutta', melograno: 'frutta', ananas: 'frutta', mango: 'frutta',
avocado: 'frutta', castagna: 'frutta', noce: 'frutta', mandorla: 'frutta',
nocciola: 'frutta', pistacchio: 'frutta', pinolo: 'frutta',
arachide: 'frutta', anacardo: 'frutta', dattero: 'frutta', cocco: 'frutta',

// ── Carne e salumi ───────────────────────────────────────
pollo: 'carne', 'petto di pollo': 'carne', 'coscia di pollo': 'carne',
tacchino: 'carne', 'fesa di tacchino': 'carne', manzo: 'carne',
macinato: 'carne', 'carne macinata': 'carne', hamburger: 'carne',
vitello: 'carne', maiale: 'carne', lonza: 'carne', arista: 'carne',
costina: 'carne',
salsiccia: 'carne', salsicce: 'carne', // -cia/-ce
wurstel: 'carne', agnello: 'carne', coniglio: 'carne', anatra: 'carne',
prosciutto: 'carne', 'prosciutto cotto': 'carne', 'prosciutto crudo': 'carne',
speck: 'carne', pancetta: 'carne', guanciale: 'carne', salame: 'carne',
mortadella: 'carne', bresaola: 'carne', coppa: 'carne', lardo: 'carne',

// ── Pesce ────────────────────────────────────────────────
pesce: 'pesce', // NOTA: stem "pesc" copre anche "pesca" (frutto) — collisione documentata, vedi §4.5
'pesce spada': 'pesce', tonno: 'pesce', salmone: 'pesce',
'salmone affumicato': 'pesce', merluzzo: 'pesce', baccala: 'pesce',
branzino: 'pesce', spigola: 'pesce', orata: 'pesce', sogliola: 'pesce',
platessa: 'pesce', sgombro: 'pesce', alice: 'pesce', acciuga: 'pesce',
sardina: 'pesce', gambero: 'pesce', gamberetto: 'pesce',
mazzancolla: 'pesce', scampo: 'pesce', calamaro: 'pesce', seppia: 'pesce',
polpo: 'pesce', cozza: 'pesce', vongola: 'pesce', trota: 'pesce',

// ── Latticini e uova ─────────────────────────────────────
latte: 'latticini', panna: 'latticini', 'panna da cucina': 'latticini',
'panna fresca': 'latticini', 'panna acida': 'latticini', burro: 'latticini',
yogurt: 'latticini', 'yogurt greco': 'latticini', kefir: 'latticini',
uovo: 'latticini', albume: 'latticini', tuorlo: 'latticini',
mozzarella: 'latticini', 'mozzarella di bufala': 'latticini',
fiordilatte: 'latticini', burrata: 'latticini', stracciatella: 'latticini',
ricotta: 'latticini', mascarpone: 'latticini', parmigiano: 'latticini',
'parmigiano reggiano': 'latticini',
grana: 'latticini', // NOTA: stem "gran" copre anche "grano" — collisione documentata, vedi §4.5
'grana padano': 'latticini', pecorino: 'latticini',
'pecorino romano': 'latticini', gorgonzola: 'latticini',
taleggio: 'latticini', fontina: 'latticini', asiago: 'latticini',
scamorza: 'latticini', provola: 'latticini', provolone: 'latticini',
stracchino: 'latticini', crescenza: 'latticini', robiola: 'latticini',
caciotta: 'latticini', caprino: 'latticini', feta: 'latticini',
emmental: 'latticini', brie: 'latticini', formaggio: 'latticini',
'formaggio spalmabile': 'latticini',

// ── Cereali, pasta, riso, farine ─────────────────────────
farina: 'cereali', 'farina 00': 'cereali', 'farina integrale': 'cereali',
'farina di mandorle': 'cereali', 'farina di ceci': 'cereali',
'farina di riso': 'cereali', semola: 'cereali', semolino: 'cereali',
'amido di mais': 'cereali', maizena: 'cereali', fecola: 'cereali',
'fecola di patate': 'cereali', pasta: 'cereali', spaghetto: 'cereali',
penna: 'cereali', fusillo: 'cereali', rigatone: 'cereali',
linguina: 'cereali', tagliatella: 'cereali', fettuccina: 'cereali',
pappardella: 'cereali', farfalla: 'cereali', orecchietta: 'cereali',
lasagna: 'cereali', cannellone: 'cereali', tortellino: 'cereali',
raviolo: 'cereali', gnocco: 'cereali', riso: 'cereali',
'riso arborio': 'cereali', 'riso carnaroli': 'cereali',
'riso basmati': 'cereali', orzo: 'cereali', farro: 'cereali',
avena: 'cereali', 'fiocco di avena': 'cereali', "fiocco d'avena": 'cereali',
muesli: 'cereali', couscous: 'cereali', cuscus: 'cereali',
quinoa: 'cereali', bulgur: 'cereali', miglio: 'cereali',
polenta: 'cereali', 'grano saraceno': 'cereali', mais: 'cereali',

// ── Legumi ───────────────────────────────────────────────
fagiolo: 'legumi', 'fagiolo cannellino': 'legumi', cannellino: 'legumi',
'fagiolo borlotto': 'legumi', borlotto: 'legumi', cece: 'legumi',
lenticchia: 'legumi', fava: 'legumi', lupino: 'legumi', soia: 'legumi',

// ── Condimenti, olio, aceto, salse, scatolame, dolci da dispensa ──
olio: 'condimenti', 'olio di oliva': 'condimenti',
'olio extravergine': 'condimenti', 'olio extravergine di oliva': 'condimenti',
'olio evo': 'condimenti', 'olio di semi': 'condimenti',
'olio di girasole': 'condimenti', aceto: 'condimenti',
'aceto balsamico': 'condimenti', 'aceto di vino': 'condimenti',
'aceto di mele': 'condimenti', sale: 'condimenti', 'sale fino': 'condimenti',
'sale grosso': 'condimenti', zucchero: 'condimenti',
'zucchero a velo': 'condimenti', 'zucchero di canna': 'condimenti',
miele: 'condimenti', marmellata: 'condimenti', confettura: 'condimenti',
'crema di nocciole': 'condimenti', 'burro di arachidi': 'condimenti',
maionese: 'condimenti', ketchup: 'condimenti', senape: 'condimenti',
'salsa di soia': 'condimenti', pesto: 'condimenti',
'passata di pomodoro': 'condimenti', 'polpa di pomodoro': 'condimenti',
'pomodoro pelato': 'condimenti', 'concentrato di pomodoro': 'condimenti',
cappero: 'condimenti', oliva: 'condimenti', 'oliva nera': 'condimenti',
'oliva verde': 'condimenti', sottaceto: 'condimenti',
cetriolino: 'condimenti', dado: 'condimenti', brodo: 'condimenti',
'brodo vegetale': 'condimenti', 'brodo di carne': 'condimenti',
'brodo di pollo': 'condimenti', cioccolato: 'condimenti',
'cioccolato fondente': 'condimenti', 'cioccolato al latte': 'condimenti',
'gocce di cioccolato': 'condimenti', // plurale d'uso: lo stem di "goccia" non copre "gocce"
cacao: 'condimenti', 'cacao amaro': 'condimenti',

// ── Spezie ed erbe aromatiche ────────────────────────────
basilico: 'spezie', prezzemolo: 'spezie', rosmarino: 'spezie',
salvia: 'spezie', timo: 'spezie', origano: 'spezie', maggiorana: 'spezie',
alloro: 'spezie', menta: 'spezie', 'erba cipollina': 'spezie',
aneto: 'spezie', dragoncello: 'spezie', coriandolo: 'spezie',
pepe: 'spezie', 'pepe nero': 'spezie', peperoncino: 'spezie',
paprika: 'spezie', paprica: 'spezie', curcuma: 'spezie', curry: 'spezie',
zenzero: 'spezie', cannella: 'spezie', 'noce moscata': 'spezie',
'chiodo di garofano': 'spezie', zafferano: 'spezie', cumino: 'spezie',
anice: 'spezie', sesamo: 'spezie', 'seme di sesamo': 'spezie',
vaniglia: 'spezie', vanillina: 'spezie', 'estratto di vaniglia': 'spezie',

// ── Bevande ──────────────────────────────────────────────
acqua: 'bevande', // il filtro "ingredienti banali" di Spec D la rimuove a monte quando attivo
'acqua frizzante': 'bevande', 'acqua naturale': 'bevande',
vino: 'bevande', 'vino bianco': 'bevande', 'vino rosso': 'bevande',
birra: 'bevande', caffe: 'bevande', te: 'bevande', 'te verde': 'bevande',
tisana: 'bevande', camomilla: 'bevande', succo: 'bevande',
'succo di frutta': 'bevande', 'latte di soia': 'bevande',
'latte di avena': 'bevande', 'latte di mandorla': 'bevande',
'latte di cocco': 'bevande', spumante: 'bevande', prosecco: 'bevande',
marsala: 'bevande', rum: 'bevande', brandy: 'bevande', grappa: 'bevande',
limoncello: 'bevande', aranciata: 'bevande',

// ── Surgelati tipici ─────────────────────────────────────
gelato: 'surgelati', ghiacciolo: 'surgelati',
pisello: 'surgelati', // scelta curata: in Italia i piselli si comprano quasi sempre surgelati
'bastoncino di pesce': 'surgelati', 'spinacio surgelato': 'surgelati',
'verdura surgelata': 'surgelati', 'patatina fritta': 'surgelati',

// ── Panetteria e lievitati ───────────────────────────────
pane: 'panetteria', 'pane in cassetta': 'panetteria', pancarre: 'panetteria',
panino: 'panetteria', focaccia: 'panetteria', piadina: 'panetteria',
grissino: 'panetteria', cracker: 'panetteria',
'fetta biscottata': 'panetteria', pangrattato: 'panetteria',
'pane grattugiato': 'panetteria', pizza: 'panetteria',
'impasto per pizza': 'panetteria', 'pasta sfoglia': 'panetteria',
'pasta brisee': 'panetteria', 'pasta frolla': 'panetteria',
lievito: 'panetteria', 'lievito di birra': 'panetteria',
'lievito madre': 'panetteria', 'lievito per dolci': 'panetteria',
brioche: 'panetteria', cornetto: 'panetteria', croissant: 'panetteria',
biscotto: 'panetteria', tarallo: 'panetteria', tortilla: 'panetteria',
pita: 'panetteria',
```

Note editoriali vincolanti sul seed:
- **Collisioni di stem risolte esplicitamente** (lo stemmer è quello che è, non si tocca):
  - `pesca`/`pesce` → entrambi stem `pesc`: assegnato a **`pesce`** (in un ricettario salato il pesce è molto più frequente; le pesche si recuperano con "pesca noce"/"nettarina" o con un override utente). **Non aggiungere una voce `pesca`**: i test collisione fallirebbero.
  - `grana`/`grano` → stem `gran`: assegnato a **`latticini`** ("grana" grattugiato è onnipresente; il grano vive in "grano saraceno" multi-parola). **Non aggiungere `grano`**.
  - `polpa`/`polpo` → stem `polp`: solo `polpo` (pesce); "polpa di pomodoro" è multi-parola e non collide.
- Zucchero/cacao/cioccolato → `condimenti` (dispensa secca; non esiste un reparto "dolci"): scelta curata, overridabile.
- Tutti i `lievito*` → `panetteria` per coerenza (anche "lievito per dolci", che al supermercato sta con le farine: chi preferisce lo sposta con l'override).
- `acqua` è nel dizionario per completezza pre-Spec D; quando D introdurrà `isTrivialIngredient`, gli ingredienti banali spariscono a monte e la voce diventa inerte.

### 4.3 Persistenza override — `users/{uid}.ingredientDepartmentOverrides`

Nuovo file `src/lib/firebase/department-overrides.ts`:

```ts
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { getUserProfile } from './user-profile';

export async function getDepartmentOverrides(userId: string): Promise<Record<string, string>> {
  const profile = await getUserProfile(userId);
  return profile?.ingredientDepartmentOverrides ?? {};
}

/**
 * Scrive/aggiorna un singolo override con read-modify-write dell'INTERA mappa.
 *
 * PERCHÉ non un update dot-path per chiave: le chiavi canoniche contengono
 * spazi ("pomodor pelat") e i field path Firestore con caratteri speciali
 * richiedono escaping fragile via FieldPath; la mappa è piccola e le
 * scritture rare, quindi riscriverla intera è più semplice e robusto
 * (stesso trade-off di updateAdHocShoppingList, shopping-adhoc.ts:22-28).
 *
 * PERCHÉ scrittura diretta, niente debounce: a differenza delle spunte
 * (raffiche di tap coalescate a 500ms), lo spostamento di reparto è
 * un'azione rara e deliberata, una per volta, da uno sheet. Un debounce
 * creerebbe un TERZO target di persistenza da registrare in flushAll()
 * (gotcha "Nuovo target di persistenza dimenticato nel flush", AGENTS.md)
 * senza alcun beneficio di coalescenza.
 */
export async function setDepartmentOverride(
  userId: string,
  canonicalKey: string,
  departmentId: string
): Promise<void> {
  const current = await getDepartmentOverrides(userId);
  const next = { ...current, [canonicalKey]: departmentId };
  await updateDoc(doc(db, 'users', userId), { ingredientDepartmentOverrides: next });
}
```

Nuovo hook `src/lib/hooks/useDepartmentOverrides.ts`:

```ts
'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/hooks/useAuth';
import { getDepartmentOverrides, setDepartmentOverride } from '@/lib/firebase/department-overrides';
import { getPantryCategory } from '@/lib/utils/pantry-utils';

export const departmentOverridesQueryKey = (uid: string) => ['departmentOverrides', uid] as const;

export function useDepartmentOverrides() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: overrides = {} } = useQuery({
    queryKey: departmentOverridesQueryKey(user?.uid ?? ''),
    queryFn: () => getDepartmentOverrides(user!.uid),
    enabled: !!user,
  });

  const setOverride = useMutation({
    mutationFn: ({ canonicalKey, departmentId }: { canonicalKey: string; departmentId: string }) =>
      setDepartmentOverride(user!.uid, canonicalKey, departmentId),
    onSuccess: (_, { departmentId }) => {
      queryClient.invalidateQueries({ queryKey: departmentOverridesQueryKey(user!.uid) });
      toast.success(`Spostato in ${getPantryCategory(departmentId)?.name ?? 'Altro'}`);
    },
    onError: () => toast.error('Impossibile salvare il reparto. Riprova.'),
  });

  return { overrides, setOverride };
}
```

Nessuna nuova regola/indice Firestore: la regola owner su `users/{uid}` (`firestore.rules:14-18`) copre già il campo. Non serve invalidare `['shoppingList']`: la classificazione è un `useMemo` a valle che dipende dalla query degli override, quindi l'invalidazione di `['departmentOverrides']` basta a ricalcolare la vista.

### 4.4 View model — `src/lib/utils/shopping-departments.ts`

Nuovo modulo puro (testabile con Jest) che costruisce le sezioni della vista reparto a partire dagli stessi dati della vista ricetta:

```ts
import { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { PantryItem } from '@/types/pantry';
import { PANTRY_CATEGORIES } from './pantry-utils';
import { classifyIngredientDepartment, DepartmentSource } from './ingredient-departments';

/** Etichette giorno condivise (oggi duplicate in ShoppingSection.tsx:18 — importarle da qui). */
export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export interface DepartmentRow {
  /** Chiave di rendering univoca: plan/custom = item.id; ad-hoc = `${groupId}:${itemId}`. */
  rowKey: string;
  kind: 'plan' | 'custom' | 'adhoc';
  /** Id dell'articolo nel suo dominio (ShoppingItem.id o AdHocShoppingItem.id) — INVARIATO. */
  id: string;
  /** Solo kind 'adhoc'. */
  groupId?: string;
  name: string;
  quantity: string;
  checked: boolean;
  footnote?: string;
  canonicalKey: string;
  source: DepartmentSource;
}

export interface DepartmentSectionModel {
  id: string;     // slug reparto
  name: string;   // etichetta ("Surgelati")
  color: string;  // OKLCH per lo swatch
  rows: DepartmentRow[];
}

/**
 * Costruisce le sezioni per-reparto nell'ordine di PANTRY_CATEGORIES,
 * OMETTENDO i reparti vuoti. Righe in ordine alfabetico (localeCompare 'it').
 *
 * - items: articoli piano + custom, GLI STESSI della vista per-ricetta
 *   (qualunque filtro a monte — banali, "Hai già in casa" di Spec D — è
 *   già applicato: le due viste consumano lo stesso array).
 * - checked: piano/custom da checkedIds; ad-hoc da item.checked (embedded).
 * - footnote: piano = "Ricetta (Lun), …" (stesso formato di footnoteFor,
 *   ShoppingSection.tsx:20-26); custom = "Aggiunto manualmente";
 *   ad-hoc = titolo della ricetta del gruppo.
 * - NESSUN merge cross-blocco: lo stesso ingrediente presente nel piano e
 *   in un gruppo ad-hoc produce due righe nello stesso reparto (scelta
 *   esplicita ereditata, AGENTS.md §9).
 */
export function buildDepartmentSections(
  items: ShoppingItem[],
  checkedIds: Set<string>,
  adHocRecipes: AdHocShoppingRecipe[],
  pantryItems: PantryItem[],
  overrides: Record<string, string>
): DepartmentSectionModel[] {
  const rowsByDept = new Map<string, DepartmentRow[]>();

  const push = (row: DepartmentRow, departmentId: string) => {
    if (!rowsByDept.has(departmentId)) rowsByDept.set(departmentId, []);
    rowsByDept.get(departmentId)!.push(row);
  };

  for (const item of items) {
    const c = classifyIngredientDepartment(item.name, pantryItems, overrides);
    push({
      rowKey: item.id,
      kind: item.isCustom ? 'custom' : 'plan',
      id: item.id,
      name: item.name,
      quantity: item.displayQuantity,
      checked: checkedIds.has(item.id),
      footnote: item.isCustom
        ? 'Aggiunto manualmente'
        : item.recipeSource
            .map(s => `${s.recipeTitle} (${DAY_LABELS[s.dayIndex] ?? s.dayIndex})`)
            .join(', ') || undefined,
      canonicalKey: c.canonicalKey,
      source: c.source,
    }, c.departmentId);
  }

  for (const group of adHocRecipes) {
    for (const item of group.items) {
      const c = classifyIngredientDepartment(item.name, pantryItems, overrides);
      push({
        rowKey: `${group.id}:${item.id}`,
        kind: 'adhoc',
        id: item.id,
        groupId: group.id,
        name: item.name,
        quantity: item.quantity,
        checked: item.checked,
        footnote: group.recipeTitle,
        canonicalKey: c.canonicalKey,
        source: c.source,
      }, c.departmentId);
    }
  }

  return PANTRY_CATEGORIES
    .filter(cat => rowsByDept.has(cat.id))
    .map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      rows: rowsByDept.get(cat.id)!.sort((a, b) => a.name.localeCompare(b.name, 'it')),
    }));
}
```

Aggiornare `ShoppingSection.tsx` per importare `DAY_LABELS` da qui (rimuovendo la copia locale di riga 18) — zero divergenza futura.

### 4.5 UI/UX

#### Toggle di vista (nuovo componente `src/components/shopping-list/ShoppingViewToggle.tsx`)

- Segmented control a due voci: **"Per reparto"** / **"Per ricetta"**. Contenitore `inline-flex rounded-lg bg-muted p-1`, bottone attivo `bg-background text-foreground shadow-sm`, inattivo `text-muted-foreground`; `rounded-md px-3 py-1.5 text-sm font-medium transition-colors` su entrambi. Solo token semantici (adattamento dark gratuito). `role="tablist"` non necessario: due `<button type="button" aria-pressed={…}>` bastano.
- **Default: `'reparto'`**. Preferenza **persistita in localStorage** con chiave `shopping_list_view:${uid}`, valori `'reparto' | 'ricetta'` (valore sconosciuto/assente → `'reparto'`). Motivazione localStorage e non Firestore: è una preferenza di pura presentazione, per-dispositivo va bene (su telefono al supermercato si vuole "reparto", su desktop in pianificazione magari "ricetta"); evita una scrittura Firestore per toggle e soprattutto evita un terzo target di persistenza con debounce/flush (vedi gotcha in §7). Pattern anti-hydration-mismatch: `useState<'reparto' | 'ricetta'>('reparto')` + `useEffect` che legge localStorage dopo il mount (come il pattern `mounted` di ThemePicker, AGENTS.md); ogni cambio scrive subito localStorage.
- Posizione: dentro `ShoppingListContent`, sopra la `ShoppingProgressBar` (così gli empty state esistenti, che fanno early-return, lo nascondono da soli). Lo stato `viewMode` vive in `lista-spesa/page.tsx` e scende via prop.

#### Vista "Per reparto" (nuovo componente `src/components/shopping-list/DepartmentSection.tsx`)

- Una sezione collassabile per reparto **nell'ordine di `PANTRY_CATEGORIES`**, reparti vuoti **non renderizzati** (già garantito da `buildDepartmentSections`).
- Header identico per struttura a `ShoppingSection` (chevron, titolo, contatore `checked/total`, stato all-checked `text-accent bg-accent/8 border-accent/30`), con in più uno **swatch**: `<span aria-hidden className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />` prima del titolo. I colori OKLCH (L 72–88%) sono leggibili su entrambi i temi come puntini pieni; il resto dell'header usa token semantici. **Niente side-stripe** (ban AGENTS.md): solo il dot.
- Animazione collasso con `grid-rows-[0fr] → grid-rows-[1fr]` + wrapper `overflow-hidden` (stesso pattern di `ShoppingSection.tsx:73-93`, mai `max-height`). Nessun auto-close: stato `expanded` locale, default aperto.
- Righe: `ShoppingItemRow` con `name`/`quantity`/`checked`/`footnote` dal `DepartmentRow`. Dispatch dei callback per `kind`:
  - `plan`/`custom` → `onToggle(row.id)` (stesso `toggleItem` di oggi; id invariati ⇒ `shoppingCheckedIds` intatto);
  - `adhoc` → `onToggleAdHocItem(row.groupId!, row.id)`.
  - `onRemove`: solo `custom` (→ `removeCustomItem`) e `adhoc` (→ `removeAdHocItem`), come oggi. La **rimozione dell'intero gruppo ad-hoc** resta disponibile solo nella vista per-ricetta (dove il gruppo è visibile come unità); documentato in §4.6.
- Progress bar e "Azzera spunti": **fuori dal toggle**, comportamento identico in entrambe le viste. Fattibilità verificata: `progress` è calcolato nel hook su `checkedIdsList + items + adHocRecipesList` (`useShoppingList.ts:402-412`) senza alcuna dipendenza dal raggruppamento, e la vista reparto consuma gli stessi array senza filtrarli. Lo stesso vale per la futura sezione "Hai già in casa" di Spec D: la classificazione vive nel hook (`pantryInfoById`, Spec D §4.4.1) e la partizione si applica in `ShoppingListContent` **a monte di qualunque raggruppamento di vista** (Spec D §4.4.3) — gli item "già in casa" escono dagli array prima che una vista li raggruppi, quindi entrambe le viste la ereditano identica senza logica dedicata. Contratto da rispettare qui: `buildDepartmentSections` riceve `items` già partizionati/filtrati e non deve mai rifiltrare.

#### Vista "Per ricetta"

Layout attuale **invariato al pixel**: sezioni `ShoppingSection` per `section` + gruppi `AdHocRecipeGroup` + sentinella `'__null__'` → "Senza categoria". Nessuna azione "Sposta in reparto" qui (il reparto non è visibile, l'azione sarebbe fuori contesto).

#### Override manuale — "Sposta in reparto…"

- `ShoppingItemRow` guadagna una prop opzionale `onMove?: () => void`. Se presente, renderizza un icon button (lucide `FolderInput`, `w-4 h-4`) accanto al cestino: `aria-label={"Sposta " + name + " in un altro reparto"}`, classi `flex-shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors`. **Sempre visibile** (mai solo `group-hover`: contesto touch, AGENTS.md).
- `onMove` è passato **solo** nella vista reparto e **solo** per righe con `source !== 'pantry'`: se il reparto viene dal `categoryId` della voce dispensa matchata (anello 1 della catena), un override non avrebbe alcun effetto per precedenza — mostrare l'azione sarebbe una promessa falsa. (Per cambiare reparto a quegli articoli si modifica la categoria della voce in dispensa.)
- Nuovo componente `src/components/shopping-list/MoveToDepartmentSheet.tsx`: bottom `Sheet` (side `bottom`, `max-lg:portrait:rounded-t-xl` come `AddCustomItemSheet.tsx:40`) con `SheetTitle` **"Sposta in reparto"** e `SheetDescription` **"Scegli il reparto in cui vedere «{nome}». La scelta vale per sempre per questo ingrediente."** Corpo: lista verticale scrollabile (`max-h-[60vh] overflow-y-auto`) di 13 bottoni, uno per categoria in ordine `PANTRY_CATEGORIES`, ciascuno con swatch dot + nome; il reparto corrente della riga è evidenziato (`bg-accent/10 text-accent` + check ✓). Tap su un reparto → `setOverride.mutate({ canonicalKey, departmentId })`, chiusura immediata dello sheet; il toast di esito arriva dalla mutation (§4.3). Non è un'azione distruttiva: **niente ConfirmDialog**.
- Stato dello sheet in `ShoppingListContent`: `const [moveTarget, setMoveTarget] = useState<DepartmentRow | null>(null)`.

#### `AddCustomItemSheet` — select reparto opzionale

- Il campo libero **"Sezione (opzionale)"** resta invariato (serve la vista per-ricetta).
- Si aggiunge sotto di esso un `<select>` **"Reparto (opzionale)"** con prima opzione `"Automatico (dal nome)"` (value `''`) e poi le 13 categorie. Il select nativo richiede `bg-background text-foreground` espliciti (gotcha elementi nativi, AGENTS.md). Helper text sotto: `"Usato nella vista per reparto."` (`text-xs text-muted-foreground`).
- Semantica: se l'utente sceglie un reparto, alla conferma si scrive un **override** `canonicalIngredientKey(nome) → slug` con la stessa mutation di "Sposta in reparto" — nessun campo nuovo su `ShoppingItem`, si riusa la catena (anello 2) e la scelta vale anche per le settimane future. Firma estesa: `onAdd: (name: string, quantity: string, section?: string, departmentId?: string) => void`; in pagina il wrapper chiama `addCustomItem(name, quantity, section)` e, se `departmentId`, `setOverride.mutate({ canonicalKey: canonicalIngredientKey(name), departmentId })`.

#### Cablaggio pagina (`lista-spesa/page.tsx`)

```ts
const { user } = useAuth();                       // nuovo import
const { items, checkedIds, adHocRecipes, ... } = useShoppingList(weekStartDate);
const { items: pantryItems } = usePantry();       // ['pantryItems', uid], enabled: !!user (già nel hook)
const { overrides, setOverride } = useDepartmentOverrides();

const [viewMode, setViewMode] = useState<'reparto' | 'ricetta'>('reparto');
// useEffect: al mount (e al cambio uid) legge localStorage `shopping_list_view:${uid}`;
// handleSetViewMode scrive stato + localStorage.

const departmentSections = useMemo(
  () => buildDepartmentSections(items, checkedIds, adHocRecipes, pantryItems, overrides),
  [items, checkedIds, adHocRecipes, pantryItems, overrides]
);
```

`ShoppingListContent` riceve in più: `viewMode`, `onViewModeChange`, `departmentSections`, `onMoveToDepartment: (canonicalKey, departmentId) => void`. Nel branch `viewMode === 'reparto'` renderizza le `DepartmentSection` al posto di sezioni+gruppi; il bottone "Aggiungi articolo" e `AddCustomItemSheet` restano comuni alle due viste.

Nota copy header pagina: il sottotitolo attuale "Ingredienti aggregati dal piano pasti settimanale." resta invariato.

### 4.6 Edge case ed errori

1. **Articolo matchato in dispensa (anello 1)**: classificato dal `categoryId` della voce; azione "Sposta" nascosta (`source === 'pantry'`), perché l'override perderebbe per precedenza. Il footnote non cambia.
2. **Voce dispensa con `categoryId` sconosciuto** (documenti storici): l'anello 1 **non** classifica (guard `KNOWN_DEPARTMENT_IDS`), la catena prosegue su override/dizionario/`altro`. Mai propagare uno slug ignoto alla UI.
3. **Override verso slug non più valido** (difensivo, gli slug sono costanti): ignorato, catena prosegue.
4. **Collisioni di stem** `pesca/pesce` e `grana/grano`: risolte nel seed (§4.2) a favore di `pesce`/`latticini`; il test collisioni impedisce di reintrodurre la voce persa. L'utente recupera col proprio override (es. `pesc → frutta` se compra più pesche che branzini — vale per entrambe le parole, limite noto e accettato dello stemmer).
5. **Stesso ingrediente nel piano e in un gruppo ad-hoc**: due righe distinte nello stesso reparto (nessun merge cross-blocco, invariante ereditata da AGENTS.md §9); `rowKey` resta univoco (`item.id` vs `groupId:itemId`).
6. **Id e spunte**: gli id non cambiano in nessun percorso ⇒ `shoppingCheckedIds` e `AdHocShoppingItem.checked` funzionano identici in entrambe le viste; nessuna migrazione, nessuna spunta persa.
7. **Reparti vuoti**: non renderizzati (filtro in `buildDepartmentSections`). Una lista non vuota ha sempre almeno una sezione (`altro` raccoglie tutto il resto).
8. **Lista vuota / nessun piano**: gli empty state esistenti (`ShoppingListContent.tsx:52-80`) fanno early-return prima del toggle — nessun toggle su lista vuota.
9. **localStorage `viewMode`**: SSR renderizza sempre `'reparto'`; il valore salvato viene applicato in `useEffect` post-mount (niente hydration mismatch); valori corrotti → default.
10. **"Azzera spunti"**: invariato (azzera solo `checkedIdsList` del piano, non gli ad-hoc — comportamento pre-esistente, uguale in entrambe le viste).
11. **Custom item senza quantità**: `quantity === ''` → `ShoppingItemRow` non renderizza lo span (già gestito, riga 54).
12. **Campo `ingredientDepartmentOverrides` assente sul doc utente**: `?? {}` in `getDepartmentOverrides`; alla prima scrittura `updateDoc` crea il campo (il doc `users/{uid}` esiste sempre, garantito da `ensureUserProfileDocument`, `user-profile.ts:31-42`).
13. **Errore di scrittura override**: toast di errore, nessun cambiamento ottico (la classificazione ricalcola solo su invalidazione riuscita). Nessun fallback localStorage: l'override è cross-device per natura, come gli ad-hoc (`shopping-adhoc.ts`, stesso ragionamento).
14. **Dati dispensa stantii (staleTime 2min)**: un articolo appena aggiunto in dispensa può classificarsi via dizionario per max 2 minuti — degrado accettabile, si risolve da solo al refetch (nessun `onSnapshot`).
15. **Rimozione gruppo ad-hoc**: disponibile solo in vista per-ricetta (con `ConfirmDialog`, invariato); in vista reparto si rimuovono i singoli item. Se serve rimuovere il gruppo, si passa alla vista ricetta — trade-off documentato, evita un'azione distruttiva di gruppo priva del suo contesto visivo.

## 5. Piano di implementazione a fasi

Ogni fase lascia il progetto compilabile (`npx tsc --noEmit`).

**Fase 1 — Tassonomia estesa + dispensa**
- `src/lib/utils/pantry-utils.ts`: +3 voci in `PANTRY_CATEGORIES` (§4.1a).
- `src/app/(dashboard)/dispensa/page.tsx`: remap slug sconosciuti → `'altro'` nel memo `itemsByCategory`, rimozione della IIFE fallback (§4.1a).

**Fase 2 — Modulo matching (anticipo Spec D, solo se assente)**
- `src/lib/utils/ingredient-matching.ts`: `canonicalIngredientKey` + `singularizeWord` (spostate), `matchIngredientToPantry` tier exact/alias (§4.0).
- `src/types/pantry.ts`: `aliases?: string[]` su `PantryItem`.
- `src/lib/utils/ingredient-aggregator.ts`: importa la chiave dal nuovo modulo, elimina le copie private. La suite esistente `ingredient-aggregator.test.ts` deve passare invariata.
- `src/lib/utils/ingredient-matching.test.ts`: test del matcher (exact, alias, no-match).

**Fase 3 — Dizionario e classificazione**
- `src/lib/utils/ingredient-departments.ts`: seed completo, `DEPARTMENT_BY_KEY`, `classifyIngredientDepartment` (§4.2).
- `src/lib/utils/ingredient-departments.test.ts` (§6).

**Fase 4 — Persistenza override**
- `src/types/index.ts`: campo `ingredientDepartmentOverrides` su `User` (§4.1b).
- `src/lib/firebase/department-overrides.ts` (§4.3).
- `src/lib/hooks/useDepartmentOverrides.ts` (§4.3).

**Fase 5 — View model**
- `src/lib/utils/shopping-departments.ts`: `DAY_LABELS`, `buildDepartmentSections` (§4.4).
- `src/components/shopping-list/ShoppingSection.tsx`: importa `DAY_LABELS` condivisa.
- `src/lib/utils/shopping-departments.test.ts` (§6).

**Fase 6 — UI**
- `src/components/shopping-list/ShoppingViewToggle.tsx` (nuovo).
- `src/components/shopping-list/DepartmentSection.tsx` (nuovo).
- `src/components/shopping-list/MoveToDepartmentSheet.tsx` (nuovo).
- `src/components/shopping-list/ShoppingItemRow.tsx`: prop `onMove?`.
- `src/components/shopping-list/AddCustomItemSheet.tsx`: select "Reparto (opzionale)", firma `onAdd` estesa.
- `src/components/shopping-list/ShoppingListContent.tsx`: toggle, branch di vista, `moveTarget`, nuove props.
- `src/app/(dashboard)/lista-spesa/page.tsx`: `useAuth`/`usePantry`/`useDepartmentOverrides`, `viewMode` + localStorage, `useMemo` sezioni, cablaggio (§4.5).

**Fase 7 — Verifica finale e documentazione**
- `npx next build --webpack` (fuori sandbox se `spawn EPERM`), `npm test`.
- CLAUDE.md (Recent Changes), AGENTS.md (eventuali gotcha emersi), checklist in `specs/00-roadmap.md`.

## 6. Piano di test

### Unit test (Jest — `npm test`; pattern esistente in `src/lib/utils/ingredient-aggregator.test.ts`)

**`ingredient-matching.test.ts`** (se Fase 2 eseguita):
- `canonicalIngredientKey`: accenti ("caffè" → "caff"), plurali regolari ("pomodori" ≡ "pomodoro"), velari ("funghi" ≡ "fungo"), multi-parola non collassano ("pomodori pelati" ≠ "pomodori").
- `matchIngredientToPantry`: exact su chiave canonica; alias via `item.aliases`; no-match → `{ item: null, suggestions: [] }`.
- Regression: la suite `ingredient-aggregator.test.ts` passa invariata dopo lo spostamento.

**`ingredient-departments.test.ts`**:
- *Igiene delle chiavi seed* — per ogni chiave di `RAW_INGREDIENT_DEPARTMENTS`: `k === k.toLowerCase()`, `k === k.trim().replace(/\s+/g, ' ')`, nessun diacritico (`k.normalize('NFD')` non matcha `/[\u0300-\u036f]/`).
- *Nessuna collisione* — nessuna coppia di chiavi raw con stesso `canonicalIngredientKey` e reparto **diverso** (le coppie -cia/-ce con stesso reparto sono legittime). Questo test è il guardrail delle collisioni documentate (pesca/pesce, grana/grano).
- *Valori validi* — ogni valore è uno slug presente in `PANTRY_CATEGORIES`.
- *Lookup per stem* — `classify('Pomodori')` → `verdura`; `classify('pomodori pelati')` → `condimenti`; `classify('Funghi')` → `verdura`; `classify('fiocchi d'avena')` → `cereali`; `classify('pesche')` → `pesce` (collisione documentata, asserita come comportamento noto); `classify('ingrediente inventato')` → `altro`/`fallback`.
- *Catena di precedenza* — con voce dispensa matchata (`categoryId: 'spezie'`) vince la dispensa anche se override e dizionario dicono altro; senza match vince l'override sul dizionario; override con slug ignoto viene ignorato; voce dispensa con `categoryId` ignoto non classifica (si scende all'anello 2).

**`shopping-departments.test.ts`**:
- Ordine sezioni = ordine `PANTRY_CATEGORIES`; reparti vuoti omessi; righe alfabetiche (`localeCompare 'it'`).
- Item piano/custom/ad-hoc finiscono nel reparto giusto con `kind`, `checked` e footnote corretti (piano = "Ricetta (Lun)", custom = "Aggiunto manualmente", ad-hoc = titolo ricetta).
- `rowKey` univoci con stesso ingrediente in piano e in due gruppi ad-hoc.
- `source === 'pantry'` per item matchati in dispensa (base per nascondere "Sposta").
- Gli `id` delle righe coincidono con gli id originali (invariante spunte).

### Collaudo guidato (Playwright + emulatori — protocollo in CLAUDE.md "Guided testing tooling")

Script usa-e-getta in `e2e/scratch/` (gitignored, eliminato a fine collaudo). Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; seed via Admin SDK contro l'emulatore (utente, ricette con ingredienti-spia, `meal_plans` della settimana corrente, un paio di `pantry_items`, un gruppo ad-hoc). Fasi:
1. **Vista default**: aprire `/lista-spesa` → vista "Per reparto" attiva; sezioni nell'ordine atteso; ingrediente-spia da dizionario nel reparto giusto; ingrediente inventato in "Altro"; footnote ricetta/giorno presenti; item ad-hoc nel reparto col titolo ricetta come footnote.
2. **Precedenza dispensa**: ingrediente presente in `pantry_items` con `categoryId: 'spezie'` → compare in "Spezie" e la riga non ha il bottone "Sposta".
3. **Override**: "Sposta in reparto…" su un articolo da dizionario → scegliere un altro reparto → assert su Firestore (emulatore) che `users/{uid}.ingredientDepartmentOverrides` contiene `{stem: slug}`; l'articolo cambia sezione dopo l'invalidazione; reload → la scelta persiste.
4. **Spunte cross-vista**: spuntare 2 articoli in vista reparto → passare a "Per ricetta" → gli stessi risultano spuntati (assert anche su `meal_plans.shoppingCheckedIds` dopo il flush); progress bar identica nelle due viste.
5. **Persistenza toggle**: selezionare "Per ricetta", ricaricare → la vista resta "Per ricetta" (localStorage).
6. **Custom item con reparto**: "Aggiungi articolo" con reparto esplicito → appare nel reparto scelto e l'override è scritto su Firestore.
7. **Dispensa**: pagina `/dispensa` mostra le nuove categorie nel form e nessuna doppia sezione "Altro".

## 7. Gotcha e vincoli (pertinenti, da AGENTS.md/CLAUDE.md)

- **Mai `undefined` su Firestore** (AGENTS.md Quick Ref "Firebase optional"): `ingredientDepartmentOverrides` si scrive sempre come mappa completa; `aliases` è opzionale e qui mai scritto.
- **`enabled: !!user`** su ogni query auth-bound (AGENTS.md §3): vale per `['departmentOverrides', uid]`; `usePantry` lo fa già (`usePantry.ts:19-24`).
- **Niente `onSnapshot`** (CLAUDE.md React Query): gli override sono una query invalidata dalla mutation, non un listener.
- **Nuovo target di persistenza → proprio debounce + registrazione in `flushAll`** (AGENTS.md riga "Nuovo target di persistenza dimenticato nel flush"): qui **deliberatamente evitato** — l'override usa scrittura diretta `updateDoc` senza debounce (azione rara e deliberata), quindi non entra in `flushAll()` di `useShoppingList.ts:346-349`. Se in futuro diventasse debounced, andrebbe registrato lì.
- **`ConfirmDialog` per azioni distruttive, mai `confirm()` nativi** (AGENTS.md Quick Ref): "Sposta in reparto" non è distruttivo → nessun dialog; la rimozione gruppo ad-hoc conserva il suo `ConfirmDialog` (vista ricetta, invariato). Feedback via `react-hot-toast` (stile globale in `providers.tsx`).
- **Token semantici, mai `bg-white`** (AGENTS.md §6): toggle, sezioni e sheet usano `bg-background/bg-muted/text-foreground/…`; il `<select>` nativo del reparto richiede `bg-background text-foreground` espliciti ("Elementi HTML nativi senza `bg`").
- **Controlli mai solo `group-hover` sotto `lg`** (AGENTS.md Quick Ref): il bottone "Sposta" è sempre visibile, con `aria-label`.
- **Side-stripe ban** (AGENTS.md Quick Ref): il colore reparto è un dot badge, mai `border-l-2+` colorato.
- **Collapsible con `grid-template-rows`, mai `max-height`** (AGENTS.md Quick Ref): `DepartmentSection` replica il pattern di `ShoppingSection.tsx:73-77`.
- **User Profile Extensions** (AGENTS.md §2): gli override vivono su `users/{uid}` — nessuna nuova collection, regola o indice.
- **Slot orfani / aggregazione**: `buildContributions` e `aggregateIngredients` **non si toccano**; id item invariati ⇒ nessun orphaning di `shoppingCheckedIds` (rischio documentato nella mappa: cambiare `canonicalIngredientKey`/`toSlug` orfanerebbe le spunte — per questo la funzione si **sposta** senza modificarne il comportamento).
- **Lista spesa = vista derivata cacheata** (AGENTS.md Quick Ref "Lista spesa stale"): la mutation override invalida solo `['departmentOverrides']` — sufficiente perché la classificazione è un `useMemo` a valle; non toccare `invalidateShoppingList`.
- **Sentinella `'__null__'`** (`useShoppingList.ts:396`, `ShoppingListContent.tsx:30`): resta confinata alla vista per-ricetta; la vista reparto non la usa (i reparti sono slug reali).
- **Sheet accessibility** (AGENTS.md §6): `SheetDescription` obbligatoria nei nuovi sheet.
- **`useState(prop)` non reattivo** (AGENTS.md Quick Ref): `MoveToDepartmentSheet` riceve il target via prop a ogni apertura — derivare il contenuto dalle props, non copiarle in stato.
- **Structured outputs / vincoli numerici negli schema JSON**: non pertinente — questa spec non tocca endpoint AI.
- **Build**: validare con `npx tsc --noEmit` + `npx next build --webpack` (`next lint` non esiste più in Next 16); `spawn EPERM` in sandbox → rilanciare fuori sandbox.

## 8. Fuori scope

- Il motore completo di Spec D: alias persistenti confermati dall'utente, suggestions fuzzy, `isTrivialIngredient` (ingredienti banali), sezione "Hai già in casa", badge "in dispensa: 500 g", spunta→dispensa batch, export di `parseQuantity`. Qui si anticipa solo il sottoinsieme §4.0.
- Merge cross-blocco piano ↔ ad-hoc (resta una non-feature deliberata).
- Modifica di `canonicalIngredientKey`/`toSlug`/stemmer (invarianti per le spunte).
- Reparto visibile o modificabile in dispensa oltre a quanto già esiste (la categoria dispensa È il reparto).
- UI per rimuovere/gestire gli override esistenti (si corregge ri-spostando; una pagina di gestione è eventuale lavoro futuro).
- Ordinamento personalizzato dei reparti per supermercato dell'utente.
- Qualsiasi endpoint AI: la classificazione è interamente locale e gratuita.
- Kcal in lista spesa (esclusione confermata, CLAUDE.md).

## 9. Prompt di implementazione

```markdown
Implementa la Spec E (lista della spesa per reparto) del progetto "Il Mio Ricettario".

1. Leggi e applica: CLAUDE.md, AGENTS.md, COMMENTS.md e DEVELOPMENT_GUIDELINES.md (root del repo).
2. Leggi PER INTERO specs/00-roadmap.md (contratto condiviso vincolante, in particolare i contratti cross-spec 2 e 3) e specs/spec-e-lista-spesa-reparti.md (questa spec): implementala fedelmente, senza rimettere in discussione le decisioni di prodotto.
3. Verifica se src/lib/utils/ingredient-matching.ts esiste già (Spec D implementata): se sì usa i suoi export e salta la Fase 2 della spec; se no anticipa il sottoinsieme minimo descritto in §4.0.
4. Crea il branch feature/shopping-departments a partire da develop.
5. Implementa fase per fase (§5, Fasi 1→7). Dopo OGNI fase esegui `npx tsc --noEmit` e correggi prima di proseguire.
6. Esegui i test con `npm test` (comando reale verificato in package.json: "test": "jest"); la suite esistente ingredient-aggregator.test.ts deve passare INVARIATA dopo lo spostamento di canonicalIngredientKey.
7. A fine lavoro: `npx next build --webpack`; se fallisce con `spawn EPERM` nel sandbox, rilanciala fuori sandbox prima di indagare il codice.
8. Aggiorna: CLAUDE.md (sezione "Recent Changes", nuova entry datata), AGENTS.md (solo se emergono gotcha nuovi da debug reale), e la checklist di stato in specs/00-roadmap.md (spunta Spec E).
9. NON committare MAI senza OK esplicito dell'utente (regola di sessione: un branch/commit a sessione).
10. Al termine proponi un collaudo guidato fase-per-fase secondo il protocollo "Guided testing tooling" di CLAUDE.md, con script usa-e-getta in e2e/scratch/ (emulatori Firebase + Playwright), seguendo le 7 fasi del §6 della spec: dichiarando per ogni fase l'esito atteso prima di eseguirla.
```

## 10. Modello e effort consigliati

Sonnet · effort high — meccanica una volta implementata la Spec D; il valore sta nel dizionario curato e nella UI del toggle di vista.

Motivazione: la logica (catena di precedenza, view model puro, toggle) è ben delimitata e completamente specificata sopra; il rischio residuo è editoriale (qualità del seed) e di rifinitura UI, non algoritmico.
