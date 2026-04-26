# AI Agent Guidelines - Il Mio Ricettario

**Focus**: solo gotcha che possono causare debug >30min. Per contesto architetturale: [CLAUDE.md](CLAUDE.md)

---

## Quick Reference

| Gotcha | Problema | Soluzione |
|--------|----------|-----------|
| Custom `@keyframes` in `@layer` | `@keyframes` definiti dentro `@layer utilities` vengono ignorati da Tailwind Animate | Definire `@keyframes` a root level in `globals.css`, PRIMA dei blocchi `@layer`; le classi utility che li usano vanno dentro `@layer utilities` |
| Stagger con Tailwind | `animation-delay-[--delay]` e `[animation-delay:var(--delay)]` non funzionano come classi arbitrarie su tutti i build | Usare `style={{ animationDelay: '...' }}` inline; cap delay a 350ms su collection grandi |
| `[QTY:n]` residuo in step AI | Claude resetta la numerazione `[ING:n]` per sezione su ricette multi-sezione; il parser lascia `[QTY:n]` raw in Firestore; `renderStepDescription` non lo gestisce → visibile all'utente | Parser: restituire `''` invece di `match` in `replaceAiQuantityReferences`; renderer: aggiungere `.replace(/\[QTY:\d+\]/gi, '')` in coda per backward compat con dati già salvati |
| Nav fissa semi-trasparente su palette chiara | `bg-background/92` su sfondo crema è percettivamente identico al contenuto sottostante — sembra trasparente. Su iOS, `backdrop-filter` può non compositarsi con layer `will-change-transform` delle card | Usare `bg-background` (100% opaco) su qualsiasi nav fissa con palette chiara; tenere `backdrop-blur` per chi lo supporta |
| `will-change-transform` statico su card | Crea un compositing layer GPU per ogni card. Con 20+ ricette esaurisce la memoria GPU mobile → scroll jank. Su touch, `hover` non scatta mai, il costo è solo passivo | Usare `group-hover:will-change-transform` per promuovere il layer solo al momento dell'hover (desktop). Mai usare `will-change-transform` statico su liste di card |
| `shadow` in `transition-[...]` su mobile | La transizione `shadow` è sempre CPU-bound (nessun browser la GPU-composita) — repaint a ogni frame anche se `hover` non scatta su touch | Rimuovere `shadow` dalla lista transition; l'ombra può comparire istantaneamente su hover senza costo animazione |
| Orientation classes | `portrait:` applica anche a desktop | Usare `max-lg:portrait:` |
| Page self-padding | Pagina interna aggiunge `p-4 lg:p-8` su layout che già fornisce `portrait:p-4` / `lg:px-10` | Pagine dentro dashboard layout non devono aggiungere padding esterno; usare `max-w-*` solo per centrare contenuto |
| Flex tab bar overflow | Tab con `px-5` fisso in `flex` container traboccano su ≤375px (3 tab ≈ 420px > 343px disponibili) | `px-3 sm:px-5` + `flex-shrink-0` + `overflow-x-auto` sul container |
| CSS grid su landscape stretto | `repeat(N, 1fr)` con N=7 su iPhone SE landscape (~568px) = ~65px per colonna — celle illeggibili | `repeat(N, minmax(72px, 1fr))` + `overflow-x-auto` sul wrapper |
| Firebase optional | `undefined` causa errori silenziosi in scrittura | Per campi opzionali persistiti usare `null` oppure omettere proprio la chiave; mai passare `undefined` a Firestore |
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
| Planner `type="new"` senza ricetta | Claude può restituire uno slot nuovo nel blocco `[PIANO]` ma omettere la ricetta completa in `[RICETTE_NUOVE]`, rompendo rigenerazione e save flow | In `/api/plan-meals` validare sempre parità tra nuovi slot dichiarati e ricette parseate; se mancano ricette complete, fallire esplicitamente e non salvare slot incoerenti |
| Planner save CTA fantasma | Una cella può sembrare salvabile anche quando `newRecipe` è già `null` | Mostrare `Salva nel ricettario` solo se `slot.newRecipe` esiste davvero; badge/label AI da soli non bastano |
| Collapsible auto-close mount | `prevCheckedRef = useRef([])` triggera auto-close di sezioni già complete al mount | Inizializzare `prevCheckedRef` con il valore corrente di `checked*`, non con `[]` |
| isToday timezone | Confronto con timestamp slitta di giorno in `Europe/Rome` | Usare `getFullYear()/getMonth()/getDate()` (locale), non timestamp |
| React Query + user null | Query eseguita prima che l'auth sia pronta | Aggiungere sempre `enabled: !!user` (e `!!recipeId` dove serve) |
| React Query DevTools | L'icona non appare pur avendo QueryClientProvider | Serve il package separato `@tanstack/react-query-devtools` |
| React Query + useEffect init | Cache revalidation ri-esegue `useEffect([recipe])` | Usare un ref `sessionInitialized` per guard one-time init |
| Step duration max | Browser validation error su step con molte ore | Usare `max={9999}` non `max={999}` — 24h = 1440 min |
| Timer multipli | Singolo `setInterval` + singolo stato non supporta parallelo | Usare `Map<stepId, setInterval>` in un ref + `Record<stepId, secondsLeft>` nello stato |
| `bg-white` hardcoded | `bg-white` è sempre `#ffffff` — ignora il token `--background` | Usare `bg-background`, `bg-card`, `bg-muted`, `bg-secondary` |
| OKLCH color scale inesistente | `bg-primary-100`, `border-primary-200`, `text-primary-700` non esistono con palette OKLCH custom — Tailwind genera scale solo per colori statici, non per CSS vars | Usare opacity modifier: `bg-primary/10`, `border-primary/20`, `text-primary` |
| Elementi HTML nativi senza `bg` | `<textarea>`, `<select>`, `<input>` mostrano sfondo bianco anche con tema OKLCH | Aggiungere sempre `bg-background text-foreground` esplicitamente — il browser non eredita CSS custom properties dal tema |
| Side-stripe design ban | `border-l-[2px+]` su card/list item è AI slop tell — vietato anche se semantico | Sostituire con badge `absolute top-1.5 left-1.5` (icona + colore) o background tint; mai side-stripe |
| `animate-bounce` datato | Bounce easing su typing indicator o bottoni appare datato | Usare `animate-pulse` per indicatori di attività; easing `ease-out` per motion intenzionale |
| Delight state drift | Loading/empty/error box creati ad hoc pagina per pagina rompono coerenza visiva e portano classi colore hardcoded | Riutilizzare `EditorialLoader`, `EditorialEmptyState`, `StatusBanner`; se serve un toast `react-hot-toast`, stilizzarlo globalmente in `providers.tsx`, non localmente |
| React Query stale cache dopo write | Dopo `createCookingSession` / `deleteCookingSession` (o qualsiasi write Firestore), navigare su una list-page mostra dati stale finché `staleTime` non scade | Chiamare sempre `queryClient.invalidateQueries({ queryKey: [...] })` dopo ogni write che impatta una query su un'altra pagina |
| `next/dynamic` su componenti UI tab | `dynamic()` con `loading` fallback mostra un loader visibile al primo cambio tab — inaccettabile per componenti piccoli sulla stessa route | Usare import statici normali; `next/dynamic` ha senso solo per componenti pesanti a livello di pagina intera |
| Colori Tailwind raw fuori design system | `green-*`, `orange-*`, `purple-*` usati per stati (completamento, validazione, AI) sono visivamente incoerenti — il token `accent` del progetto è già verde salvia | Per stati di completamento: `text-accent`, `bg-accent/10`, `border-accent/40`; per warning: `text-primary`; mai `purple-*` |
| Credenziali test invisibili | Si pensa che il pannello login sia sparito, ma la UI è corretta | Le credenziali test nel login compaiono solo con `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true`; dopo cambio env riavviare `npm run dev` |
| `next/font` in `'use client'` | Errore runtime — `next/font/google` funziona solo in Server Components | Root layout deve essere server component; estrarre QueryClient+Auth in `src/components/providers.tsx` |
| Collapsible `max-h` animation | `max-h-[2000px]` thrash layout/paint ad ogni frame (non GPU-accelerated) | Usare `grid-rows-[0fr] → grid-rows-[1fr]` con wrapper `overflow-hidden`; aggiungere `motion-reduce:transition-none` |
| `container mx-auto` non configurato | `container` di Tailwind si espande senza limiti se non configurato in `tailwind.config.js` | Usare `max-w-*` espliciti (`max-w-4xl`, `max-w-5xl`) invece di `container` |
| `max-w-*` senza `mx-auto` | Contenuto rimane allineato a sinistra su desktop wide anche con `max-w` | Aggiungere sempre `mx-auto` insieme a `max-w-*` su pagine con contenuto centrato |
| Step editor actions inline on mobile | Toolbar `su/giu/elimina` nella stessa riga del contenuto riduce la larghezza utile della textarea e fa sembrare lo step "schiacciato" | Su mobile mettere i controlli in una riga separata sotto il contenuto; da `sm` in su possono stare in alto a destra |
| Build sandbox `spawn EPERM` | `npx next build --webpack` può fallire nel sandbox anche se il codice è corretto | Se compare `spawn EPERM`, rilanciare la build fuori sandbox; non trattarlo come errore applicativo |

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
<div className="sticky bottom-0 max-lg:portrait:bottom-20 bg-background border-t py-4 z-10">
```

**Le pagine non devono aggiungere il proprio padding esterno:**
Il `<main>` nel dashboard layout fornisce già tutti i padding per viewport:
- `lg:px-10 lg:py-8` — desktop
- `max-lg:portrait:p-4 max-lg:portrait:pb-20` — mobile portrait
- `max-lg:landscape:p-4` — mobile landscape

```tsx
// ❌ SBAGLIATO — crea doppio padding (es. 32px su portrait invece di 16px)
return <div className="p-4 sm:p-6 lg:p-8">...</div>

// ✅ CORRETTO — usa max-w solo per centrare contenuto, non per padding di pagina
return <div className="max-w-2xl mx-auto">...</div>
```

**Grid con colonne a larghezza minima + scroll orizzontale:**
```tsx
// ❌ SBAGLIATO — su 7 colonne in 568px landscape = ~65px per colonna (illeggibile)
style={{ gridTemplateColumns: `80px repeat(7, 1fr)` }}

// ✅ CORRETTO — mantiene un minimo leggibile, scroll se necessario
<div className="overflow-x-auto">
  <div style={{ gridTemplateColumns: `80px repeat(7, minmax(72px, 1fr))` }}>
```

---

## 2. Firebase Patterns

**`null` vs `undefined`**: Firebase rifiuta `undefined` in scrittura. Per campi opzionali persistiti:
- usare `null` quando il modello dati lo prevede esplicitamente
- oppure omettere la chiave con spread condizionale (`...(value ? { field: value } : {})`)
- mai passare `undefined` a `addDoc()` / `updateDoc()`

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
| `['cookingHistory', uid]` | Storico cotture (statistiche) |
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

**Section Auto-Close**: inizializzare `prevCheckedRef` con il valore corrente, non con `[]`, altrimenti le sezioni già complete al mount si chiudono al caricamento. Animare il collapse con `grid-template-rows` (non `max-height`) — il div deve essere sempre nel DOM affinché l'animazione e il global step counter restino corretti:
```tsx
<div className={cn(
  'grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none',
  isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
)}>
  <div className="overflow-hidden">{/* content always rendered */}</div>
</div>
```

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

## 6. UI Components & Theming

**Color tokens — mai usare `bg-white`**: `bg-white` è hardcoded `#ffffff` in Tailwind e ignora il token `--background`. Usare sempre:
- `bg-background` per sfondi pagina/layout
- `bg-card` per card e pannelli
- `bg-muted` per stato disabilitato o hover passivo
- `bg-secondary` per sfondi secondari (sezioni, filtri)

**Elementi HTML nativi**: `<textarea>`, `<select>`, `<input>` NON ereditano `--background` automaticamente — il browser usa `white` di default. Aggiungere sempre `bg-background text-foreground placeholder:text-muted-foreground` esplicitamente. Il componente shadcn `Input` lo fa già; gli elementi nativi no.

**OKLCH color scale**: `bg-primary-100`, `border-primary-200`, `text-primary-700` non funzionano — Tailwind genera scale numeriche solo per colori statici. Con CSS vars OKLCH usare sempre l'opacity modifier: `bg-primary/10`, `border-primary/20`, `text-primary`.

**Side-stripe ban**: `border-l-2` o superiore con colore su card/list item è vietato da impeccable guidelines indipendentemente dall'intenzione semantica. Sostituire con badge angolare `absolute top-1.5 left-1.5` (icona + tint) che porta la stessa informazione senza il pattern visivo da AI slop.

**Palette OKLCH**: i token CSS contengono solo i parametri (`--background: 97% 0.01 75`), il wrapper `oklch()` è nel `tailwind.config.js`. Questo è lo stesso pattern del vecchio `hsl()`. Tutti i browser moderni supportano `oklch()`.

**Delight shared states**: per loading, empty state e feedback cross-app usare i wrapper condivisi:
- `EditorialLoader` per attese importanti (auth bootstrap, dashboard load, AI generation)
- `EditorialEmptyState` per primo uso / nessun risultato
- `StatusBanner` per info/success/warning/error inline
Questo evita classi duplicate, hardcoded blu/verdi/rossi e drift tra pagine.

**Hot toast styling**: se una pagina usa `react-hot-toast`, il look va definito in `src/components/providers.tsx`; nelle pagine si cambia solo il contenuto del messaggio.

**Sheet Accessibility**: Radix richiede `<SheetDescription className="sr-only">` altrimenti warning a11y in console.

**Category Colors**: usare palette preset, non `input[type=color]` — UX più stabile su mobile, evita colori fuori palette.

**Layout max-width per tipo di pagina**:
- Pagine con griglia card (ricette, categorie, cotture): **nessun max-w** — la grid gestisce già la responsività
- Pagine a contenuto testuale stretto (statistiche, profilo, lista spesa): `max-w-Xrem mx-auto` per leggibilità
- Pagine miste/centrate (pianificatore): `max-w-[1200px] mx-auto`; i sotto-pannelli di form usano `max-w-lg mx-auto`

**Editorial cinema shell**: i wrapper condivisi `shell-stage` e `shell-panel` vivono in `globals.css` e portano pseudo-elementi, gradienti e shadow già incorporati. Usarli su shell e pannelli chiave, non impilarli in profondità senza motivo; il parent che ospita lo stage deve restare `relative`/`isolation:isolate` e il motion deve sempre avere fallback `motion-reduce`.

**Step editor mobile**: il badge numero step deve restare leggero e integrato nella card. Evitare badge assoluti che escono dal bordo o toolbar rigide nello stesso asse della textarea: su telefoni riducono troppo la larghezza e fanno sembrare gli step spostati a destra.

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
- Se `npx next build --webpack` fallisce con `spawn EPERM` nel sandbox, rilanciare fuori sandbox prima di indagare il codice
- Dopo `npm audit fix`: allineare `package.json` se il lockfile aggiorna una dipendenza diretta già validata
- Per mostrare il pannello credenziali di test nel login in locale: `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true` e riavvio del dev server

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

**Slot Regeneration — prompt contract**: se Claude usa `type="new"` nel blocco `[PIANO]`, deve sempre fornire la ricetta completa corrispondente in `[RICETTE_NUOVE]`, nello stesso ordine. Per rigenerazione single-slot:
- prompt più esplicito: una sola riga nel `[PIANO]`, una sola ricetta completa se `type="new"`
- server-side validation: `expectedNewSlots === parsedNewRecipes.length`
- client-side safety: non sostituire mai uno slot esistente con un risultato `type="new"` privo di `newRecipe`

**Shopping List — Derived View**: lista derivata dal `MealPlan`, nessuna collection Firestore separata.
- Slot `existingRecipeId` → `getRecipesByIds()` (batch, deduplicato)
- Slot `newRecipe` (ParsedRecipe) → ingredienti inline, zero Firestore reads aggiuntive
- Stato effimero (spunti, articoli custom) → localStorage key `shopping_list:{uid}:{weekStartDate}`
- Aggregazione: somma numerica se stessa unità; fallback `" + "` per tutto il resto; nessun fuzzy matching sui nomi
