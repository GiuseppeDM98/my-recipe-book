# Roadmap specifiche — brainstorming 2026-08-12

> Esito della sessione di pianificazione sulle note di miglioramento dell'app.
> Questo file è il **contratto condiviso** tra le sei specifiche in questa cartella:
> le decisioni di prodotto e le interfacce cross-spec definite qui **prevalgono**
> in caso di conflitto con le singole spec. Ogni spec va letta insieme a questo file.

## Le sei specifiche

| ID | File | Note coperte | Dipende da | Taglia | Modello / effort consigliato |
|----|------|--------------|------------|--------|------------------------------|
| A | `spec-a-portate-ordinamento-spuntini.md` | 4 (ordinamento portate), 7 (spuntini) | — | S | Sonnet · medium |
| B | `spec-b-sezioni-ai.md` | 8 (sezioni ingredienti/procedimento AI + riorganizza esistenti) | — | M | Opus · high |
| C | `spec-c-nutrizione.md` | 2 (kcal/100g, peso porzione), 5 (macronutrienti) | — | M | Sonnet · high |
| D | `spec-d-dispensa-matching.md` | 1 (banali, spunta→dispensa, doppioni, scalo cottura, matching) | — | L | Opus · xhigh |
| E | `spec-e-lista-spesa-reparti.md` | 6 (raggruppamento per reparto) | D | M | Sonnet · high |
| F | `spec-f-piano-famiglia-redesign.md` | 3 (piano per famiglia + redesign UI pianificatore) | A, (C per macro nel planner) | XL | Fable/Opus · xhigh + skill impeccable |

**Ordine di implementazione consigliato: A → B → C → D → E → F.**

Rationale: A è un quick-win che sblocca l'ordine canonico usato da F; B e C sono
indipendenti e di valore immediato; D costruisce il motore di matching che E
riusa per la classificazione; F ridisegna la UI del pianificatore una volta sola,
sul modello dati finale (portate di A, macro di C).

Una spec = un branch = un ciclo di lavoro (regola di sessione: un branch/commit
per sessione, nessun commit senza OK esplicito).

## Decisioni di prodotto (confermate dall'utente)

1. **Matching ingredienti ↔ dispensa — ibrido**: match automatico conservativo
   sulla chiave canonica esistente (accenti + singolare/plurale); nei casi
   incerti l'app propone e l'utente conferma una volta; la conferma diventa un
   **alias persistente sulla voce di dispensa** e vale per sempre, sia per la
   lista della spesa sia per lo scalo a fine cottura.
2. **Spunta → dispensa — batch a fine spesa**: si spunta senza interruzioni; un
   bottone "Aggiungi alla dispensa" apre un flusso unico con tutti gli articoli
   spuntati, ciascuno con posizione/quantità/scadenza precompilate e modificabili.
3. **Ingredienti banali e doppioni**: lista fissa curata (acqua, acqua di
   cottura, ghiaccio…) **mai** mostrata in lista; ingredienti matchati in
   dispensa con scorta sufficiente → sezione collassata **"Hai già in casa"**,
   re-includibili con un tap. Match non quantificabile (unità non confrontabili)
   → l'articolo resta in lista con badge informativo ("in dispensa: 500 g").
4. **Reparti supermercato**: si riusa ed estende la tassonomia delle categorie
   dispensa (`PANTRY_CATEGORIES`) come tassonomia unica di dispensa e lista spesa.
5. **Piano famiglia — pasto base + varianti**: ogni slot ha una ricetta default
   per tutta la famiglia; dove serve si aggiunge una variante per uno o più
   membri specifici. Niente griglia completa per membro.
6. **La lista della spesa scala per persone**: ogni slot sa per quante persone
   si cucina; le quantità scalano col rapporto persone/porzioni-base tramite
   `scaleQuantity()` (già esistente). Le kcal giornaliere del planner diventano
   per-persona.
7. **Nutrizione — copertura completa**: dettaglio ricetta (riga nutrizionale:
   kcal/porz, ≈ peso porzione, kcal/100g, P/C/G), form (campi manuali), planner
   (totali giornalieri kcal + macro).
8. **Etichette spuntini**: `Spuntino` (metà mattina) e `Merenda` (pomeriggio).

## Contratti cross-spec (vincolanti)

### 1. Ordine canonico delle portate (definito da Spec A, consumato da F)

- `MealType` (src/types/index.ts) si estende con i valori **`'spuntino'`** e
  **`'merenda'`**.
- `SELECTABLE_MEAL_TYPES = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena']`
  (src/lib/constants/meal-types.ts) — è anche l'ordine canonico.
- Nuovo helper esportato da `meal-types.ts`:
  `sortMealTypes(types: MealType[]): MealType[]` — ordina per indice in
  `SELECTABLE_MEAL_TYPES`; i tipi legacy (`primo`, `secondo`, `contorno`,
  `dolce`) vanno in coda in ordine stabile.
- `sortMealTypes` si applica **sia in scrittura** (`addMealType` in
  useMealPlanner, `toggleMealType` in MealPlanSetupForm) **sia in lettura**
  (WeeklyCalendarGrid, PlanStructureCard, MealPlanSetupForm), così i piani
  esistenti con ordine sbagliato si auto-correggono senza migrazione.

### 2. Motore di matching ingredienti (definito da Spec D, consumato da E)

- Nuovo modulo **`src/lib/utils/ingredient-matching.ts`** che esporta almeno:
  - `canonicalIngredientKey(name: string): string` — spostata (o ri-esportata)
    da `ingredient-aggregator.ts`, oggi privata.
  - `isTrivialIngredient(name: string): boolean` — lista fissa curata su chiavi
    canoniche (acqua, acqua di cottura, acqua fredda/calda/tiepida, ghiaccio…).
  - `matchIngredientToPantry(name, pantryItems): { item: PantryItem; confidence: 'exact' | 'alias' } | { item: null; suggestions: PantryItem[] }`
    — exact = stessa chiave canonica; alias = chiave presente in `item.aliases`;
    suggestions = candidati fuzzy da proporre per conferma manuale.
- `PantryItem` guadagna **`aliases?: string[]`** (chiavi canoniche confermate
  dall'utente). Nessuna nuova collection: il campo vive sul documento
  `pantry_items` esistente.
- `parseQuantity` / conversioni unità di `ingredient-aggregator.ts` diventano
  esportate e riusabili (dimensioni massa/volume/count, alias unità italiani).
- Filosofia invariata: **il non-match è il fallimento sicuro**; un falso
  "già in dispensa" è peggio di un falso negativo.

### 3. Tassonomia reparti (definita da Spec E)

- `PANTRY_CATEGORIES` (src/lib/utils/pantry-utils.ts) si estende con
  `surgelati`, `panetteria` e `altro` (fallback esplicito), mantenendo i 10 slug
  esistenti e i colori OKLCH terrosi.
- Classificazione di un articolo di lista, in ordine di precedenza:
  1. `categoryId` della voce dispensa matchata (via contratto 2);
  2. override manuale dell'utente (`users/{uid}.ingredientDepartmentOverrides`,
     mappa `chiaveCanonica → categoryId`);
  3. dizionario statico curato `src/lib/utils/ingredient-departments.ts`
     (chiave canonica → slug categoria, ~200–400 ingredienti comuni italiani);
  4. fallback `altro`.
- La lista spesa ha un toggle di vista **"Per reparto" / "Per ricetta"**
  (default: reparto); la vista per-ricetta conserva il layout attuale.

### 4. Nutrizione per-porzione (definita da Spec C, consumata da F)

- `Recipe` (e **entrambe** le dichiarazioni di `ParsedRecipe`) guadagnano:
  - `servingWeightGrams?: number` — peso stimato di UNA porzione;
  - `macrosPerServing?: { proteinGrams: number; carbsGrams: number; fatGrams: number }`.
- Invariante identico a `caloriesPerServing`: **si persiste solo il valore
  per-porzione**, mai totali; kcal/100g si deriva a render time
  (`caloriesPerServing / servingWeightGrams * 100`). Nessun campo derivato salvato.
- `/api/estimate-calories` si estende (stessa singola chiamata AI): il modello
  stima peso totale + macro; il server deriva i per-porzione, applica clamp di
  plausibilità in stile MIN/MAX_PLAUSIBLE_KCAL e il sanity check
  `4·prot + 4·carb + 9·grassi ≈ kcal` (tolleranza definita nella spec); i vincoli
  numerici stanno nel prompt + clamp server, MAI nello schema JSON
  (minimum/maximum non supportati → 400).

### 5. Modello famiglia sul piano (definito da Spec F)

- L'identità dello slot resta la coppia `(dayIndex, mealType)` — non si rompe.
- `MealSlot` guadagna:
  - `servingsPlanned?: number | null` — persone **totali** servite dallo slot
    (default: numero membri del `familyProfile`, fallback 2); il pasto base copre
    `servingsPlanned` meno le persone coperte da varianti (clamp a 0);
  - `variants?: MealSlotVariant[] | null` con
    `MealSlotVariant = { id: string; memberIds: string[]; existingRecipeId: string | null; recipeTitle: string | null }`
    — il pasto base copre i membri non coperti da varianti.
- Lista spesa: fattore di scala per contributo =
  `personeServite / (recipe.servings || 4)` applicato con `scaleQuantity()`.
- Calorie planner: totali giornalieri **per persona** (base + varianti risolte
  per membro), macro incluse se Spec C è già implementata.

### 6. Sezioni ricetta (definite da Spec B)

- Parser: la regex delle sezioni si amplia per catturare **qualsiasi** nome dopo
  `## Ingredienti ` / `## Procedimento ` (con e senza "per"), preservando il
  comportamento `## Ingredienti` nudo → sezione null.
- Prompt: `chat-recipe` e `format-recipe` guadagnano una regola **prescrittiva**
  ("se il piatto ha componenti logicamente distinte DEVI creare sezioni");
  `extract-recipes` resta fedele alla fonte (non inventa sezioni).
- Ordinamento: le sezioni ingredienti si mostrano in **ordine di prima
  apparizione** nell'array (niente più sort alfabetico); il fallback degli step
  senza `sectionOrder` diventa anch'esso l'ordine di prima apparizione.
- Nuova route **`POST /api/reorganize-recipe`**: riceve la ricetta strutturata
  (id + testi), restituisce **solo l'assegnazione delle sezioni** keyed sugli id
  esistenti (`ingredientId → section`, `stepId → section + sectionOrder`).
  Non tocca testi né id: nessun rischio per sessioni di cottura attive o token
  `{{qty:ingredientId}}`.

## Micro-fix inclusi nelle spec (per non perderli)

- Il bottone "Aggiungi articolo" della lista spesa è gated su `hasPlan`: va reso
  disponibile anche senza piano settimanale (persistenza localStorage già
  esistente) → incluso in Spec D.
- `PantryItemQuickSheet`: delete senza ConfirmDialog (viola la regola di
  progetto) e azione "Consumato" che decrementa sempre di 1 anche su unità g/ml
  → sistemati in Spec D.
- Stub morti della dispensa (tab "Da lista spesa", azione "Aggiungi a lista",
  handler desktop mai wired) → riempiti o rimossi da Spec D.
- Il blocco `EditorialLoader` dello step 'generating' del pianificatore è dead
  code (nessuno setta `step='generating'`) → riusato o rimosso da Spec F.

## Stato

- [x] Spec A — implementata (2026-08-24)
- [ ] Spec B — da implementare
- [ ] Spec C — da implementare
- [ ] Spec D — da implementare
- [ ] Spec E — da implementare
- [ ] Spec F — da implementare

Aggiornare questa checklist (e "Recent Changes" in CLAUDE.md) a ogni spec completata.
