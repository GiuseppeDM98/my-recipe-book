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
className="max-lg:portrait:flex max-lg:landscape:hidden"  // ✅
className="portrait:flex landscape:hidden"                 // ❌ applica a desktop
```

- Desktop (≥1440px): sidebar sempre visibile
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sidebar drawer

**Sticky button sopra la bottom nav:**
```tsx
<div className="sticky bottom-0 max-lg:portrait:bottom-20 bg-white border-t py-4 z-10">
```

---

## 2. Firebase Patterns

**`null` vs `undefined`**: Firebase rifiuta `undefined` in scrittura — usare sempre `null` per campi opzionali.

**Composite Index**: query `where(...) + orderBy(...)` richiedono indice in `firebase/firestore.indexes.json`. Se l'errore è catturato in un `catch` generico, lato UI sembra solo "nessun dato". Dopo ogni modifica: `firebase deploy --only firestore`.

Indici attivi:
- `categories`: `userId ASC, order ASC`
- `cooking_history`: `userId ASC, completedAt DESC`
- `cooking_sessions`: `userId ASC, lastUpdatedAt DESC`
- `meal_plans`: `userId ASC, weekStartDate DESC`
- `recipes`: `userId ASC, createdAt DESC`
- `subcategories`: `categoryId ASC, userId ASC, order ASC`

**User Profile Extensions**: per preferenze utente che non richiedono query dedicate, usare `users/{uid}` esistente anziché aprire una nuova collection (es. `familyProfile`).

**Cooking History**: `cooking_sessions` = stato effimero; `cooking_history` = evento append-only creato solo da `Termina cottura`. Statistiche leggono solo da `cooking_history`.

---

## 3. React Query Patterns

```ts
// ✅ Disabilitata finché l'auth non è pronta
useQuery({ queryKey: ['recipes', user?.uid ?? ''], queryFn: ..., enabled: !!user });
// ❌ NON usare onSnapshot — evitato per costi Firestore
```

**Query keys standard:**

| Key | Uso |
|-----|-----|
| `['recipes', uid]` | Lista ricette utente |
| `['recipe', id, uid]` | Singola ricetta (shared tra detail/edit/cooking) |
| `['categories', uid]` | Categorie |
| `['subcategories', uid, categoryIds[]]` | Subcategorie |
| `['cookingSessions', uid]` | Sessioni attive |
| `['familyProfile', uid]` | Profilo famiglia (staleTime 5min) |
| `['shoppingList', uid, weekStartDate]` | Lista della spesa (derivata da MealPlan) |

Stale time: 2min globale, 5min per familyProfile.

**Guard per init one-time** (evita ri-esecuzione su cache revalidation):
```ts
const sessionInitialized = useRef(false);
useEffect(() => {
  if (!recipe || sessionInitialized.current) return;
  sessionInitialized.current = true;
}, [recipe]);
```

---

## 4. Cooking Mode

**Setup Screen Pattern**: non creare sessioni in `useEffect`.
```ts
useEffect(() => { setIsSetupMode(!await getCookingSession(recipeId, userId)); }, []);
const handleStart = () => createCookingSession(recipeId, userId, servings); // solo da click
```

**Completion Pattern**: non auto-eliminare la sessione al 100%. Mostrare `Termina cottura` esplicitamente → solo allora: creare `cooking_history` + cancellare `cooking_session`.

**Timer multipli in parallelo:**
```ts
const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
const [secondsMap, setSecondsMap] = useState<Record<string, number>>({});
// Cleanup obbligatorio:
useEffect(() => () => { intervalsRef.current.forEach(clearInterval); }, []);
```

**Section Auto-Close**: inizializzare `prevCheckedRef` con il valore corrente, non con `[]`, altrimenti le sezioni già complete al mount si chiudono al caricamento. Usare `max-h` + `opacity` CSS (div sempre renderizzato) per animare il collapse — non `{isExpanded && <div>}`.

---

## 5. Recipe Data Structure

```ts
interface Ingredient { id; name; quantity; section?: string | null; }
interface Step { id; order; description; section?: string | null; sectionOrder?: number | null; duration?: number | null; }
```

**Step Duration**: `duration?: number | null` — `null` = nessun timer. Form: `max={9999}`. `extractStepDuration()` esportata da `recipe-parser.ts` (usata sia dal parser che dall'auto-detect).

**AI Duration Token**: su tutti i prompt AI nella sezione PROCEDIMENTO:
```
Se uno step ha UN SOLO tempo chiaramente identificabile, aggiungi [DUR:N] alla fine (N = minuti interi).
NON aggiungere se il tempo è un range, ambiguo, o lo step ha più tempi.
```
Consistente con `[ING:n]` e `[QTY:n]`.

**Dynamic Step Quantities**: storage `{{qty:ingredientId}}`, risolto a runtime. AI emette `[ING:n]`/`[QTY:n]`, convertiti nel parser. Ricette legacy: usare il pulsante auto-adapt in modifica, solo match ad alta confidenza.

**`renderStepDescription` — name fallback**: se le keyword del nome ingrediente non sono nel testo circostante, appende automaticamente `"di {simplifiedName}"`. Se cambi `getIngredientKeywords`, impatta sia il rendering che `adaptStepsToDynamicQuantities`.

**Step Ordering**: riordino globale (non per sezione); rinormalizzare sempre `order` a `1..n`.

---

## 6. UI Components

**Sheet Accessibility**: Radix richiede `<SheetDescription className="sr-only">` altrimenti warning a11y in console.

**Category Colors**: usare palette preset, non `input[type=color]` — UX più stabile su mobile, evita colori fuori palette.

---

## 7. API Routes

**AI Route Authentication:**
```ts
const idToken = await auth.currentUser?.getIdToken(true);
fetch('/api/...', { headers: { Authorization: `Bearer ${idToken}` } });
```
- `NEXT_PUBLIC_FIREBASE_*` bastano per il client, NON per la verifica server-side
- In locale: `FIREBASE_ADMIN_PROJECT_ID` + `FIREBASE_ADMIN_CLIENT_EMAIL` + `FIREBASE_ADMIN_PRIVATE_KEY`
- Su Vercel: preferire `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- JSON Firebase Admin usa snake_case (`project_id`, `client_email`, `private_key`)

**File Limit**: upload AI max 4.4MB (limite Vercel). Validare client-side.

**Family Context Scope**: `Chat AI` ✓ · `Testo libero` ✓ · `Pianificatore` ✓ · `Carica PDF` ✗ (estrazione pura).

**Model**: `claude-sonnet-4-6` su tutti gli endpoint AI. Se cambia, aggiornare tutti.

---

## 8. Deployment

- Docker Compose: sempre `--env-file .env.local` (non legge `.env.local` automaticamente)
- Build affidabile in sandbox: `npx next build --webpack` (evita problemi Turbopack)
- Dopo `npm audit fix`: allineare `package.json` se il lockfile aggiorna una dipendenza diretta già validata

---

## 9. Meal Planner Patterns

**Recipe Summaries per AI**: includere `ingredientNames` nel summary inviato a `/api/plan-meals` — senza di essi Claude non può applicare vincoli dietetici su ricette con nomi neutri.
```ts
{ id, title, categoryId, seasons: r.seasons ?? (r.season ? [r.season] : []),
  ingredientCount: r.ingredients.length, ingredientNames: r.ingredients.map(i => i.name) }
```

**Season Filter Server-Side**: filtrare ricette per stagione *prima* di inviare a Claude, non solo via prompt. Fallback a pool completo se < 5 ricette stagionali. Linguaggio hard nel prompt ("GIÀ SOLO") solo quando il filtro è attivo.

**`MealTypeConfig`**: unifica preferenza + esclusione per portata. Server-side hard filter usa l'**intersezione** delle `excludedCategoryIds` di tutte le portate attive. UI: una categoria non può essere sia preferita che esclusa — `setMealPreferred` la rimuove automaticamente da `excludedCategoryIds`.

**Slot Regeneration**: chiave `"dayIndex-mealType"`. Riutilizza `/api/plan-meals` con `activeMealTypes: [mealType], activeDays: [dayIndex], newRecipeCount: 1`.

**Shopping List — Derived View**: lista derivata dal `MealPlan`, nessuna collection Firestore separata.
- Slot `existingRecipeId` → `getRecipesByIds()` (batch, deduplicato)
- Slot `newRecipe` (ParsedRecipe) → ingredienti inline, zero Firestore reads aggiuntive
- Stato effimero (spunti, articoli custom) → localStorage key `shopping_list:{uid}:{weekStartDate}`
- Aggregazione: somma numerica se stessa unità; fallback `" + "` per tutto il resto; nessun fuzzy matching sui nomi
