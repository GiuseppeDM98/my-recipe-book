# Spec A — Ordinamento canonico delle portate + spuntini nel piano

> Note coperte: 4 (ordinamento portate), 7 (spuntini) | Dipendenze: nessuna (Spec F consuma l'ordine canonico definito qui) | Branch: `feature/meal-order-snacks`

## 1. Obiettivo

Due cambiamenti visibili all'utente nel pianificatore settimanale:

1. **Ordine canonico delle portate.** Oggi l'ordine delle righe del calendario dipende dall'ordine di inserimento: un piano nato con «pranzo, cena» a cui si aggiunge la colazione mostra la colazione come **ultima** riga. Dopo questa spec le portate compaiono sempre nell'ordine della giornata (colazione → spuntino → pranzo → merenda → cena), ovunque: griglia calendario, chips di struttura, form di setup. I piani già salvati con ordine sbagliato si auto-correggono a render time, senza migrazione.
2. **Spuntini.** Due nuove portate pianificabili: **Spuntino** (metà mattina) e **Merenda** (pomeriggio). Selezionabili al setup, aggiungibili/rimovibili da un piano avviato via `PlanStructureCard`, riempibili con lo shuffle locale, con configurazione categorie per-portata come le altre.

## 2. Stato attuale

### 2.1 Tipi e costanti

`src/types/index.ts:386`:

```ts
export type MealType = 'colazione' | 'pranzo' | 'cena' | 'primo' | 'secondo' | 'contorno' | 'dolce';
```

`primo`/`secondo`/`contorno`/`dolce` sono valori legacy di un vecchio modello a portate-piatto: irraggiungibili dalla UI ma presenti in piani Firestore storici, quindi devono continuare a renderizzare (commento in `src/lib/constants/meal-types.ts:20-25`).

`src/lib/constants/meal-types.ts:26`:

```ts
export const SELECTABLE_MEAL_TYPES: MealType[] = ['colazione', 'pranzo', 'cena'];
```

`src/lib/constants/meal-types.ts:34-42` — `MEAL_LABELS: Record<MealType, string>` esaustivo (7 chiavi: le 3 selezionabili + 4 legacy). Il commento checklist alle righe 10-12 dice:

```
 * CHECKLIST: If you add a MealType value in types/index.ts, also update:
 * - MEAL_LABELS below (the Record is exhaustive, so TypeScript will flag it)
 * - SELECTABLE_MEAL_TYPES, but only if users are meant to plan it
```

`activeMealTypes: MealType[]` è persistito verbatim sul documento `meal_plans` (`src/types/index.ts:435`) e su `MealPlanSetupConfig` (`src/types/index.ts:528`): l'ordine dell'array È l'ordine di render.

### 2.2 Il bug di ordinamento (due scritture senza sort)

**Scrittura 1** — `addMealType` in `src/lib/hooks/useMealPlanner.ts:438`:

```ts
const nextActiveMealTypes = [...currentPlan.activeMealTypes, mealType];
```

Append puro, nessun sort. Contrasto con il percorso gemello dei giorni, `addDay` (`useMealPlanner.ts:413`), che invece ordina:

```ts
const nextActiveDays = [...currentActiveDays, dayIndex].sort((a, b) => a - b);
```

**Scrittura 2** — `toggleMealType` in `src/components/meal-planner/MealPlanSetupForm.tsx:75-83`:

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

Anche al setup, quindi: deselezionare «pranzo» e riselezionarlo produce `['cena','pranzo']`, che viene poi persistito così com'è da `generateShuffledPlan`/`createManualPlan` (`useMealPlanner.ts:145,153,164,228,239`).

### 2.3 Censimento dei punti che iterano `activeMealTypes` (verificato con grep)

Punti che **renderizzano in ordine di array** (tutti da correggere in lettura):

| # | File:linea | Cosa itera |
|---|-----------|------------|
| a | `src/components/meal-planner/WeeklyCalendarGrid.tsx:135` | righe portata della griglia desktop (`{activeMealTypes.map(mealType => (`) |
| b | `src/components/meal-planner/WeeklyCalendarGrid.tsx:194` | righe portata dentro le day-card mobile portrait |
| c | `src/components/meal-planner/PlanStructureCard.tsx:136` | chips «Portate del piano» attive |
| d | `src/components/meal-planner/MealPlanSetupForm.tsx:205` | card «Categorie per portata» al setup |

Punti che iterano `activeMealTypes` ma sono **insensibili all'ordine** (nessuna modifica):

- `src/lib/utils/meal-plan-shuffle.ts:46` — `buildShuffledSlots` cicla `config.activeMealTypes` solo per generare slot; gli slot non hanno semantica d'ordine (identità = coppia `(dayIndex, mealType)`).
- `src/lib/utils/ingredient-aggregator.ts` (`buildContributions`, riga 25 circa) — itera `plan.slots`, **non** `activeMealTypes`; la lista spesa raggruppa per ingrediente e non mostra la portata (`ShoppingSection.tsx:20-26` usa solo `recipeTitle` + giorno).
- `src/lib/utils/meal-plan-calories.ts` (`computeDayCalories`) — somma su `plan.slots`, ordine irrilevante.
- `MealPlanSetupForm.tsx:44,56,181,189,197,299` — validazioni/lookup (`includes`, `length`), non render ordinato.
- `PlanStructureCard.tsx:62,65` — `inactiveMealTypes` è derivato filtrando `SELECTABLE_MEAL_TYPES`, quindi le chips «aggiungi» sono **già** in ordine canonico e restano corrette da sole quando si estende la costante.
- `useMealPlanner.ts:205` (`copyPlanToWeek`), `:476,486,491` (`removeMealType`: `filter` preserva l'ordine relativo, ok).

Punti che usano `Record<MealType, …>` / `Partial<Record<MealType, …>>` (verificato con grep):

| File:linea | Tipo | Impatto |
|-----------|------|---------|
| `src/lib/constants/meal-types.ts:34` | `MEAL_LABELS: Record<MealType, string>` | **esaustivo** → TypeScript obbliga ad aggiungere le due nuove chiavi (è il meccanismo di sicurezza voluto) |
| `src/types/index.ts:534` | `courseCategoryMap?: Partial<Record<MealType, string>>` (`@deprecated`) | `Partial` → nessuna modifica |
| `src/types/index.ts:537` | `newRecipePerMeal?: Partial<Record<MealType, number>>` | `Partial` → nessuna modifica |
| `src/types/index.ts:545` e `src/lib/utils/meal-plan-shuffle.ts:23` | `mealTypeConfigs?: Partial<Record<MealType, MealTypeConfig>> \| null` | `Partial` → nessuna modifica; le nuove portate guadagnano gratis la config per-portata |
| `src/components/meal-planner/MealPlanSetupForm.tsx:41` | `useState<Partial<Record<MealType, MealTypeConfig>>>({})` | `Partial` → nessuna modifica |

Consumatori di `MEAL_LABELS` per lookup puntuale (funzionano da soli una volta estesa la Record): `pianificatore/page.tsx:221-222,234` (toast), `RecipePickerSheet.tsx:87` (titolo sheet), `NewRecipeReviewCard.tsx:70` (etichetta slot), `WeeklyCalendarGrid.tsx:144,200`, `PlanStructureCard.tsx:146-165,188,231`, `MealPlanSetupForm.tsx:185,221`.

### 2.4 Larghezza colonna etichette griglia

- Desktop: colonna etichette **88px** — `WeeklyCalendarGrid.tsx:121` e `:139`, `gridTemplateColumns: \`88px repeat(${activeDays.length}, minmax(150px, 1fr))\``, etichetta `text-xs font-medium` (`:143-145`).
- Mobile portrait: **72px** — `WeeklyCalendarGrid.tsx:199`, `className="text-xs text-muted-foreground w-[72px] shrink-0 pt-1"`.

«Colazione» (9 caratteri) è oggi l'etichetta più lunga e sta in entrambe le colonne a `text-xs`. «Spuntino» (8) e «Merenda» (7) sono più corte → nessuna modifica di layout necessaria. Verificare comunque a occhio in collaudo (fase 6).

### 2.5 Shuffle e portate senza ricette adatte

`buildShuffledSlots` (`meal-plan-shuffle.ts:39-69`) costruisce per ogni portata un pool candidato via `buildCandidatePool` (`:126-144`). **Il pool non è specifico della portata**: parte da tutte le ricette, toglie le categorie escluse, applica il filtro stagione (rilassato sotto `MIN_SEASONAL_POOL = 5`) e, se impostata, restringe alla categoria preferita. Quindi uno «spuntino» senza config dedicata viene riempito pescando dall'intero ricettario, come pranzo e cena. Solo un pool **vuoto** (nessuna ricetta, o tutte escluse) finisce in `unfilledMealTypes` (`:49-52`), già gestito con toast informativo in `pianificatore/page.tsx` (handler `onGenerate`, righe ~441-446: «Alcuni pasti sono rimasti vuoti: non avevi ricette adatte. Riempili a mano.»). Comportamento invariato e sufficiente: chi vuole spuntini sensati imposta la categoria preferita per-portata al setup (es. «Dolci» o «Merende»), il meccanismo esiste già.

### 2.6 Firestore

Nessuna regola valida i valori di `mealType`/`activeMealTypes` (`firebase/firestore.rules:62` matcha solo la collection `meal_plans`), nessun indice coinvolto. I nuovi valori sono semplici stringhe in campi esistenti: **zero migrazione**.

## 3. Decisioni di prodotto (dal roadmap, vincolanti)

Dal contratto cross-spec n. 1 di `specs/00-roadmap.md`:

1. `MealType` si estende con **`'spuntino'`** e **`'merenda'`**. Etichette: **«Spuntino»** (metà mattina) e **«Merenda»** (pomeriggio) — decisione di prodotto n. 8 del roadmap.
2. `SELECTABLE_MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']` — è anche **l'ordine canonico** della giornata.
3. Nuovo helper esportato da `src/lib/constants/meal-types.ts`: `sortMealTypes(types: MealType[]): MealType[]` — ordina per indice in `SELECTABLE_MEAL_TYPES`; i tipi legacy (`primo`, `secondo`, `contorno`, `dolce`) vanno **in coda in ordine stabile**.
4. `sortMealTypes` si applica **sia in scrittura** (`addMealType` in useMealPlanner, `toggleMealType` in MealPlanSetupForm) **sia in lettura** (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm), così i piani esistenti con ordine sbagliato si auto-correggono senza migrazione.
5. Spec F consumerà questo ordine canonico: non introdurre qui alcun concetto di persone/porzioni/varianti (fuori scope, sezione 8).

## 4. Design proposto

### 4.1 Modello dati

**`src/types/index.ts:386` — prima:**

```ts
export type MealType = 'colazione' | 'pranzo' | 'cena' | 'primo' | 'secondo' | 'contorno' | 'dolce';
```

**Dopo** (aggiornare anche il commento JSDoc alle righe 379-385 menzionando spuntino/merenda):

```ts
export type MealType =
  | 'colazione'
  | 'spuntino'   // metà mattina
  | 'pranzo'
  | 'merenda'    // pomeriggio
  | 'cena'
  | 'primo' | 'secondo' | 'contorno' | 'dolce'; // legacy course types, solo render di piani storici
```

Nessun altro tipo cambia: `MealSlot`, `MealPlan`, `MealPlanSetupConfig`, `MealTypeConfig`, `ShuffleConfig` restano identici (i `Partial<Record<MealType, …>>` assorbono i nuovi valori senza modifiche).

### 4.2 Costanti e helper — `src/lib/constants/meal-types.ts`

**Prima** (righe 26 e 34-42):

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

**Dopo:**

```ts
/**
 * Meal types a user can actually put in a plan, in day order.
 * QUESTO ARRAY È ANCHE L'ORDINE CANONICO delle portate nella giornata:
 * sortMealTypes() ordina per indice in questo array. Non riordinarlo
 * senza una decisione di prodotto.
 * (…conservare il blocco WHY A SUBSET esistente sui legacy…)
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
 * Ordina le portate nell'ordine canonico della giornata (l'indice in
 * SELECTABLE_MEAL_TYPES). I tipi legacy (primo/secondo/contorno/dolce),
 * assenti da SELECTABLE_MEAL_TYPES, vanno in coda mantenendo il loro
 * ordine relativo (Array.prototype.sort è stabile per spec ES2019+).
 *
 * Ritorna SEMPRE un nuovo array: gli input tipici sono state React o
 * campi del piano corrente, che non vanno mai mutati in place.
 *
 * Si usa in scrittura (addMealType, toggleMealType) E in lettura
 * (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm): la lettura
 * auto-corregge i piani Firestore salvati prima del fix, senza migrazione.
 */
export function sortMealTypes(types: MealType[]): MealType[] {
  return [...types].sort((a, b) => {
    const ia = SELECTABLE_MEAL_TYPES.indexOf(a);
    const ib = SELECTABLE_MEAL_TYPES.indexOf(b);
    if (ia === -1 && ib === -1) return 0; // entrambi legacy: ordine stabile
    if (ia === -1) return 1;              // solo a legacy: in coda
    if (ib === -1) return -1;             // solo b legacy: in coda
    return ia - ib;
  });
}
```

Aggiornare la checklist in testa al file (attuali righe 10-12): resta valida, aggiungere un terzo punto:

```
 * - sortMealTypes needs NO update: it derives its order from SELECTABLE_MEAL_TYPES
```

### 4.3 Scritture — applicare `sortMealTypes`

**(a) `src/lib/hooks/useMealPlanner.ts:438` — prima:**

```ts
const nextActiveMealTypes = [...currentPlan.activeMealTypes, mealType];
```

**Dopo:**

```ts
const nextActiveMealTypes = sortMealTypes([...currentPlan.activeMealTypes, mealType]);
```

Import da aggiungere in testa al file: `import { sortMealTypes } from '@/lib/constants/meal-types';`. Nota: la scrittura Firestore successiva (`updateMealPlan`, `:457-460`) e l'update ottimistico (`setCurrentPlan`, `:451-455`) usano già `nextActiveMealTypes`, quindi non servono altri ritocchi. Aggiornare il commento JSDoc di `addMealType` (righe 419-429) menzionando che l'ordine è canonico come per `addDay`.

**(b) `src/components/meal-planner/MealPlanSetupForm.tsx:81` — prima:**

```ts
return [...prev, type];
```

**Dopo:**

```ts
return sortMealTypes([...prev, type]);
```

(`sortMealTypes` si aggiunge all'import esistente di riga 13: `import { MEAL_LABELS, SELECTABLE_MEAL_TYPES, sortMealTypes } from '@/lib/constants/meal-types';`). Il default `useState<MealType[]>(['pranzo', 'cena'])` (`:39`) è già in ordine canonico e **resta invariato**: gli spuntini non sono pre-selezionati.

**(c) Normalizzazione opportunistica in `copyPlanToWeek` (`useMealPlanner.ts:205`)** — oggi copia `activeMealTypes: currentPlan.activeMealTypes` verbatim; cambiare in `activeMealTypes: sortMealTypes(currentPlan.activeMealTypes)`, così copiare un piano legacy disordinato produce un documento nuovo già canonico. Facoltativo per il contratto, ma a costo zero: farlo.

Non serve toccare `generateShuffledPlan`/`createManualPlan`: ricevono `config.activeMealTypes` dal form, che dopo (b) è sempre ordinato alla fonte.

### 4.4 Letture — auto-correzione dei piani esistenti

**(a) `src/components/meal-planner/WeeklyCalendarGrid.tsx`** — alla destrutturazione di riga 48 (`const { activeMealTypes, slots } = plan;`) affiancare:

```ts
const orderedMealTypes = useMemo(() => sortMealTypes(activeMealTypes), [activeMealTypes]);
```

e usare `orderedMealTypes.map(...)` al posto di `activeMealTypes.map(...)` **sia** alla riga 135 (griglia desktop) **sia** alla riga 194 (day-card mobile). `useMemo` è già importato/usato nel file (`:56-59` per `computeWeekCalories`). Import di `sortMealTypes` dall'import esistente di `MEAL_LABELS` (`:5`).

**(b) `src/components/meal-planner/PlanStructureCard.tsx:136`** — `{sortMealTypes(activeMealTypes).map((mealType) => (`. Component leggero (max 9 elementi), niente memo necessaria. Le chips inattive (`:62`, `inactiveMealTypes`) derivano da `SELECTABLE_MEAL_TYPES.filter(...)`: già canoniche, nessuna modifica.

**(c) `src/components/meal-planner/MealPlanSetupForm.tsx:205`** — `{sortMealTypes(activeMealTypes).map(type => {`. Con la scrittura (4.3b) già ordinata è ridondante nello stesso componente, ma è richiesto dal contratto e protegge da futuri percorsi di set dello state. I checkbox di riga 177 iterano `SELECTABLE_MEAL_TYPES`: già canonici, nessuna modifica.

### 4.5 UI/UX delle nuove portate

Non esiste UI nuova da costruire: le due portate entrano nei flussi esistenti automaticamente grazie a `SELECTABLE_MEAL_TYPES` e `MEAL_LABELS`.

- **Setup** (`MealPlanSetupForm.tsx:177-186`): compaiono due checkbox in più, in ordine canonico («Colazione, Spuntino, Pranzo, Merenda, Cena»). Non pre-selezionate. Se selezionate e ci sono categorie, appare la relativa card «Categorie per portata» (`:197-293`) con select preferita/escluse — gratis via `Partial<Record<…>>`.
- **PlanStructureCard**: le chips tratteggiate «aggiungi» mostrano Spuntino/Merenda (via `inactiveMealTypes`, `:62`); il Dialog «Lascia vuota / Riempi con shuffle» (`:179-222`) e il ConfirmDialog di rimozione (`:224-242`) funzionano invariati, con copy dinamico da `MEAL_LABELS` («Aggiungi spuntino al piano», «Rimuovere merenda dal piano?»). Il messaggio `inactiveMealTypes.length === 0` («Il piano copre già tutte le portate», `:170-174`) ora scatta a 5 portate anziché 3 — corretto così.
- **Griglia**: nuove righe con etichette «Spuntino»/«Merenda» nelle colonne etichetta esistenti (88px desktop / 72px mobile, vedi 2.4 — entrambe più corte di «Colazione», nessun overflow). Layout responsive invariato: il file usa già il pattern `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block` (`:117`) e la controparte mobile (`:172`); nessuna classe da toccare. Nessun colore hardcoded da introdurre: tutte le etichette usano token semantici già presenti (`text-muted-foreground`, ecc.).
- **Toast** (`pianificatore/page.tsx:221-234`): «Ho aggiunto spuntino e riempito gli slot», «Ho rimosso merenda dal piano» — dinamici da `MEAL_LABELS[…].toLowerCase()`, zero modifiche.
- **RecipePickerSheet** (`:87`) e **NewRecipeReviewCard** (`:70`): titoli tipo «Mar — Spuntino» automatici.

### 4.6 Edge case ed errori

1. **Piano legacy con ordine sbagliato in Firestore** (es. `['pranzo','cena','colazione']`): il documento **non viene riscritto** al load; le letture (4.4) ordinano a render time. Alla prima mutazione che passa da `addMealType` o `copyPlanToWeek` l'array persistito diventa canonico. `removeMealType` (`useMealPlanner.ts:476`) usa `filter`, che preserva l'ordine esistente: accettabile (la lettura corregge comunque); non toccare per minimizzare il diff.
2. **Piano legacy con tipi corso** (`primo`/`secondo`/…): `sortMealTypes` li mette in coda nell'ordine relativo in cui erano salvati (sort stabile). Continuano a renderizzare via `MEAL_LABELS` e restano rimovibili da `PlanStructureCard`; non sono mai proposti tra le chips «aggiungi» (derivate da `SELECTABLE_MEAL_TYPES`).
3. **Mix legacy + spuntini**: un piano storico con `['pranzo','primo','cena']` a cui si aggiunge `spuntino` produce `['spuntino','pranzo','cena','primo']` → render: Spuntino, Pranzo, Cena, Primo. Coerente con la regola «legacy in coda».
4. **Shuffle su spuntino/merenda senza ricette adatte**: se il ricettario è vuoto o tutte le ricette sono escluse dalla config della portata, la portata finisce in `unfilledMealTypes` e la UI mostra il toast esistente (2.5). Se invece il ricettario ha ricette qualsiasi, lo shuffle riempie lo spuntino pescando da tutto il ricettario (pool non meal-specific, 2.5): comportamento noto e accettato; la mitigazione è la categoria preferita per-portata. **Documentare questo in un commento** sopra `buildCandidatePool` è facoltativo; non cambiare la logica.
5. **Slot orfani**: `removeMealType` cancella già anche gli slot della portata (obbligatorio: `buildContributions` itera tutti gli slot senza filtro su `activeMealTypes`, commento `useMealPlanner.ts:467-471`). Le nuove portate non cambiano nulla: stessa identità slot `(dayIndex, mealType)`, stessi percorsi.
6. **Chiavi UI `${dayIndex}-${mealType}`** (`WeeklyCalendarGrid.tsx:151,196`, `page.tsx` `slotKey`, `useMealPlanner.ts:317`): `spuntino`/`merenda` sono stringhe senza trattino, nessuna collisione possibile.
7. **`sortMealTypes([])`** → `[]` (nessun crash); input mai mutato (copia difensiva) — importante perché gli argomenti sono state React (`prev` in `toggleMealType`) o campi di `currentPlan`.
8. **Test esistenti**: `meal-plan-calories.test.ts:38` e `meal-plan-shuffle.test.ts` usano `activeMealTypes: ['pranzo', 'cena']` / `['pranzo']` — già canonici, nessun test esistente si rompe. Verificare comunque con la suite completa.

## 5. Piano di implementazione a fasi

Ogni fase lascia il progetto compilabile (`npx tsc --noEmit` verde).

**Fase 1 — Tipi e costanti.**
- `src/types/index.ts`: estendere `MealType` (4.1) + JSDoc.
- `src/lib/constants/meal-types.ts`: estendere `SELECTABLE_MEAL_TYPES` e `MEAL_LABELS`, aggiungere `sortMealTypes`, aggiornare i commenti/checklist (4.2). Se `MEAL_LABELS` non compila è il segnale atteso: aggiungere le due chiavi.
- Compila già da sola: nessun consumer richiede i nuovi valori, la Record estesa soddisfa il tipo.

**Fase 2 — Scritture.**
- `src/lib/hooks/useMealPlanner.ts`: `sortMealTypes` in `addMealType` (`:438`) e `copyPlanToWeek` (`:205`) + import + JSDoc.
- `src/components/meal-planner/MealPlanSetupForm.tsx`: `sortMealTypes` in `toggleMealType` (`:81`) + import.

**Fase 3 — Letture.**
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: `orderedMealTypes` memoizzato, usato a `:135` e `:194`.
- `src/components/meal-planner/PlanStructureCard.tsx`: sort a `:136`.
- `src/components/meal-planner/MealPlanSetupForm.tsx`: sort a `:205`.

**Fase 4 — Test unitari.**
- Nuovo `src/lib/constants/meal-types.test.ts` (vedi sezione 6).

**Fase 5 — Verifica finale.**
- `npx tsc --noEmit`, `npm test`, `npx next build --webpack`.

**Fase 6 — Collaudo guidato** (sezione 6.2), poi aggiornamento docs (CLAUDE.md Recent Changes, checklist `specs/00-roadmap.md`, AGENTS.md solo se emergono gotcha nuovi).

## 6. Piano di test

### 6.1 Unit test (Jest, `npm test`)

Nuovo file `src/lib/constants/meal-types.test.ts`, stile colocato come `src/lib/utils/meal-plan-shuffle.test.ts`:

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

Rilanciare l'intera suite (`npm test`): i test esistenti di shuffle/calorie usano già array canonici e non devono cambiare.

### 6.2 Collaudo guidato (Playwright + emulatori Firebase)

Secondo la sezione «Guided testing tooling» di CLAUDE.md: `npm run emulators` in un terminale, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in un altro, script usa-e-getta in `e2e/scratch/` (gitignored, da cancellare a fine collaudo), asserzioni su stato Firestore/HTTP più che sull'aspetto.

Fasi proposte (una per messaggio, esito atteso dichiarato prima):

1. **Seed**: script throwaway che crea utente emulato + ~8 ricette con parole-spia (es. titoli `SPIA-torta-…`) + un piano `meal_plans` **volutamente disordinato**: `activeMealTypes: ['pranzo','cena','colazione','dolce']` con slot coerenti.
2. **Auto-correzione in lettura**: aprire il pianificatore → atteso: righe griglia nell'ordine Colazione, Pranzo, Cena, Dolce (legacy in coda) sia desktop (viewport ≥1440px) sia mobile portrait; chips di `PlanStructureCard` nello stesso ordine; **documento Firestore invariato** (assert via Admin SDK: array ancora `['pranzo','cena','colazione','dolce']`).
3. **Scrittura canonica**: da `PlanStructureCard` aggiungere «Spuntino» con «Riempi con shuffle» → atteso: toast «Ho aggiunto spuntino e riempito gli slot»; assert Firestore: `activeMealTypes === ['colazione','spuntino','pranzo','cena','dolce']` e slot `mealType==='spuntino'` presenti per ogni giorno attivo con `existingRecipeId` valorizzato.
4. **Setup con spuntini**: nuovo piano su settimana diversa selezionando tutte e 5 le portate, con de-selezione/ri-selezione di «Pranzo» prima di generare → atteso: `activeMealTypes` persistito `['colazione','spuntino','pranzo','merenda','cena']` (il bug del toggle non si ripresenta).
5. **Rimozione**: rimuovere «Merenda» via ConfirmDialog → atteso: portata e relativi slot spariti dal documento (nessuno slot orfano: assert `slots.every(s => s.mealType !== 'merenda')`), lista spesa ricalcolata senza gli ingredienti spia della merenda.
6. **Visivo**: screenshot desktop e mobile portrait della griglia a 5 portate — le etichette «Spuntino»/«Merenda» non overflowano le colonne 88px/72px.
7. **Cleanup**: cancellare `e2e/scratch/`, registrare il collaudo nella lista in CLAUDE.md («Collaudi eseguiti con questa tooling»).

## 7. Gotcha e vincoli pertinenti

- **Mai `undefined` su Firestore** (AGENTS.md §2): qui si riscrivono solo array esistenti (`activeMealTypes`, `slots`) sempre valorizzati — nessun campo nuovo, nessun rischio, ma non introdurre spread condizionali errati in `updateMealPlan`.
- **Slot orfani vietati** (commento `useMealPlanner.ts:467-471`): `buildContributions` itera tutti gli `plan.slots` senza filtrare su `activeMealTypes`; ogni mutazione che toglie una portata deve rimuovere i suoi slot **nella stessa scrittura**. Questa spec non tocca `removeMealType`, ma il collaudo (fase 5) lo verifica anche per le nuove portate.
- **`invalidateShoppingList()`** su ogni mutazione del piano (chiave parziale `['shoppingList', uid]`, `useMealPlanner.ts:89-92`): `addMealType` la chiama già (`:461`); non rimuoverla riscrivendo la funzione.
- **`MEAL_LABELS` è `Record<MealType, string>` esaustivo di proposito** (`meal-types.ts:10-12`): l'errore TS dopo l'estensione del tipo è il meccanismo di guardia, non un problema da aggirare con `Partial`.
- **Etichette corte**: colonna etichette griglia 88px desktop (`WeeklyCalendarGrid.tsx:121,139`) / 72px mobile (`:199`) — vincolo citato anche nel commento di `MEAL_LABELS` (`meal-types.ts:31-33`). «Spuntino» e «Merenda» rientrano; non usare etichette più lunghe (niente «Spuntino mattutino»).
- **ConfirmDialog per azioni distruttive** (CLAUDE.md «Confirmations and touch»): la rimozione portata passa già da `ConfirmDialog` (`PlanStructureCard.tsx:224-242`); non introdurre `confirm()` nativi.
- **Pattern responsive `max-lg:portrait:`** (CLAUDE.md «Navigation»): la griglia usa già `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block` (`WeeklyCalendarGrid.tsx:117`) e la controparte mobile (`:172`): non alterare queste classi.
- **Token semantici** (CLAUDE.md «Theming»): nessun colore nuovo; le etichette restano `text-muted-foreground` ecc. Mai `bg-white dark:bg-black`.
- **Niente `onSnapshot` / niente nuove query** (AGENTS.md §3): la spec non aggiunge letture Firestore.
- **Sort stabile**: `Array.prototype.sort` è stabile da ES2019 (garantito su Node ≥ 12 e su tutti i browser target) — il requisito «legacy in coda in ordine stabile» si appoggia a questo; il test dedicato lo blinda.
- **React state immutabile**: `sortMealTypes` restituisce sempre una copia; mai `types.sort(...)` in place su `prev` o su `currentPlan.activeMealTypes`.
- Nessun nuovo target di persistenza → il gotcha «proprio debounce + registrazione in flushAll» (AGENTS.md, lista spesa) **non** si applica: qui si riusano le scritture immediate esistenti di `updateMealPlan`.

## 8. Fuori scope

- **Persone/porzioni per slot, varianti per membro, familyProfile nel planner** → Spec F.
- **Macro/kcal per le nuove portate**: `computeDayCalories` conta già 1 porzione per slot pieno, spuntini inclusi, automaticamente; nessuna logica calorie dedicata → estensioni in Spec C/F.
- **Migrazione Firestore dei piani esistenti**: esclusa per design (auto-correzione in lettura).
- **Pool shuffle specifico per portata** (es. «per spuntino pesca solo da categorie dolci»): non si cambia `buildCandidatePool`; la config per-portata esistente è la mitigazione.
- **Rendere selezionabili i tipi legacy** o rimuoverli dal tipo: restano com'erano.
- **Redesign UI del pianificatore** → Spec F.
- **Lista spesa e statistiche**: nessuna modifica (insensibili all'ordine, vedi 2.3).

## 9. Prompt di implementazione

```markdown
Implementa la Spec A del progetto "Il Mio Ricettario".

1. Leggi e applica le convenzioni di: CLAUDE.md, AGENTS.md, COMMENTS.md e
   DEVELOPMENT_GUIDELINES.md (root del repo).
2. Leggi PER INTERO specs/00-roadmap.md (contratto condiviso vincolante) e
   specs/spec-a-portate-ordinamento-spuntini.md (la spec da implementare).
   In caso di conflitto: roadmap > spec > codice esistente.
3. Crea il branch feature/meal-order-snacks a partire da develop.
4. Implementa fase per fase (sezione 5 della spec). Dopo OGNI fase esegui
   `npx tsc --noEmit` e non passare alla fase successiva finché non è verde.
5. A fine lavoro esegui `npx next build --webpack` (se fallisce con
   spawn EPERM, rilancia il comando fuori sandbox).
6. Esegui i test con il comando reale di package.json: `npm test`
   (script "test": "jest"). Aggiungi il nuovo file
   src/lib/constants/meal-types.test.ts come da sezione 6.1.
7. Aggiorna: CLAUDE.md (sezione "Recent Changes", nuova voce datata),
   AGENTS.md (solo se sono emersi gotcha NUOVI durante l'implementazione)
   e la checklist di stato in specs/00-roadmap.md (spunta Spec A).
8. NON committare MAI senza OK esplicito dell'utente (regola di sessione:
   un branch/commit a sessione, commit solo dopo approvazione).
9. Al termine proponi all'utente un collaudo guidato fase-per-fase come da
   sezione 6.2 della spec (emulatori Firebase + Playwright, script
   usa-e-getta in e2e/scratch/, esito atteso dichiarato prima di ogni fase).
```

## 10. Modello e effort consigliati

"Sonnet (claude-sonnet-5) · effort medium — modifiche meccaniche ben delimitate su tipi, costanti e punti di iterazione; la spec elimina ogni ambiguita'."

Motivazione: nessuna decisione aperta resta all'implementatore — ogni punto di modifica è citato con file:linea e testo prima/dopo, e il type-checker guida le estensioni esaustive.
