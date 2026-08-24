# AI Agent Guidelines - Il Mio Ricettario

**Focus**: solo gotcha che possono causare debug >30min. Per contesto architetturale: [CLAUDE.md](CLAUDE.md). Per regole di sessione e collaudo guidato: [WORKFLOW.md](WORKFLOW.md)

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
| `background-attachment: fixed` su body | Su iOS Safari e mobile Chrome disabilita il GPU-composited scroll path (il browser non può delegare lo scroll al compositor thread perché il BG deve restare fisso) → scroll CPU-bound → jank, peggiore in portrait dove i documenti sono alti | Non usare mai su mobile; se il BG deve restare visivamente fisso, usare un elemento o pseudo-elemento con `position: fixed; z-index: -1` separato dal contenuto scrollabile |
| `min-h-screen` su layout top-level mobile | `100vh` è statico — non reagisce alla barra indirizzi del browser che appare/scompare durante lo scroll → micro-shift di layout | Usare `min-h-[100dvh]` sui container top-level su mobile; su desktop `calc(100vh - X)` rimane corretto perché la barra indirizzi non cambia |
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
| Parametri Sonnet 5 → 400 | `temperature`/`top_p`/`top_k`/`budget_tokens` (o prefill sull'ultimo turno assistant) danno **400** su Sonnet 5, con errore poco esplicito lato route (500 generico) | Non impostarli mai; per controllare la profondità usare `thinking: {type:'adaptive'}` + `output_config.effort`. `effort` richiede `@anthropic-ai/sdk >= ~0.100` |
| AI model literal drift | Cambiare modello dimenticando uno degli endpoint → route su versioni diverse | Il modello è la costante `AI_MODEL` (`lib/utils/constants.ts`): cambiarlo lì soltanto, mai literal per-route |
| Family profile persistence | Si pensa di dover deployare rules o creare una collection nuova | Salvare in `users/{uid}.familyProfile`; le rules owner-based esistenti bastano |
| Family context scope | Il contesto famiglia altera flussi che devono restare fedeli all'input | Usarlo solo nei flussi generativi/adattivi (`chat`, `testo libero`), NON in `Carica PDF` né nel pianificatore (ora locale, senza AI) |
| Shopping list debounce non-flushed | La scrittura Firestore delle spunte è debounced 500ms; se il componente smonta o la tab va in background entro 500ms il timer veniva annullato senza salvare → spunte "ricompaiono" non spuntate giorni dopo | Flush della scrittura pendente su `unmount` + `visibilitychange(hidden)` + `pagehide`, leggendo da un `latestStateRef` (no stale closure); azzerare il ref del timer quando scatta |
| Nuovo target di persistenza dimenticato nel flush | `useShoppingList` scrive su due documenti indipendenti (piano su `meal_plans`, ad-hoc su `users/{uid}`): aggiungere un terzo target con un proprio debounce ma dimenticare di richiamarlo dagli handler `unmount`/`visibilitychange`/`pagehide` esistenti riproduce silenziosamente lo stesso bug delle spunte perse, ma solo per il nuovo campo | Ogni nuovo target di persistenza vuole il proprio timer/ref **e** deve essere aggiunto esplicitamente alla funzione di flush condivisa (`flushAll()` in `useShoppingList`) |
| Spunte lista spesa "resettate" al remount | `useShoppingList` vive dentro il componente pagina (`lista-spesa/page.tsx`): uscire dalla pagina e tornarci smonta/rimonta l'hook. La query del piano ha `staleTime: 2min`, quindi un remount entro quella finestra riusa lo snapshot cachato dal **primo** fetch — e l'effetto di init si fidava ciecamente di quello snapshot, sovrascrivendo lo stato locale con le spunte vecchie anche se la scrittura Firestore nel frattempo era già andata a buon fine | Ogni cambio di `checkedIdsList`/`customItems` aggiorna subito anche la cache React Query (`queryClient.setQueryData` sulla query key del piano), non solo Firestore — così un remount entro `staleTime` rilegge lo stato corrente e non quello del fetch originale |
| Fallback `localStorage` lista spesa non riletto | Se una scrittura Firestore fallisce e scatta il fallback `localStorage`, quel fallback non viene mai riletto finché `shoppingCheckedIds` su Firestore non è vuoto — l'init controlla solo vuoto/non-vuoto, non quale dei due sia più recente | Non risolto (casistica rara): da affrontare separatamente se si ripresenta, confrontando un timestamp invece del solo stato vuoto/non-vuoto |
| Shuffle `preferredCategoryId` hard filter | Impostare una categoria preferita per portata limita lo shuffle a SOLO quella categoria per quel pasto (tutti i pranzi uguali) | Per avere varietà evitando certe portate usare `excludedCategoryIds` (Escludi), non `preferredCategoryId` |
| Planner per-meal config invisibile | La sezione "Categorie per portata" compare solo nello step *setup* (nuovo piano) e solo con `categories.length > 0` | Se non si vede: esiste già un piano per quella settimana (sei sul calendario → "Nuovo piano") oppure non hai categorie (viene mostrato un hint) |
| Collapsible auto-close mount | `prevCheckedRef = useRef([])` triggera auto-close di sezioni già complete al mount | Inizializzare `prevCheckedRef` con il valore corrente di `checked*`, non con `[]` |
| isToday timezone | Confronto con timestamp slitta di giorno in `Europe/Rome` | Usare `getFullYear()/getMonth()/getDate()` (locale), non timestamp |
| YYYY-MM-DD string parsing | `new Date('2026-05-06')` interpretata come UTC mezzanotte → in `Europe/Rome` (+1/+2) risulta nel giorno precedente | Aggiungere sempre il suffisso locale: `new Date(dateStr + 'T00:00:00')` — applicato in `expiryStatus()`, `formatLocalDate`, `getWeekMonday` |
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
| Lista spesa stale dopo una modifica al piano | Caso concreto e particolarmente insidioso del gotcha sopra: la lista della spesa è una **vista derivata** cachata su `['shoppingList', uid, weekStartDate]`. Scrivere sugli slot non tocca quella cache, quindi per 2 minuti (`staleTime`) la lista continua a chiedere la spesa per una portata rimossa, e sembra corretta finché non fai un hard refresh | **Ogni** mutatore del piano deve chiamare `invalidateShoppingList()` (`useMealPlanner`), inclusa l'eliminazione del piano che vive in `pianificatore/page.tsx`. Match parziale sulla chiave (senza `weekStartDate`): `copyPlanToWeek` scrive su una settimana diversa da quella a schermo |
| `next/dynamic` su componenti UI tab | `dynamic()` con `loading` fallback mostra un loader visibile al primo cambio tab — inaccettabile per componenti piccoli sulla stessa route | Usare import statici normali; `next/dynamic` ha senso solo per componenti pesanti a livello di pagina intera |
| Colori Tailwind raw fuori design system | `green-*`, `orange-*`, `purple-*` usati per stati (completamento, validazione, AI) sono visivamente incoerenti — il token `accent` del progetto è già verde salvia | Per stati di completamento: `text-accent`, `bg-accent/10`, `border-accent/40`; per warning: `text-primary`; mai `purple-*` |
| Conteggi filtri calcolati sul set completo | `useMemo` di badge categoria che dipende da `recipes` invece che dal subset upstream: cambiare stagione non aggiorna i conteggi di categoria | Calcolare `recipeCountByCategoryId` su `recipesForCategoryFilter` (post-stagione); una ricetta multi-categoria incrementa **ogni** id restituito da `getRecipeCategoryIds(recipe)`; i conteggi stagione restano su `recipes` full |
| Ricetta multi-categoria: lettura diretta di `categoryId` | `recipe.categoryId` da solo ignora `categoryIds[]` (nuovo formato) e salta le ricette multi-categoria in filtri/conteggi/badge | Leggere **sempre** tramite `getRecipeCategoryIds(recipe)` (`lib/utils/recipe-categories.ts`, dual-read: preferisce `categoryIds[]`, fallback a `categoryId` legacy per ricette pre-migrazione). Mai accedere a `recipe.categoryId` direttamente fuori da quell'helper |
| Badge multi-colore da `category.color` (hex) | Serve un tint di sfondo dal colore hex salvato senza scale OKLCH inesistenti (`bg-primary-100` ecc. non esistono, vedi sopra) | Alpha hex inline sul colore salvato: `style={{ color: category.color, backgroundColor: `${category.color}1a` }}` (10% alpha) — non tailwind arbitrary class con colore dinamico |
| Credenziali test invisibili | Si pensa che il pannello login sia sparito, ma la UI è corretta | Le credenziali test nel login compaiono solo con `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true`; dopo cambio env riavviare `npm run dev` |
| `jest.setup.js` vs `.ts` | `@testing-library/jest-dom` v6 usa module augmentation per estendere i matcher Jest; TypeScript ignora i file `.js` → `toBeInTheDocument` e simili risultano tipizzati come inesistenti | Il setup file Jest che fa side-effect import di tipi (`import '@testing-library/jest-dom'`) deve avere estensione `.ts`; aggiornare anche `jest.config.js` (`setupFilesAfterEnv`). Vale per qualsiasi package che estende matcher Jest (es. `jest-extended`) |
| `next/font` in `'use client'` | Errore runtime — `next/font/google` funziona solo in Server Components | Root layout deve essere server component; estrarre QueryClient+Auth in `src/components/providers.tsx` |
| Collapsible `max-h` animation | `max-h-[2000px]` thrash layout/paint ad ogni frame (non GPU-accelerated) | Usare `grid-rows-[0fr] → grid-rows-[1fr]` con wrapper `overflow-hidden`; aggiungere `motion-reduce:transition-none` |
| `container mx-auto` non configurato | `container` di Tailwind si espande senza limiti se non configurato in `tailwind.config.js` | Usare `max-w-*` espliciti (`max-w-4xl`, `max-w-5xl`) invece di `container` |
| `max-w-*` senza `mx-auto` | Contenuto rimane allineato a sinistra su desktop wide anche con `max-w` | Aggiungere sempre `mx-auto` insieme a `max-w-*` su pagine con contenuto centrato |
| Step editor actions inline on mobile | Toolbar `su/giu/elimina` nella stessa riga del contenuto riduce la larghezza utile della textarea e fa sembrare lo step "schiacciato" | Su mobile mettere i controlli in una riga separata sotto il contenuto; da `sm` in su possono stare in alto a destra |
| Build sandbox `spawn EPERM` | `npx next build --webpack` può fallire nel sandbox anche se il codice è corretto | Se compare `spawn EPERM`, rilanciare la build fuori sandbox; non trattarlo come errore applicativo |
| Azione nascosta in `group-hover` su touch | `opacity-0 group-hover:opacity-100` su un controllo (es. tasto ↺ rimescola slot) lo rende **invisibile su mobile**: il touch non scatena `hover`, l'azione sembra non esistere | Rendere il controllo sempre visibile sotto `lg` e nascondere solo da desktop: `opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100`; aggiungere `aria-label` (un `title=` non basta per screen reader) |
| `confirm()`/`alert()` nativi | I dialog di sistema del browser sono fuori brand, non stilizzabili né focus-trappabili | Per le conferme distruttive usare `ConfirmDialog` (`components/ui/confirm-dialog.tsx`, controllato, costruito sul `Dialog` Radix); per validazioni/errori usare `react-hot-toast`. Mai `window.confirm`/`window.alert` |
| `position: sticky` dentro `overflow:hidden` | Un antenato con `overflow:hidden` (es. `.shell-stage`) diventa scroll container e **annulla `sticky`** rispetto allo scroll finestra: l'elemento non si aggancia e scorre via (sintomo: header `sticky top-0` che sparisce scrollando, footer sidebar irraggiungibile) | Non affidarsi a `sticky` dentro `.shell-stage`. Su desktop il dashboard usa **app-shell con scroll interno** (`<main>` con `lg:overflow-y-auto`, shell ad altezza viewport fissa) così header/sidebar/footer restano fermi senza `sticky`. Alternativa: `overflow: clip` (non crea scroll container, preserva `sticky`) |
| Dark mode — blocco `.dark` | Riscrivere i token con `oklch()` completo (es. `oklch(1 0 0)`) rompe l'alpha inline `oklch(var(--x) / a)` usato ovunque | Nel blocco `.dark` (`globals.css`) sovrascrivere SOLO i componenti OKLCH (`16% 0.012 65`), mai con wrapper/alpha. Le superfici con literal chiari "cotti" in classi arbitrarie (gradiente `body`, `.shell-stage`, `.shell-panel`, sidebar drawer, `more-sheet`, `status-banner` warning, auth pages) richiedono override `.dark`/`dark:` espliciti |
| next-themes hydration mismatch | next-themes scrive la classe `.dark` su `<html>` lato client → warning/mismatch di idratazione | `suppressHydrationWarning` su `<html>`; i componenti che mostrano lo stato tema (es. `ThemePicker`) usano il pattern `mounted` (`useEffect`) per non divergere tra SSR e CSR |
| Contenuto dentro `shell-panel` sotto l'overlay | `.shell-panel::before` è `position:absolute; inset:0` (gradiente decorativo): il contenuto in flusso normale finisce **sotto** l'overlay e appare slavato | Avvolgere il contenuto del pannello in `relative z-10` (stesso pattern di `recipe-card`, `EditorialEmptyState`, `StatusBanner`) |
| Checkbox/`<input type=checkbox>` nativa blu | Senza `accent-color`, la checkbox usa il blu di sistema → rompe la "Regola Anti-Freddo" su palette crema (frequente nelle checklist cottura) | Aggiungere sempre `accent-primary` alla checkbox; per i controlli più toccati area ≥44px e `tabIndex={-1}` se la riga è già `role="button"` (evita doppio tab-stop) |
| `next lint` rimosso in Next 16 | `npx next lint` interpreta `lint` come directory e fallisce; non esiste config ESLint in repo | Validare con `npx tsc --noEmit` + `npx next build --webpack`; non affidarsi a `next lint` |
| `pause_turn` silenzioso con server tool | Con un tool server-side (web search) l'API si ferma a 10 iterazioni e torna `stop_reason: 'pause_turn'` su **HTTP 200**: nessun errore. Nel formato `[RISPOSTA]`/`[RICETTE]` il testo tronca dopo che `[/RISPOSTA]` ha chiuso ma prima di `[/RICETTE]` → l'utente vede una risposta normale e **le ricette sono semplicemente sparite** | Passare sempre da `createMessageWithToolLoop()` (`lib/api/claude-tool-loop.ts`): rimanda la conversazione con il turno assistant in pausa in coda e **nessun nuovo messaggio user** (un "Continua." rompe la ripresa perché legge come nuova istruzione) |
| Web search error = `content` oggetto, non array | Un errore di ricerca (`max_uses_exceeded`, ecc.) torna **HTTP 200** con `web_search_tool_result.content` che è un *oggetto* `{error_code}` invece del solito *array* di risultati: `.map()` su quello lancia, o si leggono `undefined` | `Array.isArray(content)` prima di iterare (fatto in `extractWebSearchSources`, `lib/utils/claude-blocks.ts`). Un errore di ricerca è qualità degradata, non richiesta fallita: `console.warn` e lascia passare la risposta, che il modello ha già prodotto e che è già stata pagata |
| Foto da telefono ruotate | `createImageBitmap(file)` senza opzioni ignora l'orientamento EXIF: le foto scattate in verticale arrivano girate di 90°, e un'etichetta di traverso è illeggibile per il modello — cioè esattamente il caso d'uso | `createImageBitmap(file, { imageOrientation: 'from-image' })`. Inoltre `toBlob` (non `toDataURL`): serve `blob.size` prima dell'espansione base64. E `bitmap.close()` + processing **sequenziale**: Safari mobile va in OOM con più decodifiche da 12 MP in parallelo |
| Immagini replicate nella history | Ogni foto costa fino a ~4784 token: 3 foto rimandate su 20 turni sono ~280k token di input in **una** richiesta | Nella history salvare solo un marcatore testuale (`[L'utente ha allegato N foto...]`); la descrizione che il modello fa delle foto (imposta da `VISION_GUIDANCE`) è ciò che porta avanti il contesto. Evita anche di ristrutturare `ApiHistoryMessage.content` da `string` ad array di blocchi |
| `image/*` accetta HEIC | Gli iPhone consegnano HEIC, che non è un media type valido per l'API **e** che Chrome su Android non decodifica nemmeno in canvas | Elencare i tipi espliciti (`image/jpeg,image/png,image/webp`) su `accept` e validarli lato client e server. Fallire subito con un messaggio chiaro è meglio che fallire dopo in decodifica o con un 400 |
| Union non discriminata → narrowing perso | Un helper che torna `{blocks: X[]; error: null} \| {blocks: null; error: string}` non viene ristretto da `if (result.error)`: TS continua a vedere `blocks` come possibilmente `null` | Usare un discriminante letterale (`{ok: true, ...} \| {ok: false, ...}`) e ramificare su quello |
| kcal totali invece che per porzione | Un totale di ricetta si disallinea in silenzio appena `servings` cambia nel form o la cottura lo scala a runtime | `caloriesPerServing` è **sempre** per porzione. Il totale si ricava moltiplicando, mai il contrario |
| Campo numerico opzionale come `number` nello stato | `useState(recipe?.caloriesPerServing || 0)` non distingue "vuoto" da `0`: svuotare il campo scrive `0` e la stima diventa incancellabile | Tenere lo stato come **stringa** e convertire in salvataggio; in `updateDoc` il vuoto deve diventare `deleteField()`, perché omettere la chiave fa merge e lascia il valore precedente |
| `json_schema` con vincoli di lunghezza | Le structured outputs **non** supportano `minItems`/`maxItems` sugli array (né `minimum`/`maximum`, `minLength`/`maxLength`, `multipleOf`): l'API risponde **400** e la richiesta fallisce del tutto — `output_config.format.schema: For 'array' type, property 'maxItems' is not supported`. Il sintomo a valle è ingannevole: il client cattura l'errore e ritorna `null`, quindi la feature sembra solo "non funzionare" invece di segnalare uno schema invalido | Nello schema mettere solo forma e tipi (`type`, `enum`, `required`, `additionalProperties: false`). I vincoli di quantità vanno nel **prompt**, e se serve una garanzia si applica lato server sul risultato (`.slice(0, 3)`): troncare è un degrado accettabile, un 400 sull'intera richiesta no |
| Slot orfani dopo la rimozione di una portata | `buildContributions` (`ingredient-aggregator.ts`) itera **tutti** gli slot senza filtrare per `activeMealTypes`: togliere la portata da `activeMealTypes` senza cancellarne gli slot lascia i suoi ingredienti nella lista della spesa, per una portata che il calendario non mostra più | `removeMealType` (come `removeDay`) cancella `activeMealTypes` **e** gli slot in un'unica `updateMealPlan` |
| `activeMealTypes` disordinato | L'array persistito È l'ordine di render (griglia, chips, form): scritture puntuali (`addMealType`, toggle nel setup) che fanno solo append rompono l'ordine canonico della giornata (es. aggiungere colazione a un piano esistente la mostra per ultima) | Passare sempre l'array attraverso `sortMealTypes()` (`lib/constants/meal-types.ts`) sia in scrittura sia in lettura: ordina per indice in `SELECTABLE_MEAL_TYPES`, tipi legacy in coda (sort stabile) — la lettura auto-corregge anche i piani Firestore salvati prima del fix, senza migrazione |
| Playwright + scrittura Firestore async: falso positivo | Un'asserzione su un testo già presente nello step **precedente** del flusso (es. un'etichetta di form visibile prima ancora del submit) risolve `toBeVisible()` a `true` subito, anche se il click che doveva scatenare una scrittura Firestore non ha ancora completato — il test "passa" e il browser context si chiude a metà scrittura, abortendo la richiesta in corso | Attendere sempre un marker visibile **solo nello step successivo** (es. un titolo presente solo nella vista calendario, non nel form di setup), mai un testo che esiste già prima dell'azione da verificare |

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

**Modello di scroll (desktop ≥1440px) = app-shell**: lo `.shell-stage` è ad altezza viewport fissa (`lg:h-[calc(100vh-2rem)]`) e a scorrere è solo `<main>` (`lg:overflow-y-auto`, riga flex `lg:min-h-0`). Header, sidebar e footer restano fermi (nessun `sticky` — non funzionerebbe dentro `overflow:hidden`, vedi Quick Reference). Il selettore tema vive nel footer della sidebar (lista voci in un wrapper `min-h-0 flex-1 overflow-y-auto`, picker ancorato sotto). Sotto 1440px resta lo scroll-finestra. L'effetto `--shell-focus` legge `mainRef.scrollTop`, non `window.scrollY`.

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
| `['cookingSessions', uid]` | Sessioni attive |
| `['cookingHistory', uid]` | Storico cotture (statistiche) |
| `['familyProfile', uid]` | Profilo famiglia (staleTime 5min) |
| `['shoppingList', uid, weekStartDate]` | Lista della spesa (derivata da MealPlan) |
| `['adHocShopping', uid]` | Gruppi "Voglio preparare questo" (globali, su `users/{uid}`, non per settimana) |

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

**Ingredienti orfani (estrazione/formattazione)**: `EXTRACTION_PROMPT` e `FORMAT_RECIPE_PROMPT` includono la regola "COERENZA INGREDIENTI ↔ PROCEDIMENTO" che fa **omettere** all'AI gli ingredienti mai usati/menzionati in nessuno step (refusi della fonte, es. arancia candita nelle sfogliatelle). Regola **conservativa fail-safe**: NON rimuove nulla se il procedimento è sintetico/generico ("aggiungere i restanti ingredienti", "unire il tutto", ecc.). Da mantenere in **entrambi** i prompt (convenzione mirror). `chat-recipe` non ha la regola (genera ricette nuove, non estrae).

**AI Duration Token**: su tutti i prompt AI nella sezione PROCEDIMENTO:
```
Se uno step ha UN SOLO tempo chiaramente identificabile, aggiungi [DUR:N] alla fine (N = minuti interi).
NON aggiungere se il tempo è un range, ambiguo, o lo step ha più tempi.
```
Consistente con `[ING:n]` e `[QTY:n]`.

**Dynamic Step Quantities**: storage `{{qty:ingredientId}}`, risolto a runtime. AI emette `[ING:n]`/`[QTY:n]`, convertiti nel parser. Ricette legacy: usare il pulsante auto-adapt in modifica, solo match ad alta confidenza.

**`renderStepDescription` — name fallback**: se le keyword del nome ingrediente non sono nel testo circostante, appende automaticamente `"di {simplifiedName}"`. Se cambi `getIngredientKeywords`, impatta sia il rendering che `adaptStepsToDynamicQuantities`.

**Step Ordering**: riordino globale (non per sezione); rinormalizzare sempre `order` a `1..n`.

**Recipe Categories (multi)**: `categoryIds?: string[]` sostituisce il vecchio `categoryId?: string` (ora `@deprecated`, mantenuto solo come fallback di lettura). Stesso schema di migrazione già usato per `season` → `seasons[]`: dual-read + migrazione lazy on-edit, nessuna migrazione batch. Leggere **sempre** tramite `getRecipeCategoryIds(recipe)` (`lib/utils/recipe-categories.ts`); mai `recipe.categoryId` diretto. In salvataggio (edit), il legacy `categoryId` viene esplicitamente rimosso con `categoryId: deleteField()` (import da `firebase/firestore`) per evitare drift — richiede un cast (`as unknown as Partial<Recipe>`) perché `FieldValue` non è assegnabile al tipo `string`. Le **sottocategorie sono state rimosse del tutto** (tipo, helper Firebase, UI, regola e indice Firestore): i documenti già presenti nella collection `subcategories` restano inerti e non vengono letti da nessuna query.

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

**Dark mode (light / dark / system)**: gestita da `next-themes` (`darkMode: 'class'`, classe `.dark` su `<html>`, persistenza + anti-flash pre-paint inclusi). Il blocco `.dark` in `globals.css` riscrive gli **stessi token** (solo componenti OKLCH, vedi gotcha) — i componenti che usano `bg-background`/`text-foreground`/`bg-card`/`border-border` ecc. si adattano da soli. NON aggiungere `bg-white dark:bg-black` sparsi: usare i token. Le superfici decorative con literal chiari hardcoded richiedono override `.dark`/`dark:` espliciti. `ThemePicker` (`components/ui/theme-picker.tsx`) è montato in `Sidebar` e `MoreSheet`; il root layout deve avere `suppressHydrationWarning`.

**Delight shared states**: per loading, empty state e feedback cross-app usare i wrapper condivisi:
- `EditorialLoader` per attese importanti (auth bootstrap, dashboard load, AI generation)
- `EditorialEmptyState` per primo uso / nessun risultato
- `StatusBanner` per info/success/warning/error inline
- `ConfirmDialog` per ogni conferma distruttiva (elimina piano/ricetta/sessione) — controllato, riusa il `Dialog` Radix; mai `window.confirm`/`window.alert`
Questo evita classi duplicate, hardcoded blu/verdi/rossi e drift tra pagine.

**Hot toast styling**: se una pagina usa `react-hot-toast`, il look va definito in `src/components/providers.tsx`; nelle pagine si cambia solo il contenuto del messaggio.

**Sheet Accessibility**: Radix richiede `<SheetDescription className="sr-only">` altrimenti warning a11y in console.

**Category Colors**: usare la palette preset `CATEGORY_COLOR_PRESETS` (`color-palette-picker.tsx`), non `input[type=color]` — UX più stabile su mobile. La palette è composta di toni terrosi on-brand (terracotta, ocra, oliva, salvia, cacao); niente neon blu/viola/teal. Le categorie esistenti mantengono il colore salvato anche se non più tra i preset (nessuna migrazione).

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

**Family Context Scope**: `Chat AI` ✓ · `Testo libero` ✓ · `Carica PDF` ✗ (estrazione pura) · `Pianificatore` ✗ (ora locale, niente AI).

**Web Search & Vision Scope**: `Chat AI` ✓ (opt-in per messaggio) · `Testo libero` ✗ · `Carica PDF` ✗ · `Pianificatore` ✗. Stessa dottrina del family context, una tacca più stretta: `extract-recipes` e `format-recipe` promettono fedeltà alla fonte ("riporta le quantità esattamente come nel documento"), quindi una seconda fonte di verità produrrebbe una sostituzione silenziosa e infalsificabile — l'output resta una ricetta valida, solo non è più la tua. La provenienza di una ricetta da chat resta `{ type: 'manual', name: 'Generata con Chat AI' }`: `source.type` è un'unione chiusa e `source.url` è singolare, mentre una chat può sintetizzare da 0, 1 o 4 pagine — e `'url'` significa *importata da*, non *generata*.

**Model**: `claude-sonnet-5` sugli endpoint AI (`chat-recipe`, `extract-recipes`, `format-recipe`, `suggest-category`, `estimate-calories`). La stringa è centralizzata nella costante `AI_MODEL` (`src/lib/utils/constants.ts`): per cambiare modello si modifica **solo lì** (+ tech stack in README/CLAUDE.md/AGENTS.md). Config thinking per endpoint: `extract-recipes` e `format-recipe` usano `thinking: { type: 'adaptive' }` + `output_config: { effort: 'low' }` (ragionamento leggero per la coerenza ingredienti↔procedimento, costo/latenza vicini al no-thinking); `suggest-category` usa `thinking: { type: 'disabled' }` (classifica JSON banale, serve latenza minima); `estimate-calories` usa `adaptive` + `effort: 'low'` (aritmetica su più ingredienti, non un problema difficile); `chat-recipe` lascia adaptive default. `suggest-category` ed `estimate-calories` usano `output_config.format` con `json_schema` (`additionalProperties: false` + `required`) invece di ripulire i backtick a mano. `output_config.effort` richiede `@anthropic-ai/sdk >= ~0.100` (nel repo `^0.110.0`). Nessun `temperature`/`top_p`/`top_k`/prefill (romperebbero con 400 su Sonnet 5).

---

## 8. Deployment

- Docker Compose: sempre `--env-file .env.local` (non legge `.env.local` automaticamente)
- Build affidabile in sandbox: `npx next build --webpack` (evita problemi Turbopack)
- Se `npx next build --webpack` fallisce con `spawn EPERM` nel sandbox, rilanciare fuori sandbox prima di indagare il codice
- Dopo `npm audit fix`: allineare `package.json` se il lockfile aggiorna una dipendenza diretta già validata
- Per mostrare il pannello credenziali di test nel login in locale: `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true` e riavvio del dev server

---

## 9. Meal Planner Patterns

**Portate e ordine canonico**: `MealType` include `colazione`/`spuntino`/`pranzo`/`merenda`/`cena` (in questo ordine, `SELECTABLE_MEAL_TYPES` in `lib/constants/meal-types.ts`) più i tipi legacy `primo`/`secondo`/`contorno`/`dolce` (non selezionabili, solo render di piani storici). `sortMealTypes(types)` ordina un array di `MealType` per indice in `SELECTABLE_MEAL_TYPES` (legacy in coda, sort stabile) e va applicato **sia in scrittura** (`addMealType`/`copyPlanToWeek` in `useMealPlanner.ts`, `toggleMealType` in `MealPlanSetupForm.tsx`) **sia in lettura** (`WeeklyCalendarGrid.tsx`, `PlanStructureCard.tsx`, `MealPlanSetupForm.tsx`) — vedi gotcha `activeMealTypes` disordinato in Quick Reference.

**No AI / shuffle locale**: il pianificatore non chiama più Claude e `/api/plan-meals` non esiste più. La generazione è locale e gratuita via `buildShuffledSlots()` in `meal-plan-shuffle.ts`. `family-context` resta usato SOLO da chat/testo libero/extract, non dal planner.

**`buildShuffledSlots(recipes, config)`** (pura, testata): assegna ricette esistenti per ogni `(dayIndex, mealType)` rispettando:
- stagione (`matchesSeason`: include la stagione, `tutte_stagioni`, o ricetta senza stagione); fallback al pool completo se < 5 ricette stagionali per quella portata
- `mealTypeConfigs[mealType]`: `excludedCategoryIds` sempre rimosse; `preferredCategoryId` = filtro **secco** (solo quella categoria) se produce almeno una ricetta
- niente ripetizioni nella settimana finché il pool lo permette; portate senza pool restano slot vuoti e sono riportate in `unfilledMealTypes` (la UI mostra un avviso)

**`pickReshuffledRecipe(...)`**: re-roll locale di un singolo slot — sceglie una ricetta diversa della **stessa categoria**, in stagione, non già usata nella settimana; poi rilassa stagione e infine categoria. Sostituisce la vecchia rigenerazione AI; il pulsante ↺ sullo slot chiama questo.

**`MealTypeConfig`** (`preferredCategoryId` + `excludedCategoryIds`): UI "Categorie per portata" **sempre visibile** nello step setup (non più sotto "avanzate"), solo se `categories.length > 0`. Una categoria non può essere sia preferita che esclusa (`setMealPreferred` la rimuove da excluded).

**Copy plan**: `copyPlanToWeek(targetWeek)` riusa `createMealPlan`; **blocca** (throw) se la settimana target ha già un piano. Copia solo `slots`/`activeMealTypes`/`season`/`activeDays`, NON lo stato lista spesa. La data scelta va normalizzata al lunedì (`getWeekMonday`).

**Backward-compat**: i piani AI legacy con slot `newRecipe` (ParsedRecipe inline) restano visualizzabili e salvabili nel ricettario; lo shuffle non genera mai `newRecipe`. Il flag `generatedByAI` resta nel tipo per compat (nuovi piani sempre `false`).

**Shopping List — Derived View**: lista derivata dal `MealPlan`, nessuna collection Firestore separata.
- Slot `existingRecipeId` → `getRecipesByIds()` (batch, deduplicato); slot `newRecipe` → ingredienti inline, zero read extra
- Stato spunte e articoli custom → campi `shoppingCheckedIds` + `shoppingCustomItems` sul documento `meal_plans` (Firestore, cross-device). Fallback localStorage solo se non esiste un piano per quella settimana. Scritture debounced 500ms (vedi gotcha *flush* in Quick Reference)
- Ad ogni cambio locale, lo stato viene specchiato anche nella cache React Query della query del piano (`queryClient.setQueryData`), non solo scritto su Firestore — altrimenti un remount della pagina entro i 2 minuti di `staleTime` rilegge lo snapshot del primo fetch e "resetta" le spunte fatte nel frattempo (vedi gotcha in Quick Reference)
- Aggregazione (`ingredient-aggregator.ts`): chiave canonica accent-insensitive + singolare/plurale IT conservativi (`canonicalIngredientKey`); quantità sommate per dimensione convertibile (massa→g, volume→ml) e riformattate (g↔kg, ml↔l), fallback `" + "` per unità non convertibili o miste. Nomi ambigui o multi-parola restano separati (non-merge = scelta sicura)

**Ad-hoc Shopping List ("Voglio preparare questo")**: meccanismo separato dalla vista derivata dal piano sopra — un bottone sul dettaglio ricetta (`recipe-detail.tsx`) aggiunge i soli ingredienti di quella ricetta a un gruppo ad-hoc, salvato globalmente su `users/{uid}.adHocShoppingRecipes` (`lib/firebase/shopping-adhoc.ts`, stesso pattern di `familyProfile` — nessuna nuova collection/regola/indice), **non** legato a `weekStartDate`.
- **Dedup su `recipeId`**: ri-aggiungere la stessa ricetta **sostituisce** il gruppo esistente (refresh ingredienti), non lo somma né lo duplica — comportamento intenzionale, non un bug
- **Checked state globale**: vive in `AdHocShoppingItem.checked`, cross-settimana; mai riusare `shoppingCheckedIds` del piano (che è per-settimana) per gli item ad-hoc
- `useShoppingList` legge la query `['adHocShopping', uid]` e persiste con un **secondo timer/ref di debounce indipendente** da quello del piano (vedi gotcha "Nuovo target di persistenza dimenticato nel flush" in Quick Reference)
- **Nessun merge cross-blocco**: stesso ingrediente in ad-hoc e nel piano restano sezioni separate, per scelta esplicita
- `ShoppingItemRow` prende props esplicite (`name`/`quantity`/`checked`/`footnote`/`onToggle`/`onRemove`) invece di un `ShoppingItem` intero, così serve sia le righe piano/custom (`ShoppingSection`) sia quelle ad-hoc (`AdHocRecipeGroup`) senza ramificare su `isCustom`
