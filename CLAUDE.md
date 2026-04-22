# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-04-21 (session 7)

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Debug-heavy gotchas and implementation patterns |
| [README.md](README.md) | User-facing setup and product overview |
| [Draft Release Temp.md](Draft Release Temp.md) | User-facing release notes draft |

---

## Project Overview

Digital recipe book for home cooks with:
- recipe CRUD and categorization
- AI-assisted PDF extraction, free-text formatting, and chat recipe generation
- cooking mode with active session tracking and per-step countdown timers
- weekly meal planning with AI-assisted generation
- weekly shopping list aggregated from the meal plan
- family-aware AI quantity guidance via saved household profile
- historical cooking statistics

Privacy-first architecture: every user-owned document is isolated through Firebase ownership rules.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.2.3, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 (OKLCH palette) |
| Typography | Bodoni Moda (display, `font-display italic` su h1/h2 chiave) + Jost (body) via `next/font/google` |
| Backend | Firebase Auth, Firestore, Firebase Storage |
| AI | Claude Sonnet 4.6 |
| Key Utils | `nosleep.js`, `ingredient-scaler.ts`, `ingredient-aggregator.ts`, `@tanstack/react-query` |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, Register
│   ├── (dashboard)/      # Ricette, Categorie, Cotture, Assistente AI, Pianificatore, Lista spesa, Statistiche
│   └── api/              # extract-recipes, format-recipe, suggest-category, chat-recipe, plan-meals
├── components/
│   ├── providers.tsx     # QueryClient + AuthProvider (client boundary — necessario per next/font)
│   ├── layout/           # Header, Sidebar, BottomNavigation, MoreSheet
│   ├── meal-planner/     # Planner setup, grid, header, slot actions
│   ├── shopping-list/    # ShoppingListContent, ShoppingSection, ShoppingItemRow, AddCustomItemSheet
│   ├── recipe/           # RecipeForm, RecipeDetail, cooking-related lists
│   └── ui/               # Shared primitives and pickers
├── lib/
│   ├── firebase/         # firestore, categories, cooking-sessions, cooking-history, meal-plans
│   ├── hooks/            # useAuth, useRecipes, useMealPlanner, useCountdownTimer, useShoppingList
│   └── utils/            # parser (extractStepDuration exported), scaler, aggregator, search helpers
└── types/                # Recipe, MealPlan, MealTypeConfig, CookingSession, CookingHistoryEntry, ...
```

---

## Critical Patterns

### Navigation Breakpoint
- Desktop: `>= 1440px`
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sliding sidebar

Always use `max-lg:portrait:` instead of bare `portrait:`.

Pages inside the dashboard layout must **not** add their own outer padding — `<main>` in `layout.tsx` already handles all viewport-specific padding. Use `max-w-* mx-auto` only for content centering.

### Firebase Data
- optional persisted fields: use `null`, never `undefined`
- all user-owned queries must filter by `userId`
- `where + orderBy` queries require explicit composite indexes in `firebase/firestore.indexes.json`

### Cooking Analytics
- `cooking_sessions` is ephemeral active state only
- `cooking_history` is append-only analytics/history data
- statistics read from `cooking_history`, not from active sessions

### Recipe Text Storage
- recipe text stored in Firebase should remain plain text
- `stripMarkdown()` in `recipe-parser.ts` removes markdown artifacts at parse time

### React Query
- global `staleTime: 2min`, `retry: false`; familyProfile uses `5min`
- all queries require `enabled: !!user` — never run without authenticated user
- no `onSnapshot` real-time listeners — deliberately avoided for Firestore cost control
- shared cache key `['recipe', id, uid]` across detail / edit / cooking pages
- shopping list uses `['shoppingList', uid, weekStartDate]` — derived from MealPlan, no dedicated Firestore collection

### Step Duration
- `Step.duration?: number | null` — minutes; null means no timer
- `extractStepDuration()` exported from `recipe-parser.ts`, shared by parser and auto-detect form action
- AI token `[DUR:N]` consistently used across all four AI route prompts (same pattern as `[ING:n]`/`[QTY:n]`)

---

## Recent Changes (Apr 2026)

### Colorize Pass (Apr 2026)
- **Header brand**: "Il Mio Ricettario" → `text-primary` (terracotta); crea identità cromatica immediata
- **Sidebar section label**: "Strumenti AI" → `text-accent` (salvia); differenzia la sezione AI
- **Bottom nav active indicator**: pill `bg-primary/10 rounded-xl` attorno all'icona attiva — orientamento visivo senza side-stripe
- **Recipe card footer icons**: `Clock` e `Users` con `text-primary/70` su tempo e porzioni — warmth senza rumore
- **Season badges fix**: `bg-primary-100 border-primary-200 text-primary-700` erano classi inesistenti in OKLCH → sostituiti con `bg-primary/10 border-primary/20 text-primary`
- **Statistiche rank coloring**: contatore `text-7xl` → `text-primary`; top #1 ha sfondo `bg-primary/5`; rank #1/`text-primary`, #2/`text-accent`, #3+/`text-muted-foreground`
- **Cotture-in-corso cards**: titolo → `font-display italic`; icone colorate su stats (terracotta = ingredienti, salvia = step)
- **Regola colori OKLCH**: usare sempre opacity modifier (`bg-primary/10`) — mai scale numeriche (`bg-primary-100`) che non esistono con CSS vars

### Responsive Sweep (Apr 2026)
- **Cooking page padding fix**: rimosso wrapper `p-4 sm:p-6 lg:p-8` da setup mode e cooking mode — il layout gestisce già il padding per tutti i viewport
- **Titoli ricetta**: `text-5xl` fisso → `text-3xl sm:text-4xl lg:text-5xl` in `recipe-detail.tsx` e cooking mode
- **AI Assistant tab bar**: `px-3 sm:px-5` + `overflow-x-auto` + `flex-shrink-0` — i 3 tab traboccavano su ≤375px
- **Recipe detail action buttons**: `flex-wrap gap-2 sm:gap-4` — 3 bottoni senza wrap traboccavano su schermi stretti
- **Lista spesa**: aggiunto `max-w-2xl mx-auto` (allineato alla convenzione pagine testo)
- **WeeklyCalendarGrid**: `minmax(72px, 1fr)` + `overflow-x-auto` sul wrapper della desktop grid — su landscape stretto (iPhone SE ~568px) colonne a ~65px erano illeggibili

### Layout System & Typography Polish (Apr 2026)
- **h1 uniformati**: tutte le pagine usano `font-display text-4xl font-semibold italic` — erano inconsistenti (alcune `text-3xl font-bold`, alcune `text-2xl`)
- **h2 editoriali**: Ingredienti, Preparazione, Note, Piatti più preparati, Ultime cotture — tutti in `italic`
- **Header brand**: "Il Mio Ricettario" ora in `font-display italic text-2xl font-semibold`
- **Recipe card rewrite**: titolo in display font italic, categoria come label uppercase tiny colorata, footer `border-t` per tempo/porzioni; rimosso il shell shadcn `<Card>` generico
- **Recipe detail stats**: sostituiti 4 box identici `p-4 bg-secondary` con riga inline editoriale (`text-2xl font-bold` + label small)
- **Sidebar raggruppata**: sezione "Strumenti AI" (Assistente, Pianificatore, Lista spesa); active state `bg-primary/10 text-primary`; link diretti senza Button component
- **Padding desktop**: `lg:p-6` → `lg:px-10 lg:py-8`
- **PlannerHeader centrato**: da `justify-between` a `flex-col items-center` — navigazione e azioni centrate
- **Regola max-width**: pagine griglia (ricette, categorie) senza max-w; pagine testo (statistiche, profilo) con `max-w mx-auto`; `container mx-auto` rimosso ovunque (non configurato in tailwind.config.js)

### UX Polish & Design System (Apr 2026)
- **Typography editoriale**: `font-display italic` applicato sistematicamente su tutti gli h1 (`text-4xl`/`text-5xl`) e h2 di sezione — recipe title, page headings, section headers (Ingredienti, Preparazione, Note)
- **Token sweep completo**: tutti i `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-white` sostituiti con token semantici OKLCH in ~30 file; zero Tailwind gray hardcoded rimasti
- **Elementi HTML nativi**: `<textarea>`, `<select>`, `<input>` nudi in `recipe-form.tsx`, `category-selector.tsx`, `family-profile-card.tsx` ora hanno `bg-background text-foreground` esplicito (il browser non eredita CSS custom properties)
- **MealSlotCell rewrite**: rimossi tutti i `border-l-4` (side-stripe ban); sostituiti con badge angolari `absolute top-1.5 left-1.5` — `Sparkles+AI` per ricette AI-generate, `BookOpen` per ricette del ricettario
- **Filter /ricette collassabile**: da 3 righe filtri sempre visibili a pannello disclosure con bottone "Filtra" + contatore filtri attivi + chip rimovibili; filtri mai visibili di default
- **Cooking mode sticky CTA**: "Termina cottura" in sticky footer permanente (disabled < 100%, enabled al completamento); rimosso l'alert inline che spariva dopo dismiss
- **Empty states**: ridisegnati in tutte le pagine — emoji + `font-display italic` + `bg-muted/30 rounded-xl border dashed`
- **Shopping list**: week navigation con label "Settimana del" esplicita; empty state migliorato
- **Fix deterministici scanner**: `animate-bounce` → `animate-pulse` (chat typing indicator); `bg-black/50` → `bg-foreground/60` (sidebar overlay); tab `border-b-2` → `border-b-[2px]` (evita scanner flag)

### Design & Theming Audit (Apr 2026)
- **Palette OKLCH**: `globals.css` sostituisce HSL shadcn default con OKLCH — crema `97% 0.01 75`, terracotta `52% 0.13 42`, marrone scuro `18% 0.03 55`, salvia `50% 0.08 148`. `tailwind.config.js` usa `oklch(var(--token))` come wrapper.
- **Tipografia**: Bodoni Moda (`--font-display`) + Jost (`--font-body`) caricati via `next/font/google`. Root layout è server component; `src/components/providers.tsx` estrae QueryClient + AuthProvider.
- **Animazioni collapsible**: `max-h-[N]` → `grid-rows-[0fr] → grid-rows-[1fr]` — GPU-friendly, nessun layout thrash. `motion-reduce:transition-none` su tutti.
- **A11y**: `aria-expanded` su collapsible; `role=button`/`tabIndex`/`onKeyDown` su `<li>` interattivi; `aria-current="page"` in sidebar e bottom nav; `pb-safe` su bottom nav iOS.
- **Statistiche**: layout editoriale — contatore `text-7xl` + frase narrativa (rimossi 3 hero metric cards).

### Weekly Shopping List (Apr 2026)
- **New page** `/lista-spesa`: aggregates all ingredients from the current week's meal plan into a checkable shopping list
- **Week navigation**: prev/next arrows reuse `addWeeksToDateString` + `getCurrentWeekMonday` from `src/lib/constants/seasons.ts`
- **Ingredient aggregation**: `buildContributions()` + `aggregateIngredients()` in `src/lib/utils/ingredient-aggregator.ts`; same-unit numeric sum, `" + "` concatenation fallback; no fuzzy name matching
- **Both slot types included**: existing cookbook recipes (fetched via `getRecipesByIds()`) and AI-generated `newRecipe` slots (ingredients read inline from `ParsedRecipe`, no extra Firestore reads)
- **localStorage persistence**: checked state and custom items keyed by `shopping_list:{uid}:{weekStartDate}`; no new Firestore collection
- **Custom items**: users can add manual items via a bottom sheet; custom items show a delete button
- **Progress bar**: checked/total count with percentage, turns green at 100%
- **Collapsible sections**: one section per ingredient group; null section shown last as "Senza categoria"
- **Navigation**: "Lista della spesa" added to sidebar (after Pianificatore) and MoreSheet
- **New utility**: `getRecipesByIds(ids, userId)` in `firestore.ts` — batch fetch via `Promise.all`, deduplicates IDs, returns `Map<id, Recipe>`

### Cooking Mode UX Polish (Apr 2026)
- **Today highlight in planner**: `WeeklyCalendarGrid` now highlights the current day with a primary-color ring (desktop) or border/tint (mobile card); uses local year/month/date comparison, not timestamp
- **Section completion visual**: `IngredientListCollapsible` and `StepsListCollapsible` turn green (`border-green-400 bg-green-50`) when all items in a section are checked; includes ✓ in the section header; both named sections and flat (null) sections supported; no effect in non-interactive mode
- **Section auto-collapse with animation**: when a section becomes fully complete, it collapses automatically with a 300ms `max-h` + opacity transition; uses `prevCheckedRef` initialized at mount to avoid collapsing already-complete sections on page reload; user can manually re-open; once a section is complete the auto-close won't re-trigger

### Meal Planner Improvements (Apr 2026)
- **Dietary preference chips**: setup form now has toggles for common dietary restrictions (Senza carne, Senza pesce, Vegetariano, Vegano, Senza glutine, Ricco di legumi); injected into the AI prompt
- **Free-text notes**: textarea "Note e preferenze" (max 500 chars) in setup; injected as `NOTE UTENTE` block in the prompt; not persisted in Firestore
- **Single slot regeneration**: `↺` button on each occupied calendar slot; reuses `/api/plan-meals` with a single-day/meal config; `regeneratingSlots: Set<string>` keyed as `"dayIndex-mealType"`
- **Specific days selection**: chip selector Lun–Dom in setup; grid renders only active days; `activeDays` persisted in `MealPlan`; backward compat for old plans via `?? [0..6]`
- **Unified per-meal category settings**: replaced separate "preferred category" + "excluded categories" sections with per-meal cards (Preferisci dropdown + Escludi chips); new `MealTypeConfig` type; same category cannot be both preferred and excluded for the same meal type
- **Season filter (hard)**: server-side filter now sends only seasonal-matching recipes to Claude (+ `tutte_stagioni` + untagged); fallback to full pool if < 5 seasonal recipes survive; prompt language changes from soft ("Preferisci") to hard ("GIÀ SOLO")
- **Ingredient names in AI summaries**: recipe summaries sent to Claude now include `ingredientNames: string[]`; previously Claude could only infer dietary constraints from recipe titles

### Cooking Mode & Timers (Apr 2026)
- **React Query migration**: tutti i data hook migrati da `useState+useEffect` a `@tanstack/react-query`
- **Per-step countdown timers**: cooking mode con `▶ Avvia timer` per ogni step con durata; timer multipli in parallelo
- **Floating timer overlay**: chip fissi top-right con MM:SS countdown e stop button
- **Completion CTA**: `Termina cottura` in sticky footer — non più auto-close al 100%
- **Cooking history**: `cooking_history` collection per statistiche; statistiche in `/statistiche`

---

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | Client + Server | Firebase web config |
| `ANTHROPIC_API_KEY` | Server only | Claude API access |
| `FIREBASE_ADMIN_CREDENTIALS_BASE64` | Server only | Preferred Firebase Admin credentials |
| `FIREBASE_ADMIN_PROJECT_ID` | Server only | Admin fallback |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Server only | Admin fallback |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Server only | Admin fallback |
| `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS` | Client | Mostra credenziali test in login (solo `.env.local` in dev) |

Notes:
- All protected AI routes require Firebase Admin credentials at runtime for token verification.
- On Vercel, prefer `FIREBASE_ADMIN_CREDENTIALS_BASE64`.
- For local development, the split `FIREBASE_ADMIN_PROJECT_ID` / `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` setup is usually easier to manage.

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npx next build --webpack` | Reliable build verification in sandboxed environments |
| `npm audit` | Security audit |
| `npm audit fix` | Apply safe lockfile/package fixes when available |
| `docker compose --env-file .env.local build` | Build self-hosted image |
| `docker compose --env-file .env.local up --build` | Build and run self-hosted app |
| `docker compose --env-file .env.local logs -f app` | Follow app logs |
| `docker compose --env-file .env.local down` | Stop self-hosted stack |
| `firebase deploy --only firestore` | Deploy rules and indexes |

---

## Database Collections

```
users/{uid}             # User profiles + familyProfile
recipes/{id}            # Recipes (user-owned)
categories/{id}         # Recipe categories
subcategories/{id}      # Category children
cooking_sessions/{id}   # Active cooking progress only
cooking_history/{id}    # Completed cooking events for analytics/history
meal_plans/{id}         # Weekly planner documents
```

Composite indexes currently maintained in repo:
- `categories`: `(userId ASC, order ASC)`
- `cooking_history`: `(userId ASC, completedAt DESC)`
- `cooking_sessions`: `(userId ASC, lastUpdatedAt DESC)`
- `meal_plans`: `(userId ASC, weekStartDate DESC)`
- `recipes`: `(userId ASC, createdAt DESC)`
- `subcategories`: `(categoryId ASC, userId ASC, order ASC)`

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract-recipes` | PDF → structured recipe extraction |
| `POST /api/format-recipe` | Free text → structured recipe formatting |
| `POST /api/suggest-category` | Category + season suggestion |
| `POST /api/chat-recipe` | Multi-turn AI recipe generation |
| `POST /api/plan-meals` | Weekly meal-plan generation |

All endpoints above require an authenticated Firebase session.

---

## Design Context

### Users
Famiglie italiane che cucinano insieme. L'app viene usata in cucina durante la preparazione dei pasti — spesso con le mani occupate, luce naturale, e ritmo quotidiano. Non è un'app di scoperta o social: è uno strumento personale e privato, usato da persone che la conoscono bene.

### Brand Personality
**Curato, elegante, gastronomico.** Come un cookbook italiano di qualità — raffinato ma non freddo, ispirazionale ma non pretenzioso. In 3 parole di design: **preciso, caldo, editoriale.**

### Aesthetic Direction
- **Light mode.** Sfondi caldi come carta panna/pergamena (oklch ~97% con hue caldo), mai bianco puro. Accenti terrosi: terracotta, verde salvia.
- **Tipografia**: Bodoni Moda (display) + Jost (body) — editoriale italiano, leggibile in cucina.
- **Palette OKLCH**: background crema oklch(97% 0.01 75), testo marrone scuro oklch(18% 0.03 55), accento terracotta oklch(52% 0.13 42), verde salvia oklch(50% 0.08 148).
- **Anti-riferimenti**: niente Instagram/food social, niente AI/SaaS dashboard, niente delivery app, niente corporate.

### Design Principles
1. **Cookbook over app** — ogni schermata dovrebbe sembrare una pagina di un libro di cucina curato.
2. **Contenuto al centro** — testo, ingredienti, passaggi sono la sostanza; l'interfaccia li serve.
3. **Calore senza rumore** — colori naturali e tipografia elegante; niente decorazioni fini a se stesse.
4. **Leggibilità in cucina** — testo grande, contrasto alto, zone di tocco generose.
5. **Privatezza come orgoglio** — niente social, niente condivisione forzata.
