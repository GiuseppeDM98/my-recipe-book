# SPEC — Ricette multi-categoria & "Voglio preparare questo"

> **Status**: Specifica pronta per implementazione · **Autore spec**: Opus 4.8 · **Esecuzione prevista**: Sonnet 5 · **Data**: 2026-07-02
>
> Documento eseguibile. Ogni sezione elenca file reali, firme, comportamento ed edge case. Leggere prima `AGENTS.md` e `CLAUDE.md`.

---

## Obiettivo

Implementare due funzionalità indipendenti:

- **Feature A — Multi-categoria**: una ricetta può appartenere a **più categorie** (oggi è single-select con categoria + sottocategoria).
- **Feature B — "Voglio preparare questo"**: un bottone sul dettaglio ricetta aggiunge i **soli** ingredienti di quella ricetta a una **sezione ad-hoc** della lista della spesa.

Le due feature toccano `src/types/index.ts` ma per il resto sono indipendenti e possono essere implementate/committate separatamente.

---

## Decisioni di design (confermate col committente)

1. **Sezione ad-hoc → globale su `users/{uid}`** (come `familyProfile`), NON legata alla settimana. Nessuna dipendenza dall'esistenza di un `meal_plan`; sync cross-device gratuito grazie alle regole owner-based già presenti.
2. **Raggruppamento ad-hoc → una sezione per ricetta** (titolo sezione = titolo ricetta), rimovibile in blocco.
3. **Sottocategoria → rimossa** dal flusso ricette. Il committente non ha mai usato le sottocategorie: **nessuna retrocompat richiesta** per esse. La retrocompat serve invece per `categoryId` → `categoryIds` (le ricette esistenti hanno `categoryId`).

**Pattern di riferimento nel codebase**: la migrazione già fatta `season` → `seasons[]` su `Recipe` (dual-read + migrazione lazy on-edit). Sia la Feature A sia il campo `categoryId → categoryIds[]` seguono **esattamente** questo schema.

---

## Vincoli trasversali (da AGENTS.md — rispettare sempre)

- **Firestore mai `undefined`**: usare `null`, omettere la chiave con spread condizionale, o `deleteField()` per rimuovere un campo.
- **React Query auth-bound**: ogni query con `enabled: !!user`; niente `onSnapshot`.
- **Invalidare le query** dopo ogni write che impatta una lista su un'altra pagina.
- **Token colore**: mai `bg-white` né scale numeriche OKLCH (`bg-primary-100`); usare `bg-primary/10`, `text-accent`, ecc. Stati di completamento/spunta → `accent`.
- **Conferme distruttive** → `ConfirmDialog` (`components/ui/confirm-dialog.tsx`); feedback → `react-hot-toast` (stile in `src/components/providers.tsx`). Mai `confirm()`/`alert()`.
- **Touch**: non nascondere controlli dietro `group-hover` soltanto (invisibili su mobile); rivelare solo da `lg`, tenerli visibili sotto.
- **Checkbox native**: sempre `accent-primary`; se la riga è già `role="button"`, checkbox `tabIndex={-1}`.
- **Contenuto dentro `shell-panel`** → wrappare in `relative z-10`.
- **Validazione**: `npx tsc --noEmit` + `npx next build --webpack` (in Next 16 **non** esiste `next lint`). Se la build dà `spawn EPERM` in sandbox, rilanciare fuori sandbox.

---

# FEATURE A — Ricette multi-categoria

## A1. Modello dati — `src/types/index.ts`

Nel tipo `Recipe` (attuale ~righe 146-197):

```ts
export interface Recipe {
  // ...
  categoryId?: string;        // @deprecated — mantenuto solo per lettura retrocompat delle ricette pre-migrazione
  categoryIds?: string[];     // NUOVO — categorie multiple; empty/undefined = nessuna categoria
  // subcategoryId?: string;  // RIMUOVERE
  // ...
}
```

- Aggiungere `categoryIds?: string[]`.
- Marcare `categoryId?: string` con JSDoc `@deprecated` (stessa formula usata per `season` vs `seasons`).
- **Rimuovere** `subcategoryId?: string`.

Nel tipo `AISuggestion` (~righe 308-312):

```ts
export interface AISuggestion {
  categoryNames: string[];   // era: categoryName: string  → ora 1-3 nomi
  season: Season;
  // isNewCategory: rimuovere — createCategoryIfNotExists è già idempotente per nome
}
```

> **Nota su `subcategories`**: la collection `subcategories`, la sua gestione in `categorie/page.tsx` e le funzioni in `src/lib/firebase/categories.ts` **NON** vengono toccate da questa feature — restano funzionanti ma scollegate dalle ricette. Rimozione completa = *cleanup opzionale futuro*, fuori scope.

## A2. Helper condiviso (nuovo) — `src/lib/utils/recipe-categories.ts`

```ts
import type { Recipe } from '@/types';

/**
 * Dual-read categoria: preferisce categoryIds[]; fallback al legacy categoryId
 * per ricette pre-migrazione. Da usare OVUNQUE si legga la categoria di una ricetta.
 */
export function getRecipeCategoryIds(
  recipe: Pick<Recipe, 'categoryIds' | 'categoryId'>,
): string[] {
  if (recipe.categoryIds?.length) return recipe.categoryIds;
  return recipe.categoryId ? [recipe.categoryId] : [];
}
```

Sostituire **ogni** lettura diretta di `recipe.categoryId` con questo helper (elenco puntuale nelle sezioni seguenti).

## A3. Selettore — `src/components/recipe/category-selector.tsx`

- Convertire da `<select>` singolo a cascata → **multi-select** (chip/toggle a selezione multipla) delle **sole categorie**. Rimuovere completamente la parte sottocategoria.
- Nuove props:
  ```ts
  interface CategorySelectorProps {
    selectedCategoryIds: string[];
    onChange: (ids: string[]) => void;
  }
  ```
  Rimuovere `selectedCategoryId`, `selectedSubcategoryId`, `onCategoryChange`, `onSubcategoryChange`.
- Stile: chip in tinta `bg-primary/10 text-primary` per i selezionati, `bg-secondary` per i non selezionati; area touch ≥44px; `aria-pressed={selected}`; niente colori raw.
- Toggle: cliccando una categoria si aggiunge/rimuove dall'array.

## A4. Form — `src/components/recipe/recipe-form.tsx`

- Stato (attuale ~67-68): sostituire `categoryId`/`subcategoryId` con
  ```ts
  const [categoryIds, setCategoryIds] = useState<string[]>(
    getRecipeCategoryIds(recipe ?? {}),
  );
  ```
- Render (~482-487): `<CategorySelector selectedCategoryIds={categoryIds} onChange={setCategoryIds} />`.
- Salvataggio (~423-424):
  - Scrivere `categoryIds` (array, anche vuoto).
  - In **modifica**, azzerare il legacy per evitare drift: `categoryId: deleteField()` (import `deleteField` da `firebase/firestore`).
  - **Non** scrivere mai `subcategoryId`.
  - Attenzione al vincolo no-`undefined`: `categoryIds` deve essere sempre un array; `deleteField()` è il modo corretto per rimuovere `categoryId`.

## A5. Card — `src/components/recipe/recipe-card.tsx`

- Attuale ~20-21: sostituire il singolo `.find()` con:
  ```ts
  const recipeCategories = getRecipeCategoryIds(recipe)
    .map(id => categories.find(c => c.id === id))
    .filter((c): c is Category => Boolean(c));
  ```
- Attuale ~65-81: render **badge multipli**, ognuno colorato dal proprio `category.color` (usare opacity modifier / stile inline sul colore salvato, non scale numeriche OKLCH). **Cap a 2 badge** visibili + badge `+N` se più (evita overflow su mobile).
- Rimuovere il badge sottocategoria.
- Rispettare il ban side-stripe: badge angolari, non bordo sinistro colorato.

## A6. Lista + filtri + conteggi — `src/app/(dashboard)/ricette/page.tsx`

- **Filtro categoria**: resta **single-select** (`selectedCategoryId`). Match (~82-88):
  ```ts
  filtered.filter(recipe => getRecipeCategoryIds(recipe).includes(selectedCategoryId))
  ```
- **Rimuovere** l'intero ramo sottocategoria: stato `selectedSubcategoryId`, `recipesForSubcategoryFilter` (~109-112), `recipeCountBySubcategoryId` (~139-145) e la relativa UI di filtro.
- **Conteggi** `recipeCountByCategoryId` (~131-137): per ogni ricetta incrementare **ogni** id restituito da `getRecipeCategoryIds(recipe)` (una ricetta con 2 categorie conta in entrambe).
- **Gotcha AGENTS #59** (preservare): calcolare i conteggi categoria sul subset **post-stagione** (`recipesForCategoryFilter`), non su `recipes` full, così il cambio stagione aggiorna i conteggi.

## A7. AI suggest-category — `src/app/api/suggest-category/route.ts`

- Prompt `createCategorizationPrompt` (~35-78): chiedere a Claude un **array di 1-3 nomi categoria** invece di uno singolo (spiegare che una ricetta può appartenere a più categorie, es. "Primi" + "Vegetariano"). Modello invariato: `claude-sonnet-4-6`.
- Response shape (~152-159): restituire `categoryNames: string[]` al posto di `categoryName`; rimuovere `isNewCategory` (superfluo — `createCategoryIfNotExists` è già idempotente per nome).
- **Consumatori** — permettere selezione multipla e salvataggio iterando `createCategoryIfNotExists` per nome → raccogliere `string[]` di ID → scrivere `categoryIds`:
  - `src/components/recipe/extracted-recipe-preview.tsx`: `selectedCategory` singolo → `selectedCategories: string[]`; input testo → multi-chip; firma callback `onSave(recipe, categoryNames, seasons)`.
  - `src/app/(dashboard)/assistente-ai/page.tsx` `handleSaveRecipe` (~347-395):
    ```ts
    const categoryIds = (
      await Promise.all(categoryNames.map(n => createCategoryIfNotExists(userId, n)))
    ).filter(Boolean);
    // ...spread condizionale: ...(categoryIds.length ? { categoryIds } : {})
    ```
  - `src/components/meal-planner/NewRecipeReviewCard.tsx` (~45): `selectedCategory` singolo → array.

## A8. Meal planner (matching) — usare `getRecipeCategoryIds` + `.some()`/`.includes()`

- `src/lib/utils/meal-plan-shuffle.ts`:
  - `inCategory` (~91): `getRecipeCategoryIds(recipe).includes(categoryId)`.
  - `buildCandidatePool` (~126-135): esclusione = `getRecipeCategoryIds(r).some(id => excluded.has(id))`; preferenza = `getRecipeCategoryIds(r).includes(preferredId)`.
- `src/lib/hooks/useMealPlanner.ts` (~306): il reshuffle "stessa categoria" diventa "condivide almeno una categoria" — passare `getRecipeCategoryIds(currentRecipe)`; la logica di `pickReshuffledRecipe` deve matchare se c'è intersezione di categorie.
- `src/components/meal-planner/RecipePickerSheet.tsx`: filtro (~89) `!getRecipeCategoryIds(recipe).includes(categoryFilter)`; badge (~199) → multi (stesso trattamento della card).
- `src/lib/utils/meal-plan-shuffle.test.ts`: aggiornare le fixture da `categoryId: '...'` a `categoryIds: ['...']` e le asserzioni corrispondenti.

## A9. Firestore

Nessun cambiamento a `firebase/firestore.indexes.json` né a `firebase/firestore.rules`: il filtraggio categoria delle ricette è **tutto client-side** (non esiste alcuna query `where('categoryId', ...)` sulle ricette). Un indice `array-contains` servirebbe solo se in futuro si introducessero query server-side per categoria — **fuori scope**.

## A10. Non-goal Feature A

- Nessuna migrazione batch delle ricette esistenti: `getRecipeCategoryIds` legge il legacy `categoryId` finché la ricetta non viene modificata.
- Nessuna rimozione della collection/gestione `subcategories` (cleanup futuro).
- Il filtro lista resta a categoria singola (non multi-filtro AND/OR): scelta minimale.

---

# FEATURE B — "Voglio preparare questo"

## B1. Modello dati globale — `src/types/index.ts`

Nuovi tipi:

```ts
export interface AdHocShoppingItem {
  id: string;          // crypto.randomUUID()
  name: string;
  quantity: string;    // copiata as-is da Ingredient.quantity
  checked: boolean;
}

export interface AdHocShoppingRecipe {
  id: string;               // crypto.randomUUID()
  recipeId: string | null;  // ricetta sorgente; null se poi eliminata
  recipeTitle: string;      // denormalizzato per il titolo sezione
  addedAt: number;          // Date.now() — evitare Timestamp annidati dentro array Firestore
  items: AdHocShoppingItem[];
}
```

Sul tipo `User` (~26-34): aggiungere
```ts
adHocShoppingRecipes?: AdHocShoppingRecipe[] | null;
```
Salvato in `users/{uid}` (come `familyProfile`). Nessuna nuova collection, nessuna rule nuova.

> **Perché denormalizzare name/quantity**: la sezione ad-hoc deve restare valida anche se la ricetta sorgente viene poi eliminata; per questo si copiano i valori invece di referenziare la ricetta a runtime.

## B2. Write path (dal dettaglio ricetta) — nuovo `src/lib/firebase/shopping-adhoc.ts`

```ts
export type AddAdHocResult = 'added' | 'updated';

/** Legge users/{uid}, costruisce un AdHocShoppingRecipe dagli ingredienti e lo appende.
 *  Dedup: se esiste già un gruppo con lo stesso recipeId lo SOSTITUISCE (refresh) → 'updated'. */
export async function addRecipeToAdHocShoppingList(
  userId: string,
  recipe: Recipe,
): Promise<AddAdHocResult>;

/** Write completo dell'array (usato da toggle/remove nel hook lista spesa). */
export async function updateAdHocShoppingList(
  userId: string,
  recipes: AdHocShoppingRecipe[],
): Promise<void>;

/** Read del campo con fallback []. */
export async function getAdHocShoppingList(userId: string): Promise<AdHocShoppingRecipe[]>;
```

Dettagli:
- `addRecipeToAdHocShoppingList` costruisce gli `items` da `recipe.ingredients` mappando `{ id: crypto.randomUUID(), name, quantity, checked: false }`.
- **Dedup** su `recipeId`: se presente, sostituire il gruppo esistente (refresh degli ingredienti) e restituire `'updated'`; altrimenti append e restituire `'added'`.
- Vincolo Firestore: mai `undefined`; `recipeId` → `null` se `recipe.id` mancante (non dovrebbe accadere dal dettaglio, ma difensivo).

## B3. React Query

- Nuova query key: `['adHocShopping', uid]`. `enabled: !!user`.
- Mutation hook (nuovo) `src/lib/hooks/useAddToAdHocShoppingList.ts`:
  - `mutationFn` → `addRecipeToAdHocShoppingList(user.uid, recipe)`.
  - `onSuccess` → `queryClient.invalidateQueries({ queryKey: ['adHocShopping', user.uid] })` **e** invalidare anche `['shoppingList', user.uid]` (partial match) così la lista spesa aperta si aggiorna; toast success (`'added'` → "Ingredienti aggiunti alla lista della spesa"; `'updated'` → "Lista della spesa aggiornata").
- **Aggiornare la tabella query keys in `AGENTS.md`** aggiungendo `['adHocShopping', uid]`.

## B4. Bottone "Voglio preparare questo" — dettaglio ricetta

- Collocazione: `src/components/recipe/recipe-detail.tsx`, vicino alle azioni principali (Modifica / Cuoci).
- Icona lucide `ShoppingBasket` (o `ShoppingCart`), copy IT **"Voglio preparare questo"**. CTA in tinta col design system (token, non colori raw).
- On click → `useAddToAdHocShoppingList().mutate(recipe)`; durante la mutation `disabled` + spinner.
- **Edge**: se `recipe.ingredients.length === 0`, disabilitare il bottone (o toast "Nessun ingrediente da aggiungere") — non creare un gruppo vuoto.
- `enabled: !!user`.

## B5. Integrazione lista spesa — `src/lib/hooks/useShoppingList.ts`

- Il hook deve **anche** leggere la lista ad-hoc globale (query `['adHocShopping', uid]`) e restituirla separata dagli item derivati dal piano. Nuove entry nel return:
  ```ts
  adHocRecipes: AdHocShoppingRecipe[];
  toggleAdHocItem(recipeId: string, itemId: string): void;
  removeAdHocRecipe(recipeId: string): void;
  removeAdHocItem(recipeId: string, itemId: string): void;
  ```
- **Stato locale + persistenza debounced** verso `users/{uid}` via `updateAdHocShoppingList`, con lo **stesso pattern flush-non-perso** già usato per lo stato spunte del piano (vedi gotcha AGENTS "Shopping list debounce non-flushed"):
  - flush su `unmount`, `visibilitychange(hidden)`, `pagehide`;
  - leggere da un `latestStateRef` (no stale closure);
  - azzerare il ref del timer al flush.
  - Questa è una **seconda** destinazione di persistenza (user doc), **separata** dal write su `meal_plan` per gli item del piano/custom. Tenerle indipendenti (due timer/ref distinti).
- **Checked state**: lo stato spunta degli item ad-hoc vive in `AdHocShoppingItem.checked` (globale). NON usare `shoppingCheckedIds` del piano (che è per-settimana) per gli ad-hoc.
- **Progress**: includere gli item ad-hoc nel conteggio totale/checked della `progress` restituita.

## B6. Rendering — `src/components/shopping-list/`

Le sezioni ad-hoc si mostrano **sotto** le sezioni derivate dal piano, come blocco separato (evita collisioni tra la `section` string del piano e il titolo ricetta).

- `ShoppingListContent.tsx`:
  - Empty state: mostrare "vai al pianificatore" **solo** se `!hasPlan && items.length === 0 && adHocRecipes.length === 0`. Se ci sono ricette ad-hoc, renderizzare il blocco ad-hoc anche senza piano.
  - Dopo le `sectionNames` del piano, iterare `adHocRecipes` → un `AdHocRecipeGroup` per ricetta.
- Nuovo `src/components/shopping-list/AdHocRecipeGroup.tsx`:
  - Header = `recipeTitle` + azione **"Rimuovi ricetta"** → `ConfirmDialog` (rimozione intero gruppo = distruttiva).
  - Righe item: riusare `ShoppingItemRow` (checkbox `accent-primary`, quantità, bottone rimuovi singolo `Trash2`); controlli **sempre visibili** su touch (non solo `group-hover`).
  - Se dentro un `shell-panel`, wrappare in `relative z-10`.
- `ShoppingItemRow.tsx`: renderlo capace di gestire item ad-hoc (checkbox + remove) senza rompere i casi piano/custom. Preferire props esplicite `onToggle` / `onRemove` piuttosto che ramificare su `isCustom`.

## B7. Edge case (documentati)

- **Ricetta senza ingredienti** → bottone disabilitato / toast; nessun gruppo vuoto (vedi B4).
- **Ricetta eliminata dopo l'aggiunta** → il gruppo ad-hoc resta valido (name/quantity già denormalizzati; `recipeId` può puntare a nulla).
- **Stesso ingrediente in ad-hoc e nel piano** → **nessun merge cross-blocco** (scelta esplicita, coerente con "i soli ingredienti della ricetta").
- **Quantità copiate as-is** dalla ricetta: nessuna scalatura per porzioni in questa iterazione (**non-goal**).
- **Ri-click "Voglio preparare"** sulla stessa ricetta → refresh del gruppo esistente, nessun duplicato (dedup su `recipeId`, vedi B2).

---

## File toccati (riepilogo)

### Feature A (multi-categoria)
- `src/types/index.ts` — `Recipe` (+`categoryIds`, `categoryId` deprecato, −`subcategoryId`); `AISuggestion` (`categoryNames`)
- `src/lib/utils/recipe-categories.ts` — **nuovo** helper `getRecipeCategoryIds`
- `src/components/recipe/category-selector.tsx` — multi-select, no subcategory
- `src/components/recipe/recipe-form.tsx`
- `src/components/recipe/recipe-card.tsx` — badge multipli
- `src/app/(dashboard)/ricette/page.tsx` — filtro/conteggi, rimozione subcategory
- `src/app/api/suggest-category/route.ts`
- `src/components/recipe/extracted-recipe-preview.tsx`
- `src/app/(dashboard)/assistente-ai/page.tsx`
- `src/components/meal-planner/NewRecipeReviewCard.tsx`
- `src/lib/utils/meal-plan-shuffle.ts` + `src/lib/utils/meal-plan-shuffle.test.ts`
- `src/lib/hooks/useMealPlanner.ts`
- `src/components/meal-planner/RecipePickerSheet.tsx`

### Feature B (voglio preparare questo)
- `src/types/index.ts` — `AdHocShoppingItem`, `AdHocShoppingRecipe`, `User.adHocShoppingRecipes`
- `src/lib/firebase/shopping-adhoc.ts` — **nuovo**
- `src/lib/hooks/useShoppingList.ts` — merge + toggle/remove ad-hoc, seconda persistenza debounced
- `src/lib/hooks/useAddToAdHocShoppingList.ts` — **nuovo**
- `src/components/recipe/recipe-detail.tsx` — bottone
- `src/components/shopping-list/ShoppingListContent.tsx` — blocco ad-hoc + empty state
- `src/components/shopping-list/AdHocRecipeGroup.tsx` — **nuovo**
- `src/components/shopping-list/ShoppingItemRow.tsx` — supporto item ad-hoc
- `AGENTS.md` — tabella query keys: aggiungere `['adHocShopping', uid]`

**Nessun cambiamento** a `firebase/firestore.indexes.json` / `firebase/firestore.rules` per entrambe le feature.

---

## Verifica

1. **Tipi**: `npx tsc --noEmit` pulito.
2. **Build**: `npx next build --webpack` (se `spawn EPERM` in sandbox → rilanciare fuori sandbox).
3. **Test**: `npm test` — aggiornare/verificare `meal-plan-shuffle.test.ts`.
4. **Manuale** (`npm run dev`):
   - *Multi-cat*: creare/modificare ricetta con 2+ categorie → card mostra badge multipli (cap 2 + `+N`); filtro per una categoria include la ricetta; conteggi corretti al cambio stagione; ricetta legacy (solo `categoryId`) ancora visibile e filtrabile; AI suggest propone 1-3 categorie e le salva tutte.
   - *Voglio preparare*: bottone su dettaglio ricetta → toast; aprire lista spesa (anche settimana **senza** piano) → sezione con titolo ricetta e ingredienti; spunta persiste dopo reload e su **altra settimana** (globale); "Rimuovi ricetta" chiede conferma; ri-click sulla stessa ricetta aggiorna il gruppo (nessun duplicato); ricetta senza ingredienti → bottone disabilitato.
