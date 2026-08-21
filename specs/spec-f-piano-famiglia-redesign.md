# Spec F — Piano famiglia (pasto base + varianti per membro) + redesign pagina pianificatore

> Note coperte: 3 (piano per famiglia + redesign UI pianificatore) | Dipendenze: **Spec A (obbligatoria** — `sortMealTypes`, `spuntino`/`merenda` in `SELECTABLE_MEAL_TYPES`**)**, Spec C (opzionale — macro nel planner, vedi §4.3.4) | Branch: `feature/family-meal-plan`

Questa spec va letta insieme a `specs/00-roadmap.md` (contratti 1, 4 e 5 e decisioni di prodotto 5 e 6). In caso di conflitto vince il roadmap.

**Nota sui riferimenti file:linea**: verificati sul codice al 2026-08-12, **prima** dell'implementazione di Spec A. Dopo Spec A alcune righe di `meal-types.ts`, `useMealPlanner.ts` e `MealPlanSetupForm.tsx` slitteranno di poco; i simboli citati restano validi.

---

## 1. Obiettivo

Oggi il pianificatore non sa per quante persone si cucina: la lista della spesa copia le quantità così come sono scritte nella ricetta (qualunque sia il suo `servings`) e le kcal giornaliere contano una porzione per slot. Con questa spec:

- ogni slot del piano dichiara **per quante persone** si prepara il pasto base (`servingsPlanned`, default = numero componenti del profilo famiglia, fallback 2);
- uno slot può avere **varianti per membro**: "martedì cena tutti pasta al forno, ma Sofia mangia il minestrone" — la variante referenzia una ricetta esistente del ricettario e uno o più componenti della famiglia;
- la **lista della spesa scala** ogni contributo col fattore `personeServite / (recipe.servings || 4)` via `scaleQuantity()`; le varianti generano contributi propri;
- le **kcal del planner diventano per-persona**: valore del percorso base in evidenza, totali alternativi per i membri con varianti in tooltip/dettaglio;
- la **pagina pianificatore viene ridisegnata**: setup progressivo invece del form monolitico, calendario con badge varianti e kcal/persona, struttura del piano integrata, empty state, rimozione del dead code dello step `generating`.

**Invariante di retro-compatibilità (critico)**: `servingsPlanned == null` (tutti i piani esistenti) = comportamento legacy, **nessuno scaling**, quantità as-is. Le liste della spesa dei piani già creati non devono cambiare da sole.

---

## 2. Stato attuale

### 2.1 Modello dati

`MealSlot` (src/types/index.ts:403-413) non ha alcun concetto di persone/porzioni/famiglia:

```ts
export interface MealSlot {
  dayIndex: number;              // 0 = Lunedì, 6 = Domenica
  mealType: MealType;
  existingRecipeId: string | null;  // null if slot uses newRecipe or is empty
  newRecipe: ParsedRecipe | null;   // AI-generated recipe not yet in cookbook; null if existingRecipeId set
  recipeTitle: string | null;       // Denormalized for fast render without recipe lookup
  /** AI-suggested category name for new recipes (not an ID — the AI knows names, not IDs). */
  suggestedCategoryName?: string;
  /** AI-suggested seasons for new recipes. */
  suggestedSeasons?: Season[];
}
```

L'identità dello slot è la coppia `(dayIndex, mealType)` (commento a src/types/index.ts:391); le chiavi stringa `${dayIndex}-${mealType}` sono usate in useMealPlanner.ts:317, pianificatore/page.tsx:243-245 e WeeklyCalendarGrid.tsx:151/:196. **Questa identità non si tocca.**

`FamilyProfile`/`FamilyMember` (src/types/index.ts:43-52): `FamilyMember { id: string; age: number; label?: string | null }`, `FamilyProfile { members: FamilyMember[]; notes?: string | null }`, salvato su `users/{uid}.familyProfile`. `useFamilyProfile` (src/lib/hooks/useFamilyProfile.ts:24-81, query key `['familyProfile', uid]`, staleTime 5 min, `enabled: !!user`) è **oggi consumato solo dai flussi AI** (verificato: nessun hit di `familyProfile` in pianificatore, meal-planner components, useMealPlanner, meal-plan-shuffle, useShoppingList, ingredient-aggregator). Il fallback label "Componente N" esiste in `buildFamilyContextPrompt` (src/lib/utils/family-context.ts:55: `const label = member.label ?? \`Componente ${index + 1}\`;`).

### 2.2 Lista della spesa

`buildContributions` (src/lib/utils/ingredient-aggregator.ts:19-54) itera **tutti** gli `plan.slots` (senza filtrare per `activeMealTypes` — invariante: mai slot orfani persistiti) e copia le quantità as-is:

```ts
for (const ing of ingredients) {
  contributions.push({
    name: ing.name,
    quantity: ing.quantity,
    section: ing.section ?? null,
    recipeTitle,
    dayIndex: slot.dayIndex,
    mealType: slot.mealType,
  });
}
```

`useShoppingList` (src/lib/hooks/useShoppingList.ts:107-118) fa il batch fetch delle sole ricette referenziate da `slot.existingRecipeId`:

```ts
const existingIds = plan.slots
  .map(s => s.existingRecipeId)
  .filter((id): id is string => !!id);

const recipesById = await getRecipesByIds(existingIds, user!.uid);
```

`scaleQuantity` (src/lib/utils/ingredient-scaler.ts:29-56) esiste già ed è usata solo in cottura e nei token `{{qty:id}}`: ritorna la stringa invariata quando `originalServings <= 0 || newServings <= 0 || originalServings === newServings` e per le quantità non scalabili (`q.b.`, `un pizzico`, `a piacere`, ingredient-scaler.ts:43-47).

### 2.3 Calorie del planner

`computeDayCalories` (src/lib/utils/meal-plan-calories.ts:62-92) somma `caloriesPerServing` una volta per slot pieno ("Sum of kcal per serving across the day's resolvable slots", :19); `readSlotCalories` (:37-48) risolve `existingRecipeId → recipesById`, poi `newRecipe`. `computeWeekCalories` (:100-112) itera `plan.activeDays ?? [0..6]`. Il render è in `WeeklyCalendarGrid.renderDayCalories` (src/components/meal-planner/WeeklyCalendarGrid.tsx:72-88): nasconde i giorni con `total === 0`, prefissa `≥` sui parziali, tooltip via `title`.

### 2.4 Mutazioni del piano

In `useMealPlanner` (src/lib/hooks/useMealPlanner.ts): `updateSlot` (:262-286) e `reshuffleSlot` (:310-368) ricostruiscono lo slot **da zero** con il pattern filter+push, es. updateSlot:274-280:

```ts
updatedSlots.push({
  dayIndex,
  mealType,
  existingRecipeId: recipeId,
  newRecipe: null,
  recipeTitle: title,
});
```

(qualsiasi campo extra dello slot precedente andrebbe perso — va cambiato, vedi §4.4). `clearSlot` (:291-302) rimuove lo slot intero. `copyPlanToWeek` (:192-213) copia `currentPlan.slots` verbatim (:204) — i nuovi campi slot viaggiano gratis. `removeMealType` (:473-495) cancella anche gli slot (commento :467-471). `addDay` (:407-417) non invalida la lista spesa (per design); tutte le altre mutazioni chiamano `invalidateShoppingList()` (:89-92, chiave parziale `['shoppingList', uid]`). Nota: la dep array di `reshuffleSlot` (:368) omette `invalidateShoppingList` (fragile, da sistemare).

`buildShuffledSlots` (src/lib/utils/meal-plan-shuffle.ts:39-69) crea gli slot a :58-64 con i soli 5 campi base; `ShuffleConfig` (:19-24) non ha nozione di persone.

### 2.5 Pagina pianificatore

`pianificatore/page.tsx`: titolo → `PlannerHeader` (:378-389) → step `setup` (:392-453: card "Piani già salvati", info box "Come usare il pianificatore", `MealPlanSetupForm` monolitico in colonna `max-w-lg`) → step `generating` **morto** (:456-464: `EditorialLoader`; nulla setta mai `step='generating'` — `PlannerStep` è dichiarato in useMealPlanner.ts:38, `isGenerating` serve solo a disabilitare i bottoni) → step `calendar` (:467-526: `PlanStructureCard` + `WeeklyCalendarGrid` + "Ricette da rivedere"). Overlay: `RecipePickerSheet` (:529-541), Dialog copia piano (:543-589), `ConfirmDialog` elimina piano (:591-599).

`MealPlanSetupForm` (src/components/meal-planner/MealPlanSetupForm.tsx:31-327): stagione, chip giorni, checkbox portate (default `['pranzo','cena']`, :39), config per-portata "Categorie per portata" visibili **solo al setup** (:197-295), due CTA (:306-324). `RecipePickerSheet` (src/components/meal-planner/RecipePickerSheet.tsx:48-233): bottom sheet `h-[85vh]` con ricerca/filtro stagione/filtro categoria, un tap = selezione+chiusura (:89-92), azione "Rimuovi ricetta da questo slot" (:220-229, senza conferma). `MealSlotCell` (src/components/meal-planner/MealSlotCell.tsx:49-203): stati vuoto/ricettario/AI-new/regenerating; il bottone rimescola usa il pattern `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100` (:111).

Griglia (`WeeklyCalendarGrid.tsx`): desktop/landscape `hidden lg:block max-lg:portrait:hidden max-lg:landscape:block overflow-x-auto` (:117) con `gridTemplateColumns: \`88px repeat(${activeDays.length}, minmax(150px, 1fr))\`` (:121, :139); mobile portrait card giorno impilate (:172-218).

---

## 3. Decisioni di prodotto (vincolanti, dal roadmap)

1. **Pasto base + varianti** (decisione 5): ogni slot ha una ricetta default per tutta la famiglia; dove serve si aggiunge una variante per uno o più membri specifici. **Niente griglia completa per membro.**
2. **Contratto 5**: identità slot `(dayIndex, mealType)` intatta; `MealSlot` guadagna `servingsPlanned?: number | null` e `variants?: MealSlotVariant[] | null` con `MealSlotVariant = { id: string; memberIds: string[]; existingRecipeId: string | null; recipeTitle: string | null }`; il pasto base copre i membri non coperti da varianti.
3. **Scaling lista spesa** (decisione 6): fattore per contributo = `personeServite / (recipe.servings || 4)` applicato con `scaleQuantity()`; slot legacy (`servingsPlanned == null`) → fattore 1.
4. **Kcal per-persona** (decisione 6): i totali giornalieri del planner diventano per-persona; macro incluse se Spec C è già implementata.
5. **Varianti solo da ricette esistenti** (niente `newRecipe` nelle varianti). Motivazione: `newRecipe` inline è un residuo del vecchio generatore AI (lo shuffle non genera mai `newRecipe`, AGENTS.md §9 "Backward-compat"); ammetterlo nelle varianti significherebbe duplicare l'intero flusso review/salvataggio (`NewRecipeReviewCard`), aggiungere un terzo percorso di risoluzione in aggregatore e calorie, e far crescere il documento `meal_plans` di una ricetta completa per variante. Il caso d'uso reale ("il bambino mangia una cosa più semplice") è coperto dal ricettario; se la ricetta non esiste ancora, la si crea prima (manuale o AI) e poi la si seleziona.
6. **Nessuna migrazione batch**: dual-read lazy come `categoryIds` — i campi nuovi sono opzionali, i documenti esistenti non vengono toccati finché l'utente non edita uno slot.
7. **Ordine canonico portate** da Spec A: usare `sortMealTypes()` ovunque si scriva/renda `activeMealTypes`.

---

## 4. Design proposto

### 4.1 Modello dati

**Prima** (src/types/index.ts:403-413): vedi §2.1.

**Dopo** (stesso file, aggiungere `MealSlotVariant` sopra `MealSlot`):

```ts
/**
 * Variante per-membro di uno slot: uno o più componenti della famiglia mangiano
 * una ricetta diversa dal pasto base.
 *
 * SOLO RICETTE ESISTENTI: niente `newRecipe` inline — le varianti referenziano il
 * ricettario. Vedi Spec F §3 (decisione 5) per la motivazione (evita di duplicare
 * il flusso di review AI e di gonfiare il documento meal_plans).
 *
 * memberIds referenzia FamilyMember.id del profilo famiglia. Un membro rimosso dal
 * profilo lascia una "variante orfana": lo scaling continua a contare
 * memberIds.length (le persone pianificate), la UI marca il chip come
 * "Componente rimosso" (vedi §4.5.5).
 */
export interface MealSlotVariant {
  id: string;                       // crypto.randomUUID()
  memberIds: string[];              // sempre >= 1 elemento (guardia client-side)
  existingRecipeId: string | null;  // ricetta del ricettario; null solo per dati corrotti (skip difensivo)
  recipeTitle: string | null;       // denormalizzato per il render O(1), come MealSlot.recipeTitle
}

export interface MealSlot {
  dayIndex: number;
  mealType: MealType;
  existingRecipeId: string | null;
  newRecipe: ParsedRecipe | null;
  recipeTitle: string | null;
  suggestedCategoryName?: string;
  suggestedSeasons?: Season[];
  /**
   * Persone per cui si cucina il pasto base (varianti escluse: il base copre
   * servingsPlanned − Σ variants[].memberIds.length persone, clampato a 0).
   *
   * INVARIANTE LEGACY (non negoziabile): null/undefined = piano creato prima di
   * questa feature O slot mai riconfigurato → NESSUNO scaling, quantità as-is.
   * Le liste della spesa esistenti non devono cambiare da sole. Il valore viene
   * scritto solo da: shuffle (default famiglia), editor slot, updateSlot su slot nuovo.
   */
  servingsPlanned?: number | null;
  /** Varianti per membro; null/undefined/[] = nessuna. Persistere null, mai undefined. */
  variants?: MealSlotVariant[] | null;
}
```

Regole Firestore: `servingsPlanned` e `variants` si scrivono come `null` o si omettono, **mai `undefined`** (CLAUDE.md "Never persist undefined"). Le scritture passano tutte da `updateMealPlanSlots`/`updateMealPlan` (src/lib/firebase/meal-plans.ts:146-168), che riscrivono l'array slots intero: basta che gli oggetti slot costruiti client-side non contengano chiavi `undefined` (usare spread condizionale o valori `null` espliciti).

**Dimensione documento**: una variante pesa ~120 byte serializzata (id UUID + 1-2 memberIds + recipeId + titolo). Caso limite 7 giorni × 5 portate × 3 varianti ≈ 105 varianti ≈ 13 KB extra su un documento che oggi pesa pochi KB — irrilevante rispetto al limite Firestore di 1 MiB. Le varianti inline evitano una collection nuova (regole, indice, N read per piano), coerente con la scelta già fatta per `shoppingCustomItems` sul piano e `adHocShoppingRecipes` su `users/{uid}`.

**Default persone**: `defaultServingsPlanned = normalizeFamilyProfile(familyProfile)?.members.length ?? 2` (usare `normalizeFamilyProfile` di src/lib/utils/family-context.ts:12-39 per scartare membri invalidi, come fanno i flussi AI). Calcolato in `useMealPlanner` componendo `useFamilyProfile()` (staleTime 5 min: un profilo appena modificato può impiegare fino a 5 minuti a riflettersi nel default — accettabile, il valore è comunque editabile per slot).

### 4.2 Scaling lista della spesa (`ingredient-aggregator.ts`)

`buildContributions(plan, recipesById)` mantiene la firma. Nuova logica per slot (pseudocodice TS aderente):

```ts
const DEFAULT_RECIPE_SERVINGS = 4; // stesso fallback di cooking mode (recipe.servings || 4)

for (const slot of plan.slots) {
  const variants = (slot.variants ?? []).filter(v => v.existingRecipeId && v.memberIds.length > 0);
  const variantPersons = variants.reduce((sum, v) => sum + v.memberIds.length, 0);

  // ── Contributi del pasto base ──
  // null → LEGACY: fattore 1, quantità as-is (invariante §1).
  const basePersons = slot.servingsPlanned == null
    ? null
    : Math.max(0, slot.servingsPlanned - variantPersons);

  if (/* slot ha ricetta base risolvibile (existingRecipeId in recipesById, o newRecipe) */) {
    if (basePersons === null) {
      // push quantità invariate — identico al codice attuale (:41-50)
    } else if (basePersons > 0) {
      const baseServings = recipe.servings || DEFAULT_RECIPE_SERVINGS; // vale sia per Recipe che per ParsedRecipe
      // push con quantity: scaleQuantity(ing.quantity, baseServings, basePersons)
    }
    // basePersons === 0 → il base non entra in lista (le varianti coprono tutti)
  }

  // ── Contributi delle varianti (sempre, anche se servingsPlanned è null — caso difensivo) ──
  for (const v of variants) {
    const vRecipe = recipesById.get(v.existingRecipeId!);
    if (!vRecipe) continue; // ricetta cancellata: skip, come per gli slot base (:31)
    const persons = v.memberIds.length;
    for (const ing of vRecipe.ingredients) {
      contributions.push({
        name: ing.name,
        quantity: scaleQuantity(ing.quantity, vRecipe.servings || DEFAULT_RECIPE_SERVINGS, persons),
        section: ing.section ?? null,
        recipeTitle: vRecipe.title,
        dayIndex: slot.dayIndex,
        mealType: slot.mealType,
      });
    }
  }
}
```

Note:
- `scaleQuantity` importata da `@/lib/utils/ingredient-scaler` — le stringhe non scalabili (`q.b.`, `a piacere`, range, frazioni) sono già gestite lì: passano invariate o scalano correttamente; **non** reimplementare il parsing.
- `scaleQuantity(q, base, base)` ritorna la stringa invariata (ingredient-scaler.ts:35): uno slot con `servingsPlanned === recipe.servings` produce quantità identiche al legacy — nessuna riformattazione spuria.
- L'interfaccia `IngredientContribution` (:3-10) **non cambia**: la quantità arriva già scalata all'aggregazione, e `aggregateIngredients`/`mergeQuantities` restano intatte.
- Lo stato `servingsPlanned != null && variants presenti su slot senza base` non è raggiungibile da UI (l'editor richiede la ricetta base, §4.5); il codice lo tollera comunque (varianti contribuiscono, base no).
- Gli id degli item (`toSlug(canonicalIngredientKey(name))`, :127) non dipendono dalle quantità → lo stato spuntato (`shoppingCheckedIds`) sopravvive allo scaling.

**`useShoppingList` — batch fetch**: estendere la raccolta id (src/lib/hooks/useShoppingList.ts:111-113) alle ricette delle varianti:

```ts
const existingIds = plan.slots.flatMap(s => [
  ...(s.existingRecipeId ? [s.existingRecipeId] : []),
  ...(s.variants ?? []).map(v => v.existingRecipeId).filter((id): id is string => !!id),
]);
```

(`getRecipesByIds` deduplica già gli id in ingresso — `const uniqueIds = [...new Set(recipeIds)]`, src/lib/firebase/firestore.ts:147 — quindi i duplicati base/variante non costano read extra e non serve dedupe lato chiamante.)

### 4.3 Kcal per-persona (`meal-plan-calories.ts`)

> **Coordinamento con Spec C** (come per la nota sui riferimenti file:linea in testa alla spec): se Spec C è già implementata, `meal-plan-calories.ts` non espone più `DayCalories`/`computeDayCalories`/`computeWeekCalories` ma `DayNutrition` (con `calories: NutrientTotal` e blocco `macros`), `computeDayNutrition`/`computeWeekNutrition`, e il render in `WeeklyCalendarGrid` si chiama `renderDayNutrition` (Spec C §4.f). In quel caso le modifiche di questa sezione si applicano a **quei** nomi e a quella forma — `memberDeltas` si aggiunge al modello del giorno, la risoluzione base/variante vale per kcal e (via §4.3.4) per i macro — senza ripristinare i vecchi nomi. I riferimenti a `DayCalories`/`computeDayCalories` qui sotto descrivono il caso in cui Spec C non sia ancora implementata.

#### 4.3.1 Semantica

- **Percorso base (in evidenza)**: kcal per **una persona** che mangia il pasto base di ogni slot pieno del giorno = somma di `caloriesPerServing` delle ricette base. È **lo stesso numero di oggi** — cambia solo l'etichetta (da totale-giorno implicito a "kcal/pers."). I piani legacy mostrano quindi lo stesso valore di prima.
- **Totali per membro**: per ogni membro del profilo famiglia coperto da **almeno una variante** in quel giorno, il suo totale = per ogni slot pieno, `caloriesPerServing` della variante che lo copre se esiste, altrimenti della base. I membri senza varianti nel giorno coincidono col percorso base e non compaiono nell'elenco.
- `servingsPlanned` **non** entra nelle kcal (sono per-persona, non totali del pentolone).
- Parzialità: si mantiene la convenzione `isPartial`/`≥` (meal-plan-calories.ts:11-15), calcolata per traccia (base e per-membro separatamente).

#### 4.3.2 Tipi

**Prima** (`DayCalories`, meal-plan-calories.ts:18-27): `{ total, countedSlots, uncountedSlots, isPartial }`.

**Dopo**:

```ts
export interface MemberDayCalories {
  memberId: string;
  label: string;        // FamilyMember.label ?? `Componente ${index+1}` (stesso fallback di family-context.ts:55)
  total: number;
  isPartial: boolean;
}

export interface DayCalories {
  /** kcal per UNA persona sul percorso base. Uguale al vecchio `total` sui piani senza varianti. */
  total: number;
  countedSlots: number;
  uncountedSlots: number;
  isPartial: boolean;
  /** Totali alternativi dei soli membri coperti da varianti nel giorno; [] altrimenti. */
  memberDeltas: MemberDayCalories[];
}
```

#### 4.3.3 Firme

```ts
export interface PlannerMember { id: string; label: string; } // già risolto col fallback "Componente N"

export function computeDayCalories(
  plan: MealPlan,
  dayIndex: number,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []      // [] = nessun profilo → memberDeltas sempre []
): DayCalories;

export function computeWeekCalories(
  plan: MealPlan,
  recipesById: Map<string, Recipe>,
  members: PlannerMember[] = []
): Map<number, DayCalories>;
```

Algoritmo `memberDeltas`: raccogliere i `memberId` presenti nelle varianti degli slot pieni del giorno **e** presenti in `members` (i membri orfani non compaiono — la loro etichetta non è più ricostruibile). Per ciascuno, iterare gli slot pieni del giorno: kcal = `readVariantCalories(variante che lo copre)` se esiste, altrimenti `readSlotCalories(slot)` (funzione esistente :37-48, invariata); `null` → `isPartial` per quel membro. `readVariantCalories(v)` = `recipesById.get(v.existingRecipeId)?.caloriesPerServing ?? null`.

Chi risolve `members`: la pagina pianificatore, con `useFamilyProfile()` + `normalizeFamilyProfile` + fallback label, passandoli a `WeeklyCalendarGrid` come prop `members: PlannerMember[]`. `WeeklyCalendarGrid` aggiorna la memo (:56-59) in `computeWeekCalories(plan, recipesById, members)`.

#### 4.3.4 Macro (punto di estensione Spec C)

Se al momento dell'implementazione `Recipe.macrosPerServing` esiste (Spec C spuntata nella checklist del roadmap), aggiungere a `DayCalories` e `MemberDayCalories` i campi opzionali `macros?: { proteinGrams: number; carbsGrams: number; fatGrams: number } | null` (somma con la stessa risoluzione base/variante; `null` se anche una sola ricetta contata ne è priva — niente somme parziali silenziose) e mostrarli nel dettaglio kcal del giorno (§4.6.3). Se Spec C non è ancora implementata: **non** aggiungere i campi; lasciare un commento `// ESTENSIONE SPEC C: macros per-persona — vedi specs/spec-f §4.3.4` nel punto esatto (dopo il calcolo di `total` in `computeDayCalories`).

#### 4.3.5 Display

- Badge giorno: `≈1250 kcal/pers.` (prefisso `≥` se parziale, invariato; `total === 0` → niente badge, invariato, WeeklyCalendarGrid.tsx:74).
- Con `memberDeltas.length > 0`: il badge guadagna un indicatore (icona `Users` di lucide, `h-3 w-3`) e:
  - **desktop (`lg`)**: `title` esteso, es. `Base ≈1250 kcal/pers. · Sofia ≈1100 · Marco ≈1450` (pattern tooltip già in uso, :79-83);
  - **mobile portrait**: il badge diventa un `<button>` (`aria-expanded`) che espande una riga di dettaglio nella card del giorno: `Sofia ≈1.100 kcal · Marco ≈1.450 kcal` — render condizionale semplice, niente hover-only (gotcha touch). Nessuna nuova dipendenza (no popover Radix).

### 4.4 Mutazioni `useMealPlanner`

Tutte le mutazioni continuano il pattern optimistic-write (`setCurrentPlan` → `updateMealPlanSlots`/`updateMealPlan`) e **tutte** (tranne `addDay`, invariato per design) chiamano `invalidateShoppingList()` (:89-92).

| Funzione | Cambiamento |
|---|---|
| `updateSlot(dayIndex, mealType, recipeId, title)` | Il push (:274-280) **preserva** `servingsPlanned` e `variants` dello slot precedente (cambiare piatto base non cambia chi mangia cosa). Se lo slot non esisteva (cella vuota): `servingsPlanned: defaultServingsPlanned`, `variants: null`. |
| `clearSlot` | Invariato: rimuove lo slot intero, varianti comprese (svuotare il pasto = nessuno mangia lì). |
| `reshuffleSlot` | Lo slot sostitutivo (:349-355) **preserva** `servingsPlanned` e `variants` e cambia solo `existingRecipeId`/`recipeTitle`. Motivazione: il re-roll risponde a "proponimi un piatto base diverso"; chi mangia e chi devia è ortogonale, e azzerare le varianti per un tap accidentale sul ↺ distruggerebbe configurazione manuale accurata. Già che si tocca la funzione: aggiungere `invalidateShoppingList` alla dep array (:368, oggi omessa). |
| `setSlotServings(dayIndex, mealType, servingsPlanned: number)` | **Nuova.** Clamp `1..20`. Aggiorna il campo sullo slot esistente (no-op con toast d'errore se lo slot è vuoto — non raggiungibile da UI). Scrive con `updateMealPlanSlots` + invalidazione. |
| `setSlotVariants(dayIndex, mealType, variants: MealSlotVariant[])` | **Nuova.** Filtra varianti con `memberIds` vuoto; array vuoto → persiste `variants: null`. Se lo slot ha `servingsPlanned == null`, lo imposta a `defaultServingsPlanned` nella stessa scrittura (una variante implica il modello famiglia: evita lo stato difensivo "varianti su slot legacy"). Scrive + invalida. |
| `copyPlanToWeek` | **Nessuna modifica di codice** (:204 copia `currentPlan.slots` verbatim → `servingsPlanned`+`variants` viaggiano); aggiungere test esplicito. |
| `addMealType` / `removeMealType` / `addDay` / `removeDay` | Invariati nella logica (Spec A vi introduce `sortMealTypes`). `removeMealType`/`removeDay` cancellano gli slot interi → niente varianti orfane (invariante buildContributions, :467-471). `addMealType` con autofill passa `defaultServingsPlanned` allo shuffle (sotto). |
| `generateShuffledPlan` | Passa `defaultServingsPlanned` a `buildShuffledSlots`. |
| Hook return | Espone in più: `setSlotServings`, `setSlotVariants`, `defaultServingsPlanned: number`. |

**`buildShuffledSlots`** (meal-plan-shuffle.ts): `ShuffleConfig` guadagna `defaultServingsPlanned?: number | null`; il push dello slot (:58-64) aggiunge `servingsPlanned: config.defaultServingsPlanned ?? null, variants: null`. La funzione resta pura e testabile; i chiamanti che non passano il campo (test esistenti) producono slot legacy — nessun test esistente si rompe.

**`PlannerStep`** (useMealPlanner.ts:38): rimuovere `'generating'` dal tipo (`'setup' | 'calendar'`) — vedi §4.6.5.

### 4.5 Editor dello slot: `MealSlotEditorSheet` (nuovo componente)

**Scelta: sheet dedicato, non estensione di `RecipePickerSheet`.** Motivazione: il picker attuale è una vista mono-scopo "cerca → tap → chiudi" (:89-92); lo slot ora ha tre concern persistenti (ricetta base, persone, varianti) che richiedono uno sheet che resta aperto tra un'azione e l'altra. Incastrare stepper e liste varianti nel picker ne distruggerebbe l'ergonomia. Il riuso avviene al livello giusto: **estrarre da `RecipePickerSheet` il pannello ricerca+filtri+lista** in un componente interno riusabile `RecipePickerPanel` (props: `recipes`, `categories`, `selectedRecipeId?`, `onPick(recipe)`) usato sia per la scelta della base sia per quella della variante. `RecipePickerSheet.tsx` viene sostituito da `MealSlotEditorSheet.tsx` + `RecipePickerPanel.tsx` (il file del vecchio sheet si elimina; la pagina apre sempre l'editor).

File: `src/components/meal-planner/MealSlotEditorSheet.tsx`, bottom sheet `side="bottom"` `h-[85vh] flex flex-col` (stesso guscio del picker attuale, :111-114). Stato interno a **viste**: `'main' | 'pick-base' | 'variant-members' | 'variant-recipe'` (con back). Props: `open`, `onOpenChange`, `dayIndex`, `mealType`, `recipes`, `categories`, `currentSlot: MealSlot | undefined`, `members: PlannerMember[]`, `defaultServingsPlanned`, callback `onSelectBase`, `onClear`, `onSetServings`, `onSetVariants` (wired alle mutazioni del hook dalla pagina, come oggi :529-541).

**Vista `main`** (dall'alto):

1. **Header**: `Martedì — Pranzo` (pattern attuale, RecipePickerSheet.tsx:87) + `SheetDescription` sr-only.
2. **Ricetta base**: card con titolo ricetta + link "Vai alla ricetta" (se `existingRecipeId`) + bottone `Cambia ricetta` → vista `pick-base`. Slot vuoto: bottone primario `Scegli la ricetta base` → `pick-base`; stepper e varianti disabilitati con caption `Prima scegli la ricetta base.`
3. **Persone**: label `Per quante persone?`, `ServingsStepper` riusato (src/components/recipe/servings-stepper.tsx:35, props `value/onChange/min=1/max=20/size='md'`) con valore `currentSlot.servingsPlanned ?? defaultServingsPlanned`. Caption dinamica:
   - senza varianti: `Il pasto base copre {n} person{a|e}.`
   - con varianti: `Base per {n−k} person{a|e} · {k} con variante.`
   - `n−k <= 0`: warning con `StatusBanner` tono warning: `Le varianti coprono tutte le persone: la ricetta base non entrerà nella lista della spesa.`
   - Slot legacy (`servingsPlanned == null`): lo stepper mostra il default ma con caption `Quantità non ancora adattate alle persone — conferma per attivare.` e il valore si persiste **solo** alla prima interazione dell'utente (tap ± o modifica input), mai per la sola apertura dello sheet. Questo protegge l'invariante §1: aprire e chiudere l'editor non cambia la lista della spesa.
   - Persistenza stepper: debounce locale 600 ms (`setTimeout` ref) su `onSetServings`, con **flush su chiusura sheet e unmount** (stesso rischio del gotcha AGENTS "debounce non-flushed": timer azzerato quando scatta, lettura da ref).
4. **Varianti**: intestazione `Varianti` + sottotitolo `Un piatto diverso per uno o più componenti.`
   - Lista varianti correnti: per ognuna una riga con chip membri (label o iniziale) + titolo ricetta + bottone `X` (rimozione **diretta**, senza ConfirmDialog: è un'edit di singolo slot ricostruibile in due tap, stesso peso del "Rimuovi ricetta da questo slot" attuale :220-229; i ConfirmDialog restano per le distruzioni multi-slot: giorno, portata, piano).
   - Bottone `+ Aggiungi variante` → vista `variant-members`. Disabilitato con hint quando: (a) profilo famiglia vuoto/assente → `Per creare varianti aggiungi i componenti nel profilo famiglia.` + link `Vai al profilo famiglia` (`/profilo-famiglia`); (b) tutti i membri già coperti → `Tutti i componenti hanno già una variante.`
5. **Footer**: bottone ghost destructive `Svuota slot` (comportamento = `clearSlot` attuale: rimuove ricetta, persone e varianti; copy sotto: `Rimuove ricetta, persone e varianti di questo pasto.`) + chiusura sheet.

**Vista `variant-members`**: titolo `Per chi?`; chip toggle per ogni membro del profilo (label o `Componente N`), membri già coperti da un'altra variante disabilitati con caption `già coperto da una variante`; CTA `Continua` (disabilitata a 0 selezionati) → `variant-recipe`; `Annulla` → `main`.

**Vista `variant-recipe`** e **`pick-base`**: `RecipePickerPanel` a tutta altezza; tap su una ricetta = commit immediato (`onSetVariants` con la nuova variante appesa / `onSelectBase`) e ritorno a `main` (lo sheet **non** si chiude: l'utente spesso configura più cose). Ogni commit scrive subito su Firestore via le mutazioni del hook (coerente col modello optimistic-write del planner) e mostra toast di errore in caso di fallimento (pattern page.tsx:170-189).

**Sincronizzazione stato**: lo sheet deriva tutto da `currentSlot` (prop) — non tiene copie locali di ricetta/varianti; l'unico stato locale è la vista corrente, la selezione membri in corso e il draft dello stepper (con `useEffect` di sync sul cambio slot — gotcha `useState(prop)`).

### 4.5.5 Varianti orfane (membro eliminato dal profilo)

Comportamento esplicito, su tre superfici:
- **Scaling** (aggregatore): usa `memberIds.length` così com'è persistito — le persone pianificate restano tali anche se il profilo cambia; la spesa non si sgonfia in silenzio.
- **Kcal**: i membri orfani non compaiono in `memberDeltas` (§4.3.3) — l'etichetta non è ricostruibile.
- **UI**: nel calendario e nell'editor il chip del membro non risolvibile si rende come `Componente rimosso` (`bg-muted text-muted-foreground`, `title="Questo componente non è più nel profilo famiglia"`); nell'editor la riga variante mostra un hint `Modifica o rimuovi questa variante.` L'utente risolve manualmente; nessuna auto-pulizia (una scrittura implicita che cambia la lista della spesa violerebbe il principio dell'invariante §1).

### 4.6 Redesign pagina pianificatore (architettura a livello wireframe)

Il fine-tuning visivo è demandato alla skill **impeccable** in implementazione (vedi §9). Qui: architettura dell'informazione, comportamenti, copy. Vincoli trasversali: pagina `max-w-[1200px] mx-auto` senza padding proprio (AGENTS §1); token semantici, mai `bg-white`; niente `sticky` dentro `.shell-stage` su desktop (app-shell con scroll interno); terracotta come timbro ≤10% (DESIGN.md "Regola del Timbro"); niente card annidate oltre un livello; `EditorialEmptyState`/`StatusBanner`/`ConfirmDialog` condivisi; breakpoint `max-lg:portrait:`.

#### 4.6.1 Header

`PlannerHeader` ridisegnato su una riga (due su mobile portrait): titolo pagina compattato + navigazione settimana (`‹ 17 – 23 marzo 2026 ›`) + bottone `Oggi` (visibile solo quando la settimana visualizzata non è quella corrente; naviga a `getCurrentWeekMonday()`); azioni `Nuovo piano` / `Copia piano` / `Elimina piano` raggruppate a destra su desktop, in una riga sotto su mobile (tutte già esistenti, PlannerHeader.tsx:71-110; touch target `h-11` sotto `lg` conservati).

#### 4.6.2 Stato "nessun piano" + setup progressivo

Quando la settimana non ha piano, niente salto secco al form: **empty state** (`EditorialEmptyState`) con titolo `Nessun piano per questa settimana`, sottotitolo `Genera una proposta dal tuo ricettario o parti da una griglia vuota.`, e i chip "Piani già salvati" (contenuto attuale :394-417) subito sotto per aprire un'altra settimana. Il setup segue nella stessa colonna (`max-w-lg mx-auto`).

**Setup: card progressive, non wizard a step.** Motivazione: i campi sono pochi (stagione, giorni, portate, persone, regole shuffle) e un wizard a 3 schermate aggiunge tap senza ridurre il carico; le card progressive mantengono tutto ripercorribile a colpo d'occhio. Struttura:

1. **Card `Giorni e portate`** (sempre aperta): chip giorni + checkbox portate (ordine `sortMealTypes`/`SELECTABLE_MEAL_TYPES` post-Spec A, con `Spuntino`/`Merenda`) + **nuovo campo persone**: label `Per quante persone cucini di solito?`, `ServingsStepper` `size='md'`, prefill `defaultServingsPlanned`; caption `Puoi cambiarlo pasto per pasto dal calendario.` Il valore confluisce in `MealPlanSetupConfig` come nuovo campo `defaultServingsPlanned?: number | null` e da lì allo shuffle e a `createManualPlan` (che lo usa solo come default del hook per gli slot creati dopo).
2. **Card `Stagione e regole` — disclosure collassata di default** (pattern `grid-rows-[0fr]→[1fr]`, mai `max-h`): stagione (default `getCurrentSeason()`) + le attuali "Categorie per portata" (:197-295) invariate nella logica. **Dove vivono dopo il setup**: da nessuna parte — sono regole di **generazione**, non proprietà del piano (`MealPlanSetupConfig` non è persistito, verificato src/types/index.ts:526-546 "Setup configuration… consumed locally"); il piano vivo si edita per-slot e il re-roll usa i tier categoria della ricetta corrente (`pickReshuffledRecipe`). Questa scelta va scritta nel copy del disclosure: `Queste regole guidano solo la generazione: dopo, modifichi ogni pasto direttamente dal calendario.`
3. **Barra CTA sticky** (`sticky bottom-0 max-lg:portrait:bottom-20 bg-background border-t py-4 z-10` — sotto 1440px lo scroll è di finestra, quindi `sticky` è legittimo; su desktop ≥1440px verificare il comportamento dentro lo scroll interno di `<main>` e, se necessario, renderla non-sticky da `lg`): `Genera piano (shuffle)` (primary) + `Crea piano manuale` (outline), labels invariati.
4. L'info box "Come usare il pianificatore" (:420-436) diventa un disclosure `Come funziona?` collassato in coda al setup (declutter; il contenuto attuale resta).

#### 4.6.3 Calendario

- **`PlanStructureCard` integrata**: non più due card sempre aperte sopra la griglia (:469-478) ma un'unica sezione collassabile `Giorni e portate del piano` (chip attuali + add/remove, logica e ConfirmDialog invariati, PlanStructureCard.tsx:46-261) chiusa di default, con riepilogo compatto nell'intestazione (`7 giorni · Pranzo e Cena`). La griglia guadagna la prima posizione visiva.
- **Griglia desktop**: layout attuale conservato (`88px repeat(n, minmax(150px,1fr))` + `overflow-x-auto`, righe in ordine `sortMealTypes`); enfasi "oggi" invariata (:126). Con 5 portate attive le righe diventano 5: nessuna modifica strutturale necessaria (scroll verticale di `<main>`).
- **Griglia mobile portrait**: card giorno impilate invariata; al mount **auto-scroll alla card di oggi** (`scrollIntoView({ block: 'start' })` guardato da ref one-time) se la settimana è quella corrente.
- **Badge kcal/pers. per giorno**: §4.3.5.
- **Badge varianti sulla cella** (`MealSlotCell`): sotto il titolo della ricetta base, fila di chip compatti — uno per variante — con l'**iniziale** del primo membro (o `+n` se la variante copre più membri), es. `S` `M+1`; `title` = `${labels}: ${recipeTitle}`; membro orfano → chip `?` con title `Componente rimosso`. Max 3 chip + `+n` overflow. Stile: `rounded-full bg-secondary text-[10px] text-muted-foreground h-4 min-w-4 px-1` — niente terracotta (il timbro resta su selezione/azioni). I chip non sono interattivi (tutta la cella apre l'editor); sono sempre visibili, mai hover-only.
- La cella **non** mostra il numero persone (vive nell'editor e nel calcolo kcal): tenere le celle calme, l'informazione differenziale sono le varianti.
- **"Ricette da rivedere"** (slot `newRecipe` legacy, :501-524): sezione invariata.

#### 4.6.4 Empty state della griglia

Piano manuale appena creato (0 slot pieni): sopra la griglia una riga informativa (`StatusBanner` info): `Tocca una cella per scegliere la ricetta. Con ↺ ti propongo un'alternativa dal ricettario.` Mostrata finché `plan.slots.length === 0`.

#### 4.6.5 Dead code `generating` / `EditorialLoader`

**Rimozione** (non riuso): la generazione è locale e sincrona (`buildShuffledSlots`, nessuna rete) — un loader a schermo intero per <50 ms sarebbe un flash dannoso. Rimuovere: il membro `'generating'` da `PlannerStep` (useMealPlanner.ts:38), il blocco :456-464 di page.tsx e l'import `EditorialLoader` (page.tsx:22) se non riusato altrove nella pagina. `isGenerating` resta per disabilitare i CTA (:449, PlannerHeader).

### 4.7 Edge case ed errori (uno per uno)

1. **Piano legacy intatto**: `servingsPlanned == null` e `variants == null` su tutti gli slot → `buildContributions` byte-identico a oggi, `computeDayCalories.total` identico a oggi, celle senza chip. Test dedicati.
2. **Profilo famiglia assente/vuoto**: `defaultServingsPlanned = 2`; stepper funzionante; sezione varianti disabilitata con link al profilo (§4.5.4a). Il piano resta pienamente usabile.
3. **Membro senza label**: fallback `Componente N` (indice 1-based nell'array membri normalizzato), coerente con family-context.ts:55. Iniziale chip = `C`+N? No: iniziale = prima lettera della label risolta (quindi `C` per i fallback) — accettare l'ambiguità, il `title` disambigua.
4. **Membro eliminato dal profilo (variante orfana)**: §4.5.5.
5. **Varianti coprono ≥ servingsPlanned**: base a 0 persone → nessun contributo base in lista; warning nell'editor (§4.5.3). `Math.max(0, …)` impedisce fattori negativi.
6. **Ricetta variante cancellata dal ricettario**: contributi spesa skippati (come per la base, aggregator :31); kcal del membro → `isPartial`; cella: chip resta (title col titolo denormalizzato); editor: riga variante con titolo denormalizzato + hint di modifica.
7. **`recipe.servings` 0/undefined**: fallback 4 (`recipe.servings || 4`), identico a cooking mode. `scaleQuantity` con base ≤ 0 ritornerebbe comunque la stringa invariata (doppia rete).
8. **Quantità non scalabili** (`q.b.`, `a piacere`, `un pizzico`): passano invariate da `scaleQuantity` (ingredient-scaler.ts:43-47) e continuano a finire nel fallback `" + "` di `mergeQuantities`. Nessun cambiamento atteso nei test esistenti su questi casi.
9. **`servingsPlanned === recipe.servings`**: `scaleQuantity` ritorna la stringa originale (nessuna riformattazione `1/2 → 0,5` spuria).
10. **Slot `newRecipe` legacy con `servingsPlanned` impostato** (possibile dopo un'edit persone su slot AI legacy): scaling su `slot.newRecipe.servings || 4` — il ramo base dell'aggregatore gestisce entrambe le fonti.
11. **Stepper spam**: debounce 600 ms + flush su chiusura/unmount; la scrittura è comunque idempotente (full-array).
12. **Errore Firestore su scrittura slot**: pattern esistente — stato ottimistico già applicato, toast di errore (`toast.error`), nessun rollback automatico (coerente con updateSlot attuale).
13. **Due dispositivi**: last-write-wins sull'intero array slots (comportamento esistente, invariato e documentato in AGENTS).
14. **Ordine portate con piani vecchi**: righe della griglia via `sortMealTypes` (Spec A) — i tipi legacy (`primo`…) in coda, rendering garantito da `MEAL_LABELS` esaustivo.

---

## 5. Piano di implementazione a fasi

Ogni fase lascia il progetto compilabile (`npx tsc --noEmit` verde).

**Fase 1 — Modello dati + scaling + kcal (nessuna UI nuova, comportamento legacy invariato)**
- `src/types/index.ts`: `MealSlotVariant`, campi `servingsPlanned`/`variants` su `MealSlot` (con doc-comment dell'invariante legacy).
- `src/lib/utils/ingredient-aggregator.ts`: scaling in `buildContributions` (§4.2), import `scaleQuantity`.
- `src/lib/hooks/useShoppingList.ts`: batch fetch esteso alle ricette delle varianti (§4.2).
- `src/lib/utils/meal-plan-calories.ts`: nuovi tipi e firme (§4.3), `readVariantCalories`.
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: adattamento minimo alla nuova firma (`members` prop, default `[]`; label badge → `kcal/pers.`), senza redesign.
- `src/app/(dashboard)/pianificatore/page.tsx`: passa `members={[]}` provvisorio (o risolve già `useFamilyProfile` — a scelta, purché compili).
- Test: aggiornare/estendere `ingredient-aggregator.test.ts` e `meal-plan-calories.test.ts` (§6).

**Fase 2 — Mutazioni hook + shuffle + famiglia nel planner**
- `src/lib/hooks/useMealPlanner.ts`: `setSlotServings`, `setSlotVariants`, preservazione campi in `updateSlot`/`reshuffleSlot`, `defaultServingsPlanned` via `useFamilyProfile`, rimozione `'generating'` da `PlannerStep`, fix dep array `reshuffleSlot`.
- `src/lib/utils/meal-plan-shuffle.ts`: `ShuffleConfig.defaultServingsPlanned`, slot con `servingsPlanned`/`variants`.
- `src/types/index.ts`: `MealPlanSetupConfig.defaultServingsPlanned?: number | null`.
- `src/app/(dashboard)/pianificatore/page.tsx`: risoluzione `members` (useFamilyProfile + normalizeFamilyProfile + fallback label) e rimozione del blocco `generating` (:455-464) con l'import `EditorialLoader`.
- Test: `meal-plan-shuffle.test.ts` (default sui nuovi slot).

**Fase 3 — UI varianti**
- Nuovi `src/components/meal-planner/RecipePickerPanel.tsx` (estratto da RecipePickerSheet) e `src/components/meal-planner/MealSlotEditorSheet.tsx` (§4.5); eliminazione `RecipePickerSheet.tsx`; wiring in `page.tsx`.
- `src/components/meal-planner/MealSlotCell.tsx`: chip varianti (§4.6.3).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: passaggio dati varianti/membri alle celle.

**Fase 4 — Redesign pagina (con skill impeccable: direction prima, review dopo)**
- `src/components/meal-planner/PlannerHeader.tsx`: riga unica + `Oggi` (§4.6.1).
- `src/components/meal-planner/MealPlanSetupForm.tsx`: card progressive + campo persone + disclosure regole (§4.6.2).
- `src/components/meal-planner/PlanStructureCard.tsx`: variante collassabile con riepilogo (§4.6.3).
- `src/app/(dashboard)/pianificatore/page.tsx`: empty state, disclosure "Come funziona?", StatusBanner griglia vuota, auto-scroll a oggi (in `WeeklyCalendarGrid`).
- `src/components/meal-planner/WeeklyCalendarGrid.tsx`: dettaglio kcal per-membro (tooltip lg / espansione mobile).

**Fase 5 — Chiusura**
- `npx next build --webpack`; suite Jest completa; aggiornamento CLAUDE.md (Recent Changes + sezione "Critical Patterns" se serve), AGENTS.md (eventuali gotcha emersi), checklist `specs/00-roadmap.md`; proposta di collaudo guidato (§6.2).

---

## 6. Piano di test

### 6.1 Unit test (Jest — comando reale: `npm test`, script `"test": "jest"` in package.json)

**`src/lib/utils/ingredient-aggregator.test.ts`** (esteso; l'helper `contribution()` esistente resta per `aggregateIngredients`; per `buildContributions` servono fixture `makePlan`/`makeSlot`/`makeRecipe` sul modello di meal-plan-calories.test.ts:5-49):
- slot legacy (`servingsPlanned` assente): quantità identiche all'input, byte-per-byte (invariante §1);
- `servingsPlanned: 2`, `recipe.servings: 4`, "200 g" → "100 g";
- `recipe.servings` assente → fallback 4 (`servingsPlanned: 8`, "200 g" → "400 g");
- `q.b.` invariato sotto scaling;
- variante: contribuisce con la propria ricetta scalata a `memberIds.length` persone e `recipeTitle` proprio;
- base a 0 persone (varianti ≥ servingsPlanned): nessun contributo base, sì contributi variante;
- ricetta variante mancante da `recipesById`: skip senza throw;
- `servingsPlanned === recipe.servings`: stringa quantità invariata (nessuna riformattazione).

**`src/lib/utils/meal-plan-calories.test.ts`** (esteso):
- piani senza varianti: `total` identico ai valori attesi attuali (i test esistenti si aggiornano solo nella forma, non nei numeri);
- giorno con variante: `memberDeltas` con totale corretto (variante negli slot coperti, base altrove) e label fallback `Componente N`;
- membro orfano (id non in `members`): assente da `memberDeltas`;
- variante senza stima kcal: `isPartial` sul membro, base non contaminata;
- `members: []`: `memberDeltas` sempre `[]`.

**`src/lib/utils/meal-plan-shuffle.test.ts`** (esteso):
- `defaultServingsPlanned: 3` → ogni slot generato ha `servingsPlanned: 3` e `variants: null`;
- config senza il campo → slot con `servingsPlanned: null` (compat).

### 6.2 Collaudo guidato (protocollo in memoria + sezione "Guided testing tooling" di CLAUDE.md)

`npm run emulators` + `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` + script Playwright usa-e-getta in `e2e/scratch/` (gitignored, eliminati a fine collaudo). Dati preparati da script throwaway con spy word (es. ricette "SPY-Carbonara" con `servings: 4` e quantità note "400 g spaghetti"). Fasi (una per messaggio, esito atteso dichiarato prima):
1. **Seed**: utente emulato + profilo famiglia (3 membri: "Marco" 40, "Sofia" 8, uno senza label) + 6 ricette con servings/kcal noti + un piano **legacy** scritto direttamente in Firestore senza i campi nuovi.
2. **Invariante legacy**: aprire `/lista-spesa` della settimana legacy → asserire quantità identiche al seed (nessuno scaling).
3. **Nuovo piano**: setup con persone=3, shuffle → asserire su Firestore `servingsPlanned: 3` su ogni slot; lista spesa scalata 3/4 rispetto al seed.
4. **Varianti**: aprire editor slot, aggiungere variante Sofia → ricetta B; asserire `variants` su Firestore (id, memberIds, recipeId, titolo), lista spesa con base a 2 persone + contributi ricetta B a 1 persona; chip `S` visibile nella cella.
5. **Kcal**: asserire badge `kcal/pers.` col valore base e dettaglio membro (tooltip/espansione) per Sofia.
6. **Re-roll e copia**: ↺ sullo slot con variante → base cambiata, variante intatta; copia piano su altra settimana → campi copiati.
7. **Orfano**: rimuovere Sofia dal profilo → chip `Componente rimosso`, lista spesa invariata.

---

## 7. Gotcha e vincoli (pertinenti, da AGENTS.md/CLAUDE.md)

- **Mai `undefined` su Firestore** (AGENTS Quick Ref "Firebase optional"): `servingsPlanned`/`variants` → `null` o chiave omessa; attenzione al pattern filter+push di updateSlot/reshuffleSlot che ricostruisce gli oggetti slot.
- **Slot orfani** (AGENTS "Slot orfani dopo la rimozione di una portata"): `buildContributions` itera tutti gli slot; ogni mutazione che toglie giorni/portate deve cancellare gli slot nella stessa scrittura — le varianti vivono dentro lo slot, quindi seguono gratis, ma non introdurre mai varianti fuori dallo slot.
- **Lista spesa stale dopo modifica al piano** (AGENTS): ogni nuova mutazione (`setSlotServings`, `setSlotVariants`) chiama `invalidateShoppingList()`; chiave parziale senza `weekStartDate` per coprire `copyPlanToWeek`.
- **Debounce non-flushed** (AGENTS "Shopping list debounce non-flushed" + "Nuovo target di persistenza dimenticato nel flush"): il debounce dello stepper persone nello sheet vuole il proprio timer/ref **e** flush su chiusura sheet/unmount, leggendo da un ref (no stale closure). Qui non si tocca `flushAll` di `useShoppingList` (nessun nuovo campo persistito da quel hook), ma il principio è identico.
- **`enabled: !!user`** su ogni query auth-bound (già rispettato da `useFamilyProfile`); **niente `onSnapshot`**.
- **`ConfirmDialog` per azioni distruttive multi-slot** (elimina piano/giorno/portata — già esistenti); mai `confirm()`/`alert()`; feedback via `react-hot-toast`.
- **Controlli mai solo `group-hover` sotto `lg`** (AGENTS "Azione nascosta in group-hover su touch"): chip varianti sempre visibili; eventuali azioni hover-reveal solo da `lg` col pattern di MealSlotCell.tsx:111; `aria-label` sempre.
- **`max-lg:portrait:`** (mai `portrait:` nudo); griglia con `minmax(72px+, 1fr)` + `overflow-x-auto`; **niente `position: sticky` dentro `.shell-stage`** su desktop ≥1440px (app-shell con scroll interno di `<main>`) — la barra CTA sticky del setup va verificata su desktop.
- **Pagine senza padding esterno proprio**; pianificatore `max-w-[1200px] mx-auto`, sotto-pannelli form `max-w-lg mx-auto` (AGENTS §6 "Layout max-width").
- **Token semantici** (`bg-background`/`bg-card`/`text-foreground`/`border-border`), mai `bg-white`; elementi nativi (`select`, `input`) con `bg-background text-foreground` espliciti; niente scale OKLCH inesistenti (`bg-primary/10`, non `bg-primary-100`); **side-stripe ban**; collapse con `grid-rows-[0fr]→[1fr]` + `motion-reduce:transition-none`, mai `max-h`.
- **`useState(prop)` non reagisce ai cambi** → `useEffect` di sync per il draft dello stepper nello sheet (pattern già in ServingsStepper:47-49).
- **YYYY-MM-DD parsing**: sempre `new Date(dateStr + 'T00:00:00')` (già rispettato in page.tsx/PlannerHeader); `isToday` con confronto locale.
- **Identità slot `${dayIndex}-${mealType}` intatta**: nessuna nuova chiave, nessuno slot multiplo per pasto.
- **kcal**: `caloriesPerServing` sempre per porzione, mai totali (AGENTS "kcal totali invece che per porzione"); il planner mostra `≥` sui parziali, mai somme parziali non marcate; kcal **escluse dalla lista spesa** (CLAUDE.md).
- **staleTime `familyProfile` 5 min**: il `defaultServingsPlanned` può ritardare fino a 5 min dopo un'edit del profilo — accettato e documentato (§4.1).
- Nessuna route AI toccata: i vincoli su schema JSON/parametri Sonnet 5 non si applicano a questa spec.

---

## 8. Fuori scope

- **Griglia completa per membro** (esclusa dalla decisione di prodotto 5) e varianti con `newRecipe`/AI inline.
- Scaling della lista **ad-hoc** "Voglio preparare questo" (quantità copiate as-is per design, types/index.ts:491-495) e qualsiasi modifica a `aggregateIngredients`/`mergeQuantities`/chiavi canoniche.
- Migrazione batch dei piani esistenti (dual-read lazy).
- Preferenze/diete per membro (il profilo famiglia resta label+età+note).
- Persistenza delle regole di generazione per-portata sul piano (restano setup-only, §4.6.2).
- kcal nella lista della spesa; `confidence` delle stime; macro se Spec C non è implementata (solo punto di estensione §4.3.4).
- Modifiche a cooking mode, `estimate-calories`, prompt AI, regole/indici Firestore (i campi nuovi vivono in documenti esistenti coperti dalle regole owner-based).
- Enforcement server-side di "un piano per settimana" (resta client-side come oggi).

---

## 9. Prompt di implementazione

```markdown
Implementa la Spec F del progetto "Il Mio Ricettario" (piano famiglia + redesign pianificatore).

PREPARAZIONE (obbligatoria, nell'ordine):
1. Leggi e applica CLAUDE.md, AGENTS.md, COMMENTS.md e DEVELOPMENT_GUIDELINES.md nella root del repo.
2. Leggi PER INTERO specs/00-roadmap.md (contratti vincolanti 1, 4, 5) e specs/spec-f-piano-famiglia-redesign.md: la spec è il tuo mandato, il roadmap prevale in caso di conflitto.
3. Verifica nella checklist del roadmap che la Spec A sia completata (sortMealTypes, spuntino/merenda): è una dipendenza obbligatoria. Verifica se la Spec C è completata: decide il punto di estensione macro (§4.3.4 della spec).
4. Crea il branch feature/family-meal-plan da develop.

IMPLEMENTAZIONE:
- Procedi fase per fase secondo §5 della spec (1: modello+scaling+kcal dietro comportamento legacy; 2: mutazioni hook+shuffle+famiglia; 3: UI varianti; 4: redesign pagina; 5: chiusura). Dopo OGNI fase esegui `npx tsc --noEmit` e correggi prima di proseguire.
- L'invariante di retro-compatibilità è sacro: slot con servingsPlanned == null → nessuno scaling, quantità as-is. Scrivi i test che lo dimostrano PRIMA di rifinire il resto.
- Per la FASE 4 (redesign) DEVI caricare la skill `impeccable`: usala prima per la direction del redesign (architettura in §4.6 della spec come base) e poi per la review finale delle schermate. Rispetta DESIGN.md "Carta e Terracotta" (timbro terracotta ≤10%, niente card annidate, token semantici).
- Mai `undefined` verso Firestore; ogni mutazione del piano chiama invalidateShoppingList(); nessun onSnapshot; ConfirmDialog per le azioni distruttive multi-slot.

VERIFICA:
- Test unit: `npm test` (script reale in package.json: "test": "jest"). Aggiorna/estendi ingredient-aggregator.test.ts, meal-plan-calories.test.ts, meal-plan-shuffle.test.ts come da §6.1.
- Build finale: `npx next build --webpack`. Se fallisce con `spawn EPERM` nel sandbox, rilanciala fuori sandbox prima di indagare il codice.

CHIUSURA:
- Aggiorna CLAUDE.md (sezione "Recent Changes" + pattern critici se emersi), AGENTS.md (nuovi gotcha SOLO se hanno costato debug reale) e spunta la Spec F nella checklist di specs/00-roadmap.md.
- NON committare MAI senza OK esplicito dell'utente (regola di sessione: un branch/commit a sessione).
- Al termine proponi un collaudo guidato fase-per-fase con emulatori Firebase + Playwright (script usa-e-getta in e2e/scratch/, spy words nei dati di seed, un fase per messaggio con esito atteso dichiarato prima), seguendo §6.2 della spec e la sezione "Guided testing tooling" di CLAUDE.md.
```

---

## 10. Modello e effort consigliati

**Fable (o Opus) · effort xhigh + skill impeccable per il redesign — modello dati con back-compat delicata e redesign completo di pagina.** L'invariante legacy sullo scaling e il rifacimento UI a più superfici richiedono il massimo livello di ragionamento e una direction visiva dedicata.
