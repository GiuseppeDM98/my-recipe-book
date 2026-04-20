# AI Agent Guidelines - Il Mio Ricettario

**Focus**: solo gotcha che possono causare debug >30min. Per contesto architetturale: [CLAUDE.md](CLAUDE.md)

---

## Quick Reference

| Gotcha | Problema | Soluzione |
|--------|----------|-----------|
| Orientation classes | `portrait:` applica anche a desktop | Usare `max-lg:portrait:` |
| Firebase optional | `undefined` causa errori silenziosi | Usare `null` |
| Firestore composite index | query `where + orderBy` fallisce o rompe in runtime | Aggiungere indice in `firebase/firestore.indexes.json` e deployare |
| Firestore deploy drift | Rules/indexes aggiornati nel repo ma non in Firebase | Eseguire `firebase deploy --only firestore` |
| Cooking sessions | Duplicate se create in `useEffect` | Usare setup screen pattern |
| Cooking history | Statistiche vuote se si esce senza CTA finale | Registrare completamento solo da `Termina cottura` |
| Quantity format | Frazioni confuse (`1 1/2`) | Decimali (`1,5`) |
| useState prop | `useState(prop)` non reagisce ai cambi | Aggiungere `useEffect` di sync |
| AI route auth | Route AI protette falliscono con `401` | Inviare sempre `Authorization: Bearer <idToken>` con token aggiornato |
| Firebase Admin env | AI route protette falliscono anche con utente loggato | Configurare credenziali Firebase Admin lato server, non bastano le `NEXT_PUBLIC_FIREBASE_*` |
| Firebase Admin base64 | `FIREBASE_ADMIN_CREDENTIALS_BASE64` sembra valida ma il bootstrap fallisce | Il JSON service account usa chiavi snake_case (`project_id`, `client_email`, `private_key`) |
| Docker env | `docker compose` non legge `.env.local` | Usare `docker compose --env-file .env.local ...` |
| Local week dates | `toISOString().slice(0, 10)` slitta di giorno in `Europe/Rome` | Usare formatter locale (`formatLocalDate`, `getWeekMonday`) |
| Dynamic step quantities | Quantita' negli step restano statiche o finiscono disallineate | Usare token `{{qty:ingredientId}}` risolti a runtime |
| AI quantity references | L'AI non conosce gli `ingredientId` finali | Far emettere `[ING:n]` e `[QTY:n]`, poi convertirli nel parser |
| Family profile persistence | Si pensa di dover deployare rules o creare una collection nuova | Salvare in `users/{uid}.familyProfile`; le rules owner-based esistenti bastano |
| Family context scope | Il contesto famiglia altera flussi che devono restare fedeli all'input | Usarlo solo nei flussi generativi/adattivi (`chat`, `testo libero`, `pianificatore`), NON in `Carica PDF` |
| Planner stagione soft | Il selettore stagione non vincola le ricette esistenti se non filtrate | Filtrare server-side per stagione prima di inviare a Claude (fallback se < 5 ricette) |
| Planner ingredienti mancanti | Vincoli dietetici ignorati su ricette esistenti | Includere `ingredientNames` nel summary, non solo il conteggio |
| Collapsible auto-close mount | `prevCheckedRef = useRef([])` triggera auto-close di sezioni già complete al mount | Inizializzare `prevCheckedRef` con il valore corrente di `checked*`, non con `[]` |
| Collapsible always-render counter | IIFE "reserve numbers" rimane dopo aver tolto il conditional render → doppio conteggio | Rimuovere il blocco IIFE reserve quando il contenuto diventa sempre renderizzato |
| isToday timezone | Confronto con timestamp slitta di giorno in `Europe/Rome` | Usare `getFullYear()/getMonth()/getDate()` (locale), non timestamp |
| React Query + user null | Query eseguita prima che l'auth sia pronta | Aggiungere sempre `enabled: !!user` (e `!!recipeId` dove serve) |
| React Query DevTools | L'icona non appare pur avendo QueryClientProvider | Serve il package separato `@tanstack/react-query-devtools` |
| React Query + useEffect init | Cache revalidation ri-esegue `useEffect([recipe])` | Usare un ref `sessionInitialized` per guard one-time init |
| Step duration max | Browser validation error su step con molte ore | Usare `max={9999}` non `max={999}` — 24h = 1440 min |
| Timer multipli | Singolo `setInterval` + singolo stato non supporta parallelo | Usare `Map<stepId, setInterval>` in un ref + `Record<stepId, secondsLeft>` nello stato |

---

## 1. Responsive Navigation

**Breakpoint `lg` = 1440px**.

```tsx
// ❌ SBAGLIATO
className="portrait:flex landscape:hidden"

// ✅ CORRETTO
className="max-lg:portrait:flex max-lg:landscape:hidden"
```

Pattern attivo:
- Desktop (≥1440px): sidebar sempre visibile
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sidebar drawer

Bottom nav su iOS: aggiungere `pb-safe`.

**Sticky button sopra la bottom nav:**
```tsx
// Rimane visibile durante lo scroll, si solleva sopra la bottom nav su mobile
<div className="sticky bottom-0 max-lg:portrait:bottom-20 bg-white border-t py-4 z-10 flex gap-4">
```

---

## 2. Firebase Patterns

### `null` vs `undefined`

Firebase rifiuta `undefined` in scrittura.

```ts
// ❌
{ servings: servings || undefined }

// ✅
{ servings: servings || null }
```

### Composite Index (CRITICAL)

Query con `where(...) + orderBy(...)` richiedono indice esplicito. Se l'errore e' catturato in un `catch` generico, lato UI puo' sembrare solo "nessun dato".

Indici oggi attivi da mantenere allineati nel repo:
- `categories`: `userId ASC`, `order ASC`
- `cooking_history`: `userId ASC`, `completedAt DESC`
- `cooking_sessions`: `userId ASC`, `lastUpdatedAt DESC`
- `meal_plans`: `userId ASC`, `weekStartDate DESC`
- `recipes`: `userId ASC`, `createdAt DESC`
- `subcategories`: `categoryId ASC`, `userId ASC`, `order ASC`

Quando cambi rules o indexes:

```bash
firebase deploy --only firestore
```

### Data Ownership

Ogni documento utente deve avere `userId` e ogni query deve filtrarlo.

```ts
query(collection(db, 'recipes'), where('userId', '==', userId))
```

### User Profile Extensions

Se aggiungi preferenze persistenti utente che non richiedono query dedicate, preferisci il documento esistente `users/{uid}` invece di aprire una nuova collection.

Pattern corretto per il profilo famiglia:
- storage: `users/{uid}.familyProfile`
- campi: `members`, `notes`
- campi opzionali persistiti: `null`, non `undefined`
- nessun deploy rules necessario se non cambi il modello di permessi

### Cooking History

Le statistiche non leggono da `cooking_sessions`.

Pattern corretto:
- `cooking_sessions`: stato effimero della sessione attiva
- `cooking_history`: evento append-only creato solo quando l'utente preme `Termina cottura`

Se la pagina statistiche mostra `Missing or insufficient permissions`, il primo sospetto e' quasi sempre: rules/indexes locali non ancora deployati.

---

## 3. React Query Patterns

### Regole base

```ts
// ✅ Query disabilitata finché l'auth non è pronta
useQuery({
  queryKey: ['recipes', user?.uid ?? ''],
  queryFn: () => getUserRecipes(user!.uid),
  enabled: !!user,
});

// ❌ NON usare onSnapshot — il progetto evita listener real-time per costi Firestore
```

### Query keys standard

| Key | Uso |
|-----|-----|
| `['recipes', uid]` | Lista ricette utente |
| `['recipe', id, uid]` | Singola ricetta (shared tra detail/edit/cooking) |
| `['categories', uid]` | Categorie |
| `['subcategories', uid, categoryIds[]]` | Subcategorie (dipende da categories) |
| `['cookingSessions', uid]` | Sessioni attive |
| `['familyProfile', uid]` | Profilo famiglia |
| `['shoppingList', uid, weekStartDate]` | Lista della spesa settimanale (derivata da MealPlan) |

Stale time: 2min globale, 5min per familyProfile.

### DevTools

**Il package è separato dal core**: `npm install @tanstack/react-query-devtools`. Senza di esso l'icona non appare anche con `QueryClientProvider` configurato.

### Guard per init one-time

React Query può revalidare la cache in background, ri-eseguendo `useEffect([recipe])`. Usare un ref per init che deve avvenire una volta sola:

```ts
const sessionInitialized = useRef(false);

useEffect(() => {
  if (!recipe || sessionInitialized.current) return;
  sessionInitialized.current = true;
  // init sessione cottura...
}, [recipe]);
```

---

## 4. React State Patterns

### `useState(prop)` non segue i cambi

```ts
// ❌
const [expanded, setExpanded] = useState(forceExpanded);

// ✅
const [expanded, setExpanded] = useState(forceExpanded);
useEffect(() => {
  if (forceExpanded) setExpanded(true);
}, [forceExpanded]);
```

### Viewed state vs loaded entity

Per entita' opzionali navigabili, non legare il contesto solo ai dati caricati.

```ts
// ❌
const viewedWeek = currentPlan?.weekStartDate;

// ✅
const viewedWeek = currentPlan?.weekStartDate ?? setupWeekStartDate;
```

---

## 5. Cooking Mode

### Setup Screen Pattern

Non creare sessioni in `useEffect`.

```ts
useEffect(() => {
  const session = await getCookingSession(recipeId, userId);
  setIsSetupMode(!session);
}, []);

const handleStart = () => createCookingSession(recipeId, userId, servings);
```

### Completion Pattern

Non auto-eliminare la sessione al 100%.

Pattern corretto:
- aggiornare checkbox ingredienti/step normalmente
- mostrare banner "Ricetta completata"
- chiudere esplicitamente con pulsante `Termina cottura`
- in quel momento: creare `cooking_history` + cancellare `cooking_session`

Questo evita che l'utente perda la sessione appena completa l'ultimo item e rende le statistiche affidabili.

### Timer Pattern (multipli in parallelo)

Non usare un singolo `setInterval` + un singolo stato per gestire più timer.

```ts
// ✅ Pattern corretto per timer multipli
const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
const [secondsMap, setSecondsMap] = useState<Record<string, number>>({});

// start: aggiunge/sovrascrive un timer per stepId
// stop(stepId): ferma un timer specifico
// timer.timers: Array<{stepId, secondsLeft}> per il render
```

Cleanup imprescindibile allo smontaggio:
```ts
useEffect(() => {
  return () => { intervalsRef.current.forEach(clearInterval); };
}, []);
```

### Section Auto-Close Pattern (collapsible lists)

Per rilevare la transizione "sezione appena completata" senza triggering al mount:

```ts
// ✅ Inizializzato con il valore corrente, non con []
const prevCheckedRef = useRef<string[]>(checkedIngredients);

useEffect(() => {
  if (!interactive) return;
  const newlyCompleted: string[] = [];
  groupedItems.forEach(group => {
    const ids = group.items.map(i => i.id);
    const wasComplete = ids.every(id => prevCheckedRef.current.includes(id));
    const isComplete = ids.every(id => checkedIngredients.includes(id));
    if (!wasComplete && isComplete) newlyCompleted.push(group.key);
  });
  if (newlyCompleted.length > 0) {
    setExpandedSections(prev => { const next = new Set(prev); newlyCompleted.forEach(k => next.delete(k)); return next; });
  }
  prevCheckedRef.current = checkedIngredients;
}, [checkedIngredients, interactive]);
```

Animazione collapse — sostituire `{isExpanded && <div>}` con div sempre renderizzato:

```tsx
<div className={cn(
  'overflow-hidden transition-all duration-300 ease-in-out',
  isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
)}>
```

⚠️ Se il componente aveva un blocco IIFE per "reserve step numbers" per le sezioni collassate, va **rimosso**: con render sempre attivo il counter si incrementa comunque e il blocco causa doppio conteggio.

### Italian Quantity Format

- `1,5 kg`, non `1.5 kg`
- no frazioni tipo `1/2`
- preservare range: `2-3` → `4-6`

---

## 6. Recipe Data Structure

Storage recipe:

```ts
interface Ingredient { id; name; quantity; section?: string | null; }
interface Step {
  id; order; description; section?: string | null;
  sectionOrder?: number | null;
  duration?: number | null; // minuti; null = nessun timer
}
```

### Step Duration — Regole

- Campo opzionale `duration?: number | null` — `null` = nessun timer
- Input form: `min={1}` `max={9999}` — 24h lievitazione = 1440 min; il limite 999 triggera un errore nativo del browser
- `extractStepDuration(raw)` è esportata da `recipe-parser.ts` e riutilizzata nel form (auto-detect) e nel parser
- Due passate: prima il token AI `[DUR:N]`, poi regex italiana (range → valore maggiore, ore+min, solo ore, solo min, secondi→min)

### AI Duration Token

Aggiungere a tutti i prompt AI nella sezione PROCEDIMENTO:
```
- Se uno step ha UN SOLO tempo di attesa o cottura chiaramente identificabile, aggiungi [DUR:N] alla fine dello step (N = minuti interi)
- Esempio CORRETTO: "Cuocere a fuoco medio per 10 minuti. [DUR:10]"
- NON aggiungere [DUR:] se il tempo è un range, ambiguo, o lo step contiene più tempi
```

Questo è consistente con `[ING:n]` e `[QTY:n]` già presenti.

### Dynamic Step Quantities

Se uno step deve seguire le porzioni, non salvare il numero statico nel testo finale.

Pattern corretto:
- storage step: token interno `{{qty:ingredientId}}`
- rendering dettaglio/cottura: risoluzione via utility, non parsing testo in UI
- ricette AI nuove: usare marker intermedi `[ING:n]` negli ingredienti e `[QTY:n]` negli step, poi convertire nel parser

Per ricette legacy:
- nessuna migrazione bulk
- usare il pulsante di adattamento automatico in modifica ricetta
- convertire solo match ad alta confidenza; i casi ambigui devono restare invariati

### `renderStepDescription` — name fallback

`renderStepDescription` controlla se le keyword del nome dell'ingrediente (`getIngredientKeywords` + `normalizeText`) sono presenti nel testo circostante. Se non lo sono, appende automaticamente `"di {simplifiedName}"` alla quantità — es. `"15 g di noci o mandorle"`.

Implicazioni pratiche:
- le ricette esistenti con token ma senza nome nel testo sono corrette al runtime, senza migrazione
- `simplifyIngredientName` rimuove le annotazioni parentetiche e porta in lowercase per uso mid-sentence
- il prompt AI richiede esplicitamente il nome nello step accanto a `[QTY:n]`; il fallback è la rete di sicurezza, non la norma
- la logica di keyword detection è condivisa con `adaptStepsToDynamicQuantities` — se cambi `getIngredientKeywords`, entrambi i flussi sono impattati

### AI Step Shape

Quando aggiorni prompt AI per ricette:
- ogni step deve rappresentare UNA sola azione principale o un solo riferimento quantita'
- se una frase contiene due quantita' distinte, spezzarla in due step

Questo riduce i casi ambigui nel collegamento automatico ingredienti ↔ step.

### Step Ordering

Nel form ricetta il riordino e' lineare globale, non per sezione.

Pattern corretto:
- spostare lo step nell'array
- rinormalizzare sempre `order` a `1..n`
- lasciare invariata la semantica di `section`

---

## 7. UI Components

### Sheet Accessibility

Radix richiede `SheetDescription`.

```tsx
<SheetHeader>
  <SheetTitle>Titolo</SheetTitle>
  <SheetDescription className="sr-only">Descrizione</SheetDescription>
</SheetHeader>
```

### Category Colors

Per categorie usare palette preset, non `input[type=color]`.

Motivo:
- UX piu' stabile su mobile
- evita colori fuori palette e inconsistenza visiva

---

## 8. API Routes

### AI Route Authentication

Tutte le route AI richiedono auth Firebase lato server.

```ts
const idToken = await auth.currentUser?.getIdToken(true);
fetch('/api/format-recipe', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  },
});
```

Gotcha che costa debug:
- le `NEXT_PUBLIC_FIREBASE_*` bastano per il client, NON per la verifica server-side
- in locale puoi usare `FIREBASE_ADMIN_PROJECT_ID` + `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`
- su Vercel e' piu' robusto `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- se sono presenti entrambe, il codice usa prima `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- il JSON Firebase Admin reale usa snake_case (`project_id`, `client_email`, `private_key`)

### File Limit

Upload AI: max 4.4MB. Validare client-side.

### Family Context Scope

Il contesto famiglia serve per adattare quantità/porzioni, non per alterare input che devono restare fedeli alla sorgente.

Pattern corretto:
- `Chat AI`: SI'
- `Testo libero`: SI'
- `Pianificatore`: SI'
- `Carica PDF`: NO, deve restare estrazione pura

### Model Consistency

Il modello atteso sugli endpoint AI resta `claude-sonnet-4-6`. Se cambia, aggiornare tutti gli endpoint correlati.

---

## 9. Deployment

### Docker Compose

Tutti i comandi richiedono `--env-file .env.local`. Vedi CLAUDE.md per la lista completa.

### Reliable Build Check

Se `npm run build` fallisce in sandbox su Turbopack/process binding:

```bash
npx next build --webpack
```

### Dependency Hygiene

Dopo `npm audit fix`, se il lockfile aggiorna una dipendenza diretta importante gia' validata in build, allineare anche `package.json` per evitare drift tra manifest e lockfile.

---

## 10. Meal Planner Patterns

### Recipe Summaries per AI

Il summary ricette inviato a `/api/plan-meals` deve includere `ingredientNames` per permettere l'applicazione dei vincoli dietetici. Senza la lista ingredienti Claude inferisce solo dal titolo — inaffidabile per nomi neutri ("Tortino di riso", "Pasta rustica").

```ts
// ✅ Summary corretto (useMealPlanner.ts — generatePlan E regenerateSlot)
{
  id, title, categoryId,
  seasons: r.seasons ?? (r.season ? [r.season] : []),
  ingredientCount: r.ingredients.length,
  ingredientNames: r.ingredients.map(i => i.name),
}
```

Impatto token: ~+50-100 token/ricetta. Per 50 ricette ≈ +4000 token — entro budget.

### Season Filter Server-Side

Filtrare ricette per stagione **prima** di inviare a Claude, non solo via prompt:

```ts
const seasonFiltered = recipes.filter(r =>
  !r.seasons?.length || r.seasons.includes('tutte_stagioni') || r.seasons.includes(config.season)
);
// fallback se < 5 ricette stagionali → usa pool completo (utente senza tag stagione)
const toSend = seasonFiltered.length >= 5 ? seasonFiltered : recipes;
```

Quando il filtro è attivo → linguaggio hard nel prompt ("GIÀ SOLO ricette di stagione").
Quando è disabilitato (fallback) → linguaggio soft ("Preferisci").

Senza questo filtro la stagione nel setup impatta solo le ricette nuove generate, non quelle esistenti.

### Per-Meal Category Config (`MealTypeConfig`)

`MealTypeConfig` unifica preferenza + esclusione per portata (sostituisce `courseCategoryMap` + `excludedCategoryIds` flat):

```ts
interface MealTypeConfig {
  preferredCategoryId?: string | null;
  excludedCategoryIds?: string[] | null;
}
// MealPlanSetupConfig:
mealTypeConfigs?: Partial<Record<MealType, MealTypeConfig>> | null;
```

Server-side hard filter: usa l'**intersezione** delle `excludedCategoryIds` di tutte le portate attive (categorie escluse da *tutte* → rimosse dal pool). Esclusioni per-portata non in intersezione → solo prompt instruction.

Backward compat: l'API supporta ancora `courseCategoryMap` + `excludedCategoryIds`; il form usa solo `mealTypeConfigs`.

Constraint UI: una categoria non può essere sia preferita che esclusa per la stessa portata — `setMealPreferred` rimuove automaticamente dal `excludedCategoryIds` se già presente.

### Shopping List — Derived Views

La lista della spesa è una vista derivata del `MealPlan` già in Firestore. Non serve una collection separata.

Pattern corretto:
- Fetch `MealPlan` + batch `getRecipesByIds()` → `buildContributions()` → `aggregateIngredients()`
- Slot con `newRecipe` (ParsedRecipe) hanno gli ingredienti inline: nessuna chiamata Firestore aggiuntiva
- Stato effimero (spunti, articoli custom) → localStorage, non Firestore

**localStorage key strategy per feature settimanali:**
```
shopping_list:{uid}:{weekStartDate}
```
La chiave include `uid` (isolamento multi-device) e `weekStartDate` (no cross-week contamination).

**Aggregazione ingredienti — due binari:**
- Binario A (somma numerica): stessa unità + valore parseable → sommare (es. "200 g" + "150 g" → "350 g")
- Binario B (concatenazione): unità diverse o non-numeriche → join con " + " (es. "2 spicchi + q.b.")
- Nessun fuzzy matching sui nomi: "pomodori pelati" e "pomodori" restano voci separate (merge inattesi confondono più dei duplicati)

### Slot Regeneration

`regeneratingSlots: Set<string>` usa chiave `"dayIndex-mealType"` (es. `"2-pranzo"`).

Riutilizza `/api/plan-meals` con config single-slot (non serve un endpoint separato):

```ts
const slotConfig: MealPlanSetupConfig = {
  season: currentPlan.season,
  activeMealTypes: [mealType],
  activeDays: [dayIndex],
  excludedCategoryIds: [],
  newRecipeCount: 1,
  newRecipePerMeal: { [mealType]: 1 },
  weekStartDate: currentPlan.weekStartDate,
};
```

Il server restituisce 1 slot; il client lo sostituisce nell'array e scrive Firestore.
