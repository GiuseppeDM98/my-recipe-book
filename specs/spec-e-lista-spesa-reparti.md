# Spec E — Shopping list grouped by supermarket department

> Notes covered: 6 (grouping by department) | Dependencies: Spec D (matching engine — see §4.0 for the minimal subset to bring forward if D is not yet implemented) | Branch: `feature/shopping-departments`

---

## 1. Goal

Today the shopping list is organized "by recipe": sections reflect the recipes' internal sub-sections ("Per la pasta", "Per il ragù") plus the ad-hoc "Voglio preparare questo" groups. At the supermarket this order is useless: you walk through departments, not recipes. With this spec the list gains a **"Per reparto" view** (default): every item — derived from the plan, custom or ad-hoc — is classified into a department of the extended pantry taxonomy (13 departments: the existing 10 + `surgelati`, `panetteria`, `altro`) and shown in collapsible sections in a fixed order, with items in alphabetical order. A "Per reparto / Per ricetta" toggle lets you go back to the current layout, which stays unchanged. Classification follows a precedence chain (pantry → user override → static dictionary → `altro`) and the user can permanently fix a wrong department with the "Sposta in reparto…" row action. Item ids do not change: existing check marks stay valid.

## 2. Current state

References verified against the code as of 2026-08-12 (branch `develop`, HEAD `c99e86e`).

### 2.1 Pantry taxonomy

`src/lib/utils/pantry-utils.ts:7-18` — 10 hardcoded categories (not Firestore documents):

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

`PantryCategory` is `{ id: string; name: string; color: string }` (`src/types/pantry.ts:19-23`). `PantryItem.categoryId` is a slug in this constant (`src/types/pantry.ts:9`). The pantry page (`src/app/(dashboard)/dispensa/page.tsx:231-255`) renders a `CategorySection` for each category present and collects unknown slugs into a fallback "Altro" section built with an IIFE:

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

The upstream grouping is `itemsByCategory` (`dispensa/page.tsx:110-117`), a `Map<string, PantryItem[]>` keyed on the raw `item.categoryId`.

### 2.2 Canonical ingredient key (private)

`src/lib/utils/ingredient-aggregator.ts:164-174` — currently **not exported**:

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

`singularizeWord` (`ingredient-aggregator.ts:184-206`) is the conservative Italian stemmer: it handles velars (`-chi/-che → c`, `-ghi/-ghe → g`), `-io → i`, then strips a final vowel on words ≥ 4 characters. Note: **the canonical key is a stem**, not the singular form — `canonicalIngredientKey('pomodoro') === 'pomodor'`, `canonicalIngredientKey('caffè') === 'caff'`. Plan item ids are `toSlug(canonical key)` (`ingredient-aggregator.ts:127` and `148-154`).

### 2.3 Shopping list

- **Derivation**: `useShoppingList(weekStartDate)` (`src/lib/hooks/useShoppingList.ts:84`) — query `['shoppingList', uid, weekStartDate]` → `getMealPlanByWeek` + `getRecipesByIds` → `buildContributions` → `aggregateIngredients`. Aggregated items are ephemeral; only `shoppingCheckedIds` and `shoppingCustomItems` are persisted on the `meal_plans` document (500ms debounce + flush, `useShoppingList.ts:315-365`).
- **Current sorting and sections**: `useShoppingList.ts:370-381` sorts `[...planItems, ...customItems]` by `section → name` (`null` section last); `sectionNames` (`386-398`) uses the `'__null__'` sentinel. `ShoppingListContent.tsx:30-31` translates it to `"Senza categoria"`. This logic **is not touched**: the "Per ricetta" view needs it.
- **Rendering**: `ShoppingListContent.tsx:82-142` — progress bar, one `ShoppingSection` per section, then one `AdHocRecipeGroup` per ad-hoc group, then the "Aggiungi articolo" button (gated on `hasPlan`, line 125) that opens `AddCustomItemSheet`.
- **Footnote**: `ShoppingSection.tsx:18-26` — `DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']` and `footnoteFor(item)`, which produces `"Ricetta (Lun), …"` or `"Aggiunto manualmente"` for custom items.
- **Row**: `ShoppingItemRow.tsx:6-14` — generic props:

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

- **Ad-hoc**: groups on `users/{uid}.adHocShoppingRecipes` (`src/lib/firebase/shopping-adhoc.ts:17-28`), `checked` embedded per item (`AdHocShoppingItem`, `src/types/index.ts:496-501`), rendered by `AdHocRecipeGroup.tsx` with a `ConfirmDialog` on group removal.
- **Custom item form**: `AddCustomItemSheet.tsx:79-91` has the free-text field "Sezione (opzionale)" (`placeholder="es. Latticini"`) that feeds `ShoppingItem.section`.
- **Types**: `ShoppingItem` (`src/types/index.ts:474-486`), `User` with `familyProfile` and `adHocShoppingRecipes` (`src/types/index.ts:26-41`), an already established "user doc extension" pattern (`AGENTS.md` §2 "User Profile Extensions"; owner rule on `users/{uid}` in `firebase/firestore.rules:14-18`).
- **Page**: `src/app/(dashboard)/lista-spesa/page.tsx:18-129` — `weekStartDate` state, header + "Azzera spunti", week navigation, skeleton, `ShoppingListContent`.

### 2.4 What does NOT exist today

- No notion of department on list items; `ShoppingItem.section` has preparation semantics ("Per la pasta"), not store semantics.
- No list ↔ pantry link (zero cross imports, verified).
- No `ingredient-matching.ts` or `ingredient-departments.ts` module (Spec D is specified in `specs/spec-d-dispensa-matching.md` but not yet implemented at the time of writing: no corresponding file in `src/`).

## 3. Product decisions (constraints from the roadmap)

From cross-spec contract no. 3 of `specs/00-roadmap.md` (binding):

1. **Single taxonomy**: reuse `PANTRY_CATEGORIES` extended with `surgelati`, `panetteria` and `altro` (explicit fallback), keeping the 10 existing slugs and the earthy OKLCH colors.
2. **Classification chain** for a list item, in order of precedence:
   1. `categoryId` of the matched pantry entry (via contract 2, Spec D's matching engine);
   2. the user's manual override (`users/{uid}.ingredientDepartmentOverrides`, a `canonicalKey → categoryId` map);
   3. curated static dictionary `src/lib/utils/ingredient-departments.ts` (~200–400 common Italian ingredients);
   4. `altro` fallback.
3. **View toggle** "Per reparto" / "Per ricetta", default **department**; the per-recipe view keeps the current layout.
4. From contract no. 2: the canonical key comes from `canonicalIngredientKey` exported by the new `src/lib/utils/ingredient-matching.ts` module; a non-match remains the safe failure.
5. Unchanged project rule: kcal stay out of the shopping list (CLAUDE.md).

## 4. Proposed design

### 4.0 Prerequisite: minimal subset of Spec D to bring forward

The recommended order is D → E, but this spec must be implementable even if D is not yet on the branch. **If `src/lib/utils/ingredient-matching.ts` already exists** (Spec D done): use its exports and skip this paragraph. **Otherwise** create it with this subset, signature-compatible with the roadmap's contract 2 so that D can simply extend it:

```ts
// src/lib/utils/ingredient-matching.ts  (subset brought forward by Spec E)
import { PantryItem } from '@/types/pantry';

/** MOVED here from ingredient-aggregator.ts (where it was private), together with singularizeWord. */
export function canonicalIngredientKey(name: string): string { /* body identical to §2.2 */ }

export type PantryMatch =
  | { item: PantryItem; confidence: 'exact' | 'alias' }
  | { item: null; suggestions: PantryItem[] };

/**
 * 'exact' tier: same canonical key as the pantry entry's name.
 * 'alias' tier: the key is among the aliases confirmed by the user (optional
 * field introduced by Spec D; here the defensive check is enough).
 * suggestions: always [] in this subset — fuzzy matching is Spec D's job.
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

- In `src/types/pantry.ts` add contract 2's field to `PantryItem`: `aliases?: string[];` (confirmed canonical keys — only read here, never written; optional ⇒ no migration, and `undefined` must never be persisted on write).
- `ingredient-aggregator.ts` imports `canonicalIngredientKey` from the new module and **deletes** its own private copy (together with `singularizeWord`, which moves). `toSlug` stays in the aggregator. Behavior unchanged: the `ingredient-aggregator.test.ts` suite must pass without modifications.
- When Spec D lands, it will replace/extend `matchIngredientToPantry` (persistent aliases, fuzzy suggestions, `isTrivialIngredient`, export of `parseQuantity`) without touching E's call sites.

### 4.1 Data model

#### (a) Extended taxonomy — `pantry-utils.ts`

`PANTRY_CATEGORIES` becomes (the existing 10 unchanged, 3 new entries **appended**, `altro` last — the array order is also the render order of departments in the list and of sections in the pantry):

```ts
export const PANTRY_CATEGORIES: PantryCategory[] = [
  // ... the existing 10, unchanged ...
  { id: 'surgelati', name: 'Surgelati', color: 'oklch(86% 0.05 220)' },
  { id: 'panetteria', name: 'Panetteria', color: 'oklch(83% 0.08 75)' },
  { id: 'altro', name: 'Altro', color: 'oklch(85% 0.02 85)' },
];
```

Color rationale (consistent with the existing earthy palette, L 72–88%, C 0.02–0.13):
- `surgelati` `oklch(86% 0.05 220)` — "warm ice", hue between fish (230) and drinks (250), low chroma like dairy;
- `panetteria` `oklch(83% 0.08 75)` — bread crust, between fruit (60) and dairy (80), distinct from condiments (95) in hue and chroma;
- `altro` `oklch(85% 0.02 85)` — warm near-gray neutral, openly a "non-color" for the fallback.

Side effects to handle in the pantry (same phase):
- `PantryAddSheet` automatically shows the 3 new options in the category select (it iterates `PANTRY_CATEGORIES`) — no change needed.
- `dispensa/page.tsx`: now that `altro` is a real category, the fallback IIFE from §2.1 would produce **two** "Altro" sections (one for items with `categoryId === 'altro'`, one for unknown slugs). Fix: in the `itemsByCategory` memo (lines 110-117) remap unknown slugs to `'altro'` before grouping and **delete the IIFE** (lines 241-255):

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

#### (b) `User` type — department overrides

`src/types/index.ts`, inside `interface User` (after `adHocShoppingRecipes`, line 38):

```ts
/**
 * Manual "ingredient → department" overrides for the shopping list's
 * per-department view. Key = canonicalIngredientKey(name) (stem), value =
 * slug in PANTRY_CATEGORIES. Applies permanently to that canonical key.
 * Precedence: loses only to the categoryId of the matched pantry entry.
 * Same pattern as familyProfile/adHocShoppingRecipes: a field on users/{uid},
 * no new collection/rule/index.
 */
ingredientDepartmentOverrides?: Record<string, string> | null;
```

#### (c) `ShoppingItem`, `AdHocShoppingItem`, `MealPlan`: **unchanged**

No new persisted field on items: classification is derived at render time, so ids (`toSlug(canonical key)` / UUID) and `shoppingCheckedIds` do not change. No migration.

### 4.2 Static dictionary — `src/lib/utils/ingredient-departments.ts`

New module. Structure:

```ts
import { canonicalIngredientKey, matchIngredientToPantry } from './ingredient-matching';
import { PANTRY_CATEGORIES } from './pantry-utils';
import { PantryItem } from '@/types/pantry';

export const DEPARTMENT_FALLBACK_ID = 'altro';

/**
 * Seed dictionary "ingredient name → department".
 *
 * KEY CONVENTION (verified by the tests, see §6):
 * - lowercase, no accents (e.g. "caffe", "baccala"), single spaces;
 * - SINGULAR form when singular and plural share the stem (the normal
 *   case: "pomodoro" covers "pomodori"); for irregular -cia/-ce and -io/-a
 *   pairs that do NOT share the stem, add both forms
 *   (e.g. "arancia" and "arance", "salsiccia" and "salsicce");
 * - multi-word entries are allowed and recommended for specific cases:
 *   stemming is per word, so "pomodoro pelato" matches "pomodori
 *   pelati" but is NOT matched by "pomodoro" (consistent with the
 *   aggregator's conservative philosophy).
 *
 * At runtime the module normalizes each key with canonicalIngredientKey and
 * builds a stem → slug Map (see DEPARTMENT_BY_KEY below): lookup always
 * happens on the stem, never on the form written here.
 */
export const RAW_INGREDIENT_DEPARTMENTS: Record<string, string> = {
  // ... see full seed below ...
};

/** Lookup map: canonical stem → department slug. Built once at load. */
export const DEPARTMENT_BY_KEY: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [rawKey, dept] of Object.entries(RAW_INGREDIENT_DEPARTMENTS)) {
    const key = canonicalIngredientKey(rawKey);
    if (!map.has(key)) map.set(key, dept); // first declaration wins; the tests forbid conflicts
  }
  return map;
})();

const KNOWN_DEPARTMENT_IDS = new Set(PANTRY_CATEGORIES.map(c => c.id));

export type DepartmentSource = 'pantry' | 'override' | 'dictionary' | 'fallback';

export interface DepartmentClassification {
  departmentId: string;      // slug in PANTRY_CATEGORIES (always valid)
  source: DepartmentSource;  // which link of the chain it comes from
  canonicalKey: string;      // canonical key of the name (for the override)
}

/**
 * Precedence chain (roadmap contract 3):
 * 1. categoryId of the matched pantry entry (only if a known slug — an
 *    unknown slug on the pantry doc does NOT classify and the chain continues);
 * 2. user override (ignored if it points to a slug that is no longer known);
 * 3. static dictionary;
 * 4. 'altro' fallback.
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

#### Full dictionary seed (~290 entries)

To be copied in full into `RAW_INGREDIENT_DEPARTMENTS`, organized and ordered as follows (multi-word keys in quotes):

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

// ── Frutta (incl. nuts and dried fruit) ──────────────────
mela: 'frutta', pera: 'frutta', banana: 'frutta',
arancia: 'frutta', arance: 'frutta', // -cia/-ce: different stems, both needed
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

// ── Carne and cured meats ────────────────────────────────
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
pesce: 'pesce', // NOTE: stem "pesc" also covers "pesca" (the fruit) — documented collision, see §4.5
'pesce spada': 'pesce', tonno: 'pesce', salmone: 'pesce',
'salmone affumicato': 'pesce', merluzzo: 'pesce', baccala: 'pesce',
branzino: 'pesce', spigola: 'pesce', orata: 'pesce', sogliola: 'pesce',
platessa: 'pesce', sgombro: 'pesce', alice: 'pesce', acciuga: 'pesce',
sardina: 'pesce', gambero: 'pesce', gamberetto: 'pesce',
mazzancolla: 'pesce', scampo: 'pesce', calamaro: 'pesce', seppia: 'pesce',
polpo: 'pesce', cozza: 'pesce', vongola: 'pesce', trota: 'pesce',

// ── Latticini and eggs ───────────────────────────────────
latte: 'latticini', panna: 'latticini', 'panna da cucina': 'latticini',
'panna fresca': 'latticini', 'panna acida': 'latticini', burro: 'latticini',
yogurt: 'latticini', 'yogurt greco': 'latticini', kefir: 'latticini',
uovo: 'latticini', albume: 'latticini', tuorlo: 'latticini',
mozzarella: 'latticini', 'mozzarella di bufala': 'latticini',
fiordilatte: 'latticini', burrata: 'latticini', stracciatella: 'latticini',
ricotta: 'latticini', mascarpone: 'latticini', parmigiano: 'latticini',
'parmigiano reggiano': 'latticini',
grana: 'latticini', // NOTE: stem "gran" also covers "grano" — documented collision, see §4.5
'grana padano': 'latticini', pecorino: 'latticini',
'pecorino romano': 'latticini', gorgonzola: 'latticini',
taleggio: 'latticini', fontina: 'latticini', asiago: 'latticini',
scamorza: 'latticini', provola: 'latticini', provolone: 'latticini',
stracchino: 'latticini', crescenza: 'latticini', robiola: 'latticini',
caciotta: 'latticini', caprino: 'latticini', feta: 'latticini',
emmental: 'latticini', brie: 'latticini', formaggio: 'latticini',
'formaggio spalmabile': 'latticini',

// ── Cereali: pasta, rice, flours ─────────────────────────
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

// ── Condimenti: oil, vinegar, sauces, canned goods, pantry sweets ──
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
'gocce di cioccolato': 'condimenti', // plural in common use: the stem of "goccia" does not cover "gocce"
cacao: 'condimenti', 'cacao amaro': 'condimenti',

// ── Spezie and aromatic herbs ────────────────────────────
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
acqua: 'bevande', // Spec D's "trivial ingredients" filter removes it upstream when active
'acqua frizzante': 'bevande', 'acqua naturale': 'bevande',
vino: 'bevande', 'vino bianco': 'bevande', 'vino rosso': 'bevande',
birra: 'bevande', caffe: 'bevande', te: 'bevande', 'te verde': 'bevande',
tisana: 'bevande', camomilla: 'bevande', succo: 'bevande',
'succo di frutta': 'bevande', 'latte di soia': 'bevande',
'latte di avena': 'bevande', 'latte di mandorla': 'bevande',
'latte di cocco': 'bevande', spumante: 'bevande', prosecco: 'bevande',
marsala: 'bevande', rum: 'bevande', brandy: 'bevande', grappa: 'bevande',
limoncello: 'bevande', aranciata: 'bevande',

// ── Typical Surgelati ────────────────────────────────────
gelato: 'surgelati', ghiacciolo: 'surgelati',
pisello: 'surgelati', // curated choice: in Italy peas are almost always bought frozen
'bastoncino di pesce': 'surgelati', 'spinacio surgelato': 'surgelati',
'verdura surgelata': 'surgelati', 'patatina fritta': 'surgelati',

// ── Panetteria and leavened goods ────────────────────────
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

Binding editorial notes on the seed:
- **Stem collisions resolved explicitly** (the stemmer is what it is, it is not touched):
  - `pesca`/`pesce` → both stem `pesc`: assigned to **`pesce`** (in a savory cookbook fish is far more frequent; peaches are recovered via "pesca noce"/"nettarina" or a user override). **Do not add a `pesca` entry**: the collision tests would fail.
  - `grana`/`grano` → stem `gran`: assigned to **`latticini`** (grated "grana" is ubiquitous; wheat lives in the multi-word "grano saraceno"). **Do not add `grano`**.
  - `polpa`/`polpo` → stem `polp`: only `polpo` (fish); "polpa di pomodoro" is multi-word and does not collide.
- Sugar/cocoa/chocolate → `condimenti` (dry pantry; there is no "sweets" department): curated choice, overridable.
- All `lievito*` → `panetteria` for consistency (including "lievito per dolci", which at the supermarket sits with the flours: whoever prefers otherwise moves it with the override).
- `acqua` is in the dictionary for pre-Spec D completeness; when D introduces `isTrivialIngredient`, trivial ingredients disappear upstream and the entry becomes inert.

### 4.3 Override persistence — `users/{uid}.ingredientDepartmentOverrides`

New file `src/lib/firebase/department-overrides.ts`:

```ts
import { doc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { getUserProfile } from './user-profile';

export async function getDepartmentOverrides(userId: string): Promise<Record<string, string>> {
  const profile = await getUserProfile(userId);
  return profile?.ingredientDepartmentOverrides ?? {};
}

/**
 * Writes/updates a single override with a read-modify-write of the ENTIRE map.
 *
 * WHY not a per-key dot-path update: canonical keys contain spaces
 * ("pomodor pelat") and Firestore field paths with special characters
 * require fragile escaping via FieldPath; the map is small and writes are
 * rare, so rewriting it whole is simpler and more robust
 * (same trade-off as updateAdHocShoppingList, shopping-adhoc.ts:22-28).
 *
 * WHY a direct write, no debounce: unlike check marks (bursts of taps
 * coalesced at 500ms), moving a department is
 * a rare, deliberate action, one at a time, from a sheet. A debounce
 * would create a THIRD persistence target to register in flushAll()
 * (gotcha "New persistence target forgotten in the flush", AGENTS.md)
 * with no coalescing benefit.
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

New hook `src/lib/hooks/useDepartmentOverrides.ts`:

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

No new Firestore rule/index: the owner rule on `users/{uid}` (`firestore.rules:14-18`) already covers the field. There is no need to invalidate `['shoppingList']`: classification is a downstream `useMemo` that depends on the overrides query, so invalidating `['departmentOverrides']` is enough to recompute the view.

### 4.4 View model — `src/lib/utils/shopping-departments.ts`

New pure module (testable with Jest) that builds the department view's sections from the same data as the recipe view:

```ts
import { AdHocShoppingRecipe, ShoppingItem } from '@/types';
import { PantryItem } from '@/types/pantry';
import { PANTRY_CATEGORIES } from './pantry-utils';
import { classifyIngredientDepartment, DepartmentSource } from './ingredient-departments';

/** Shared day labels (currently duplicated in ShoppingSection.tsx:18 — import them from here). */
export const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export interface DepartmentRow {
  /** Unique render key: plan/custom = item.id; ad-hoc = `${groupId}:${itemId}`. */
  rowKey: string;
  kind: 'plan' | 'custom' | 'adhoc';
  /** Item id in its own domain (ShoppingItem.id or AdHocShoppingItem.id) — UNCHANGED. */
  id: string;
  /** Only kind 'adhoc'. */
  groupId?: string;
  name: string;
  quantity: string;
  checked: boolean;
  footnote?: string;
  canonicalKey: string;
  source: DepartmentSource;
}

export interface DepartmentSectionModel {
  id: string;     // department slug
  name: string;   // label ("Surgelati")
  color: string;  // OKLCH for the swatch
  rows: DepartmentRow[];
}

/**
 * Builds the per-department sections in PANTRY_CATEGORIES order,
 * OMITTING empty departments. Rows in alphabetical order (localeCompare 'it').
 *
 * - items: plan + custom items, THE SAME ones as the per-recipe view
 *   (any upstream filter — trivial items, Spec D's "Hai già in casa" — is
 *   already applied: both views consume the same array).
 * - checked: plan/custom from checkedIds; ad-hoc from item.checked (embedded).
 * - footnote: plan = "Ricetta (Lun), …" (same format as footnoteFor,
 *   ShoppingSection.tsx:20-26); custom = "Aggiunto manualmente";
 *   ad-hoc = the group's recipe title.
 * - NO cross-block merge: the same ingredient present in the plan and
 *   in an ad-hoc group produces two rows in the same department (explicit
 *   inherited choice, AGENTS.md §9).
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

Update `ShoppingSection.tsx` to import `DAY_LABELS` from here (removing the local copy on line 18) — zero future divergence.

### 4.5 UI/UX

#### View toggle (new component `src/components/shopping-list/ShoppingViewToggle.tsx`)

- Two-option segmented control: **"Per reparto"** / **"Per ricetta"**. Container `inline-flex rounded-lg bg-muted p-1`, active button `bg-background text-foreground shadow-sm`, inactive `text-muted-foreground`; `rounded-md px-3 py-1.5 text-sm font-medium transition-colors` on both. Semantic tokens only (dark adaptation for free). `role="tablist"` not needed: two `<button type="button" aria-pressed={…}>` are enough.
- **Default: `'reparto'`**. Preference **persisted in localStorage** with key `shopping_list_view:${uid}`, values `'reparto' | 'ricetta'` (unknown/missing value → `'reparto'`). Why localStorage and not Firestore: it is a pure presentation preference, per-device is fine (on the phone at the supermarket you want "reparto", on desktop while planning perhaps "ricetta"); it avoids a Firestore write per toggle and above all avoids a third persistence target with debounce/flush (see gotcha in §7). Anti-hydration-mismatch pattern: `useState<'reparto' | 'ricetta'>('reparto')` + a `useEffect` that reads localStorage after mount (like ThemePicker's `mounted` pattern, AGENTS.md); every change writes localStorage immediately.
- Position: inside `ShoppingListContent`, above `ShoppingProgressBar` (so the existing empty states, which early-return, hide it on their own). The `viewMode` state lives in `lista-spesa/page.tsx` and is passed down via prop.

#### "Per reparto" view (new component `src/components/shopping-list/DepartmentSection.tsx`)

- One collapsible section per department **in `PANTRY_CATEGORIES` order**, empty departments **not rendered** (already guaranteed by `buildDepartmentSections`).
- Header structurally identical to `ShoppingSection` (chevron, title, `checked/total` counter, all-checked state `text-accent bg-accent/8 border-accent/30`), plus a **swatch**: `<span aria-hidden className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />` before the title. The OKLCH colors (L 72–88%) are legible on both themes as solid dots; the rest of the header uses semantic tokens. **No side-stripe** (AGENTS.md ban): just the dot.
- Collapse animation with `grid-rows-[0fr] → grid-rows-[1fr]` + `overflow-hidden` wrapper (same pattern as `ShoppingSection.tsx:73-93`, never `max-height`). No auto-close: local `expanded` state, open by default.
- Rows: `ShoppingItemRow` with `name`/`quantity`/`checked`/`footnote` from the `DepartmentRow`. Callback dispatch by `kind`:
  - `plan`/`custom` → `onToggle(row.id)` (same `toggleItem` as today; unchanged ids ⇒ `shoppingCheckedIds` intact);
  - `adhoc` → `onToggleAdHocItem(row.groupId!, row.id)`.
  - `onRemove`: only `custom` (→ `removeCustomItem`) and `adhoc` (→ `removeAdHocItem`), as today. **Removing the whole ad-hoc group** stays available only in the per-recipe view (where the group is visible as a unit); documented in §4.6.
- Progress bar and "Azzera spunti": **outside the toggle**, identical behavior in both views. Feasibility verified: `progress` is computed in the hook on `checkedIdsList + items + adHocRecipesList` (`useShoppingList.ts:402-412`) with no dependency on grouping, and the department view consumes the same arrays without filtering them. The same holds for Spec D's future "Hai già in casa" section: classification lives in the hook (`pantryInfoById`, Spec D §4.4.1) and the partition is applied in `ShoppingListContent` **upstream of any view grouping** (Spec D §4.4.3) — "already at home" items leave the arrays before any view groups them, so both views inherit it identically without dedicated logic. Contract to respect here: `buildDepartmentSections` receives already partitioned/filtered `items` and must never re-filter.

#### "Per ricetta" view

Current layout **pixel-for-pixel unchanged**: `ShoppingSection` sections by `section` + `AdHocRecipeGroup` groups + `'__null__'` sentinel → "Senza categoria". No "Sposta in reparto" action here (the department is not visible, the action would be out of context).

#### Manual override — "Sposta in reparto…"

- `ShoppingItemRow` gains an optional `onMove?: () => void` prop. When present, it renders an icon button (lucide `FolderInput`, `w-4 h-4`) next to the trash can: `aria-label={"Sposta " + name + " in un altro reparto"}`, classes `flex-shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors`. **Always visible** (never `group-hover` only: touch context, AGENTS.md).
- `onMove` is passed **only** in the department view and **only** for rows with `source !== 'pantry'`: if the department comes from the matched pantry entry's `categoryId` (link 1 of the chain), an override would have no effect because of precedence — showing the action would be a false promise. (To change the department of those items you edit the pantry entry's category.)
- New component `src/components/shopping-list/MoveToDepartmentSheet.tsx`: bottom `Sheet` (side `bottom`, `max-lg:portrait:rounded-t-xl` like `AddCustomItemSheet.tsx:40`) with `SheetTitle` **"Sposta in reparto"** and `SheetDescription` **"Scegli il reparto in cui vedere «{nome}». La scelta vale per sempre per questo ingrediente."** Body: vertically scrollable list (`max-h-[60vh] overflow-y-auto`) of 13 buttons, one per category in `PANTRY_CATEGORIES` order, each with swatch dot + name; the row's current department is highlighted (`bg-accent/10 text-accent` + check ✓). Tap on a department → `setOverride.mutate({ canonicalKey, departmentId })`, sheet closes immediately; the outcome toast comes from the mutation (§4.3). It is not a destructive action: **no ConfirmDialog**.
- Sheet state in `ShoppingListContent`: `const [moveTarget, setMoveTarget] = useState<DepartmentRow | null>(null)`.

#### `AddCustomItemSheet` — optional department select

- The free-text **"Sezione (opzionale)"** field stays unchanged (the per-recipe view needs it).
- Below it add a `<select>` **"Reparto (opzionale)"** with first option `"Automatico (dal nome)"` (value `''`) followed by the 13 categories. The native select needs explicit `bg-background text-foreground` (native elements gotcha, AGENTS.md). Helper text below: `"Usato nella vista per reparto."` (`text-xs text-muted-foreground`).
- Semantics: if the user picks a department, on confirmation an **override** `canonicalIngredientKey(name) → slug` is written with the same mutation as "Sposta in reparto" — no new field on `ShoppingItem`, the chain is reused (link 2) and the choice also applies to future weeks. Extended signature: `onAdd: (name: string, quantity: string, section?: string, departmentId?: string) => void`; in the page the wrapper calls `addCustomItem(name, quantity, section)` and, if `departmentId`, `setOverride.mutate({ canonicalKey: canonicalIngredientKey(name), departmentId })`.

#### Page wiring (`lista-spesa/page.tsx`)

```ts
const { user } = useAuth();                       // new import
const { items, checkedIds, adHocRecipes, ... } = useShoppingList(weekStartDate);
const { items: pantryItems } = usePantry();       // ['pantryItems', uid], enabled: !!user (already in the hook)
const { overrides, setOverride } = useDepartmentOverrides();

const [viewMode, setViewMode] = useState<'reparto' | 'ricetta'>('reparto');
// useEffect: on mount (and on uid change) reads localStorage `shopping_list_view:${uid}`;
// handleSetViewMode writes state + localStorage.

const departmentSections = useMemo(
  () => buildDepartmentSections(items, checkedIds, adHocRecipes, pantryItems, overrides),
  [items, checkedIds, adHocRecipes, pantryItems, overrides]
);
```

`ShoppingListContent` additionally receives: `viewMode`, `onViewModeChange`, `departmentSections`, `onMoveToDepartment: (canonicalKey, departmentId) => void`. In the `viewMode === 'reparto'` branch it renders the `DepartmentSection`s instead of sections+groups; the "Aggiungi articolo" button and `AddCustomItemSheet` stay shared between the two views.

Page header copy note: the current subtitle "Ingredienti aggregati dal piano pasti settimanale." stays unchanged.

### 4.6 Edge cases and errors

1. **Item matched in the pantry (link 1)**: classified by the entry's `categoryId`; "Sposta" action hidden (`source === 'pantry'`), because the override would lose on precedence. The footnote does not change.
2. **Pantry entry with unknown `categoryId`** (historical documents): link 1 does **not** classify (`KNOWN_DEPARTMENT_IDS` guard), the chain continues to override/dictionary/`altro`. Never propagate an unknown slug to the UI.
3. **Override pointing to a no-longer-valid slug** (defensive, slugs are constants): ignored, chain continues.
4. **Stem collisions** `pesca/pesce` and `grana/grano`: resolved in the seed (§4.2) in favor of `pesce`/`latticini`; the collision test prevents reintroducing the lost entry. The user recovers with their own override (e.g. `pesc → frutta` if they buy more peaches than sea bass — it applies to both words, a known and accepted limit of the stemmer).
5. **Same ingredient in the plan and in an ad-hoc group**: two distinct rows in the same department (no cross-block merge, invariant inherited from AGENTS.md §9); `rowKey` stays unique (`item.id` vs `groupId:itemId`).
6. **Ids and check marks**: ids don't change on any path ⇒ `shoppingCheckedIds` and `AdHocShoppingItem.checked` work identically in both views; no migration, no lost check marks.
7. **Empty departments**: not rendered (filter in `buildDepartmentSections`). A non-empty list always has at least one section (`altro` collects everything else).
8. **Empty list / no plan**: the existing empty states (`ShoppingListContent.tsx:52-80`) early-return before the toggle — no toggle on an empty list.
9. **localStorage `viewMode`**: SSR always renders `'reparto'`; the saved value is applied in a post-mount `useEffect` (no hydration mismatch); corrupted values → default.
10. **"Azzera spunti"**: unchanged (it only clears the plan's `checkedIdsList`, not the ad-hoc ones — pre-existing behavior, the same in both views).
11. **Custom item without quantity**: `quantity === ''` → `ShoppingItemRow` does not render the span (already handled, line 54).
12. **`ingredientDepartmentOverrides` field missing on the user doc**: `?? {}` in `getDepartmentOverrides`; on the first write `updateDoc` creates the field (the `users/{uid}` doc always exists, guaranteed by `ensureUserProfileDocument`, `user-profile.ts:31-42`).
13. **Override write error**: error toast, no optimistic change (classification recomputes only on a successful invalidation). No localStorage fallback: the override is cross-device by nature, like the ad-hoc groups (`shopping-adhoc.ts`, same reasoning).
14. **Stale pantry data (staleTime 2min)**: an item just added to the pantry may be classified via the dictionary for up to 2 minutes — acceptable degradation, it resolves itself on refetch (no `onSnapshot`).
15. **Ad-hoc group removal**: available only in the per-recipe view (with `ConfirmDialog`, unchanged); in the department view you remove single items. If you need to remove the group, switch to the recipe view — documented trade-off, it avoids a destructive group action without its visual context.

## 5. Phased implementation plan

Each phase leaves the project compilable (`npx tsc --noEmit`).

**Phase 1 — Extended taxonomy + pantry**
- `src/lib/utils/pantry-utils.ts`: +3 entries in `PANTRY_CATEGORIES` (§4.1a).
- `src/app/(dashboard)/dispensa/page.tsx`: remap unknown slugs → `'altro'` in the `itemsByCategory` memo, remove the fallback IIFE (§4.1a).

**Phase 2 — Matching module (Spec D brought forward, only if missing)**
- `src/lib/utils/ingredient-matching.ts`: `canonicalIngredientKey` + `singularizeWord` (moved), `matchIngredientToPantry` exact/alias tiers (§4.0).
- `src/types/pantry.ts`: `aliases?: string[]` on `PantryItem`.
- `src/lib/utils/ingredient-aggregator.ts`: imports the key from the new module, deletes the private copies. The existing `ingredient-aggregator.test.ts` suite must pass unchanged.
- `src/lib/utils/ingredient-matching.test.ts`: matcher tests (exact, alias, no-match).

**Phase 3 — Dictionary and classification**
- `src/lib/utils/ingredient-departments.ts`: full seed, `DEPARTMENT_BY_KEY`, `classifyIngredientDepartment` (§4.2).
- `src/lib/utils/ingredient-departments.test.ts` (§6).

**Phase 4 — Override persistence**
- `src/types/index.ts`: `ingredientDepartmentOverrides` field on `User` (§4.1b).
- `src/lib/firebase/department-overrides.ts` (§4.3).
- `src/lib/hooks/useDepartmentOverrides.ts` (§4.3).

**Phase 5 — View model**
- `src/lib/utils/shopping-departments.ts`: `DAY_LABELS`, `buildDepartmentSections` (§4.4).
- `src/components/shopping-list/ShoppingSection.tsx`: imports the shared `DAY_LABELS`.
- `src/lib/utils/shopping-departments.test.ts` (§6).

**Phase 6 — UI**
- `src/components/shopping-list/ShoppingViewToggle.tsx` (new).
- `src/components/shopping-list/DepartmentSection.tsx` (new).
- `src/components/shopping-list/MoveToDepartmentSheet.tsx` (new).
- `src/components/shopping-list/ShoppingItemRow.tsx`: `onMove?` prop.
- `src/components/shopping-list/AddCustomItemSheet.tsx`: "Reparto (opzionale)" select, extended `onAdd` signature.
- `src/components/shopping-list/ShoppingListContent.tsx`: toggle, view branch, `moveTarget`, new props.
- `src/app/(dashboard)/lista-spesa/page.tsx`: `useAuth`/`usePantry`/`useDepartmentOverrides`, `viewMode` + localStorage, sections `useMemo`, wiring (§4.5).

**Phase 7 — Final verification and documentation**
- `npx next build --webpack` (outside the sandbox on `spawn EPERM`), `npm test`.
- CLAUDE.md (Recent Changes), AGENTS.md (any gotchas that emerged), checklist in `specs/00-roadmap.md`.

## 6. Test plan

### Unit tests (Jest — `npm test`; existing pattern in `src/lib/utils/ingredient-aggregator.test.ts`)

**`ingredient-matching.test.ts`** (if Phase 2 was run):
- `canonicalIngredientKey`: accents ("caffè" → "caff"), regular plurals ("pomodori" ≡ "pomodoro"), velars ("funghi" ≡ "fungo"), multi-word keys don't collapse ("pomodori pelati" ≠ "pomodori").
- `matchIngredientToPantry`: exact on canonical key; alias via `item.aliases`; no-match → `{ item: null, suggestions: [] }`.
- Regression: the `ingredient-aggregator.test.ts` suite passes unchanged after the move.

**`ingredient-departments.test.ts`**:
- *Seed key hygiene* — for every key in `RAW_INGREDIENT_DEPARTMENTS`: `k === k.toLowerCase()`, `k === k.trim().replace(/\s+/g, ' ')`, no diacritics (`k.normalize('NFD')` does not match `/[\u0300-\u036f]/`).
- *No collisions* — no pair of raw keys with the same `canonicalIngredientKey` and a **different** department (-cia/-ce pairs with the same department are legitimate). This test is the guardrail for the documented collisions (pesca/pesce, grana/grano).
- *Valid values* — every value is a slug present in `PANTRY_CATEGORIES`.
- *Stem lookup* — `classify('Pomodori')` → `verdura`; `classify('pomodori pelati')` → `condimenti`; `classify('Funghi')` → `verdura`; `classify('fiocchi d'avena')` → `cereali`; `classify('pesche')` → `pesce` (documented collision, asserted as known behavior); `classify('ingrediente inventato')` → `altro`/`fallback`.
- *Precedence chain* — with a matched pantry entry (`categoryId: 'spezie'`) the pantry wins even if override and dictionary say otherwise; without a match the override wins over the dictionary; an override with an unknown slug is ignored; a pantry entry with an unknown `categoryId` does not classify (falls through to link 2).

**`shopping-departments.test.ts`**:
- Section order = `PANTRY_CATEGORIES` order; empty departments omitted; rows alphabetical (`localeCompare 'it'`).
- Plan/custom/ad-hoc items end up in the right department with correct `kind`, `checked` and footnote (plan = "Ricetta (Lun)", custom = "Aggiunto manualmente", ad-hoc = recipe title).
- Unique `rowKey`s with the same ingredient in the plan and in two ad-hoc groups.
- `source === 'pantry'` for items matched in the pantry (basis for hiding "Sposta").
- Row `id`s match the original ids (check-mark invariant).

### Guided test (Playwright + emulators — protocol in CLAUDE.md "Guided testing tooling")

Throwaway script in `e2e/scratch/` (gitignored, deleted at the end of the guided test). Setup: `npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev`; seed via Admin SDK against the emulator (user, recipes with spy ingredients, current week's `meal_plans`, a couple of `pantry_items`, one ad-hoc group). Phases:
1. **Default view**: open `/lista-spesa` → "Per reparto" view active; sections in the expected order; dictionary spy ingredient in the right department; made-up ingredient in "Altro"; recipe/day footnotes present; ad-hoc item in its department with the recipe title as footnote.
2. **Pantry precedence**: ingredient present in `pantry_items` with `categoryId: 'spezie'` → appears in "Spezie" and the row has no "Sposta" button.
3. **Override**: "Sposta in reparto…" on a dictionary item → choose another department → assert on Firestore (emulator) that `users/{uid}.ingredientDepartmentOverrides` contains `{stem: slug}`; the item changes section after invalidation; reload → the choice persists.
4. **Cross-view check marks**: check 2 items in the department view → switch to "Per ricetta" → the same ones show as checked (also assert on `meal_plans.shoppingCheckedIds` after the flush); identical progress bar in both views.
5. **Toggle persistence**: select "Per ricetta", reload → the view stays "Per ricetta" (localStorage).
6. **Custom item with department**: "Aggiungi articolo" with an explicit department → appears in the chosen department and the override is written to Firestore.
7. **Pantry**: the `/dispensa` page shows the new categories in the form and no duplicate "Altro" section.

## 7. Gotchas and constraints (relevant, from AGENTS.md/CLAUDE.md)

- **Never `undefined` in Firestore** (AGENTS.md Quick Ref "Firebase optional"): `ingredientDepartmentOverrides` is always written as a complete map; `aliases` is optional and never written here.
- **`enabled: !!user`** on every auth-bound query (AGENTS.md §3): applies to `['departmentOverrides', uid]`; `usePantry` already does it (`usePantry.ts:19-24`).
- **No `onSnapshot`** (CLAUDE.md React Query): overrides are a query invalidated by the mutation, not a listener.
- **New persistence target → its own debounce + registration in `flushAll`** (AGENTS.md row "New persistence target forgotten in the flush"): **deliberately avoided** here — the override uses a direct `updateDoc` write without debounce (rare, deliberate action), so it does not enter `flushAll()` in `useShoppingList.ts:346-349`. If it ever becomes debounced, it must be registered there.
- **`ConfirmDialog` for destructive actions, never native `confirm()`** (AGENTS.md Quick Ref): "Sposta in reparto" is not destructive → no dialog; ad-hoc group removal keeps its `ConfirmDialog` (recipe view, unchanged). Feedback via `react-hot-toast` (global style in `providers.tsx`).
- **Semantic tokens, never `bg-white`** (AGENTS.md §6): toggle, sections and sheet use `bg-background/bg-muted/text-foreground/…`; the department's native `<select>` needs explicit `bg-background text-foreground` ("Native HTML elements without `bg`").
- **Controls never `group-hover` only below `lg`** (AGENTS.md Quick Ref): the "Sposta" button is always visible, with `aria-label`.
- **Side-stripe ban** (AGENTS.md Quick Ref): the department color is a dot badge, never a colored `border-l-2+`.
- **Collapsible with `grid-template-rows`, never `max-height`** (AGENTS.md Quick Ref): `DepartmentSection` replicates the `ShoppingSection.tsx:73-77` pattern.
- **User Profile Extensions** (AGENTS.md §2): overrides live on `users/{uid}` — no new collection, rule or index.
- **Orphan slots / aggregation**: `buildContributions` and `aggregateIngredients` **are not touched**; unchanged item ids ⇒ no orphaning of `shoppingCheckedIds` (risk documented in the map: changing `canonicalIngredientKey`/`toSlug` would orphan the check marks — that's why the function is **moved** without changing its behavior).
- **Shopping list = cached derived view** (AGENTS.md Quick Ref "Stale shopping list after a plan change"): the override mutation invalidates only `['departmentOverrides']` — enough because classification is a downstream `useMemo`; don't touch `invalidateShoppingList`.
- **`'__null__'` sentinel** (`useShoppingList.ts:396`, `ShoppingListContent.tsx:30`): stays confined to the per-recipe view; the department view doesn't use it (departments are real slugs).
- **Sheet accessibility** (AGENTS.md §6): `SheetDescription` mandatory in the new sheets.
- **Non-reactive `useState(prop)`** (AGENTS.md Quick Ref): `MoveToDepartmentSheet` receives the target via prop on every open — derive content from props, don't copy them into state.
- **Structured outputs / numeric constraints in JSON schemas**: not relevant — this spec doesn't touch AI endpoints.
- **Build**: validate with `npx tsc --noEmit` + `npx next build --webpack` (`next lint` no longer exists in Next 16); `spawn EPERM` in the sandbox → rerun outside the sandbox.

## 8. Out of scope

- Spec D's full engine: persistent user-confirmed aliases, fuzzy suggestions, `isTrivialIngredient` (trivial ingredients), "Hai già in casa" section, "in dispensa: 500 g" badge, batch check→pantry, export of `parseQuantity`. Only the §4.0 subset is brought forward here.
- Cross-block plan ↔ ad-hoc merge (stays a deliberate non-feature).
- Changes to `canonicalIngredientKey`/`toSlug`/stemmer (invariants for check marks).
- Department visible or editable in the pantry beyond what already exists (the pantry category IS the department).
- UI to remove/manage existing overrides (you fix by moving again; a management page is possible future work).
- Custom department ordering per the user's supermarket.
- Any AI endpoint: classification is entirely local and free.
- Kcal in the shopping list (confirmed exclusion, CLAUDE.md).

## 9. Implementation prompt

```markdown
Implement Spec E (shopping list by department) of the "Il Mio Ricettario" project.

1. Read and apply: CLAUDE.md, AGENTS.md, COMMENTS.md and DEVELOPMENT_GUIDELINES.md (repo root).
2. Read IN FULL specs/00-roadmap.md (binding shared contract, in particular cross-spec contracts 2 and 3) and specs/spec-e-lista-spesa-reparti.md (this spec): implement it faithfully, without reopening the product decisions.
3. Check whether src/lib/utils/ingredient-matching.ts already exists (Spec D implemented): if so use its exports and skip Phase 2 of the spec; if not bring forward the minimal subset described in §4.0.
4. Create the branch feature/shopping-departments from develop.
5. Implement phase by phase (§5, Phases 1→7). After EVERY phase run `npx tsc --noEmit` and fix before moving on.
6. Run the tests with `npm test` (actual command verified in package.json: "test": "jest"); the existing ingredient-aggregator.test.ts suite must pass UNCHANGED after moving canonicalIngredientKey.
7. When done: `npx next build --webpack`; if it fails with `spawn EPERM` in the sandbox, rerun it outside the sandbox before investigating the code.
8. Update: CLAUDE.md ("Recent Changes" section, new dated entry), AGENTS.md (only if new gotchas emerge from real debugging), and the status checklist in specs/00-roadmap.md (tick Spec E).
9. NEVER commit without the user's explicit OK (session rule: one branch/commit per session).
10. At the end propose a phase-by-phase guided test following the "Guided testing tooling" protocol in CLAUDE.md, with a throwaway script in e2e/scratch/ (Firebase emulators + Playwright), following the 7 phases of the spec's §6: declaring for each phase the expected outcome before running it.
```

## 10. Recommended model and effort

Sonnet · effort high — mechanical once Spec D is implemented; the value lies in the curated dictionary and the view toggle UI.

Rationale: the logic (precedence chain, pure view model, toggle) is well bounded and fully specified above; the residual risk is editorial (seed quality) and UI polish, not algorithmic.
