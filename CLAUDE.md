# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-07-26

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Debug-heavy gotchas and implementation patterns |
| [DESIGN.md](DESIGN.md) | Visual design system spec (tokens, components, do's/don'ts); sidecar `.impeccable/design.json` |
| [README.md](README.md) | User-facing setup and product overview |
| [Draft Release Temp.md](Draft Release Temp.md) | User-facing release notes draft |

---

## Project Overview

Digital recipe book for home cooks with:
- recipe CRUD with multi-category tagging (a recipe can belong to several categories at once)
- AI-assisted PDF extraction, free-text formatting, and chat recipe generation (chat supports opt-in web search and photo attachments)
- cooking mode with active session tracking and per-step countdown timers
- weekly meal planning with local "shuffle" generation (no AI) and manual editing
- weekly shopping list aggregated from the meal plan (compatible-unit + singular/plural merging), plus ad-hoc "Voglio preparare questo" additions from any recipe, independent of the weekly plan
- family-aware AI quantity guidance via saved household profile (PDF/free-text/chat only)
- estimated kcal per serving, AI-estimated or entered by hand, with daily totals in the planner
- historical cooking statistics
- pantry/dispensa tracking with expiry management and stock levels
- light / dark / system theme (token-driven, system-aware)

Privacy-first architecture: every user-owned document is isolated through Firebase ownership rules.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.2.10, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 |
| Typography | Bodoni Moda + Jost via `next/font/google` |
| Theming | `next-themes` (light / dark / system, `darkMode: 'class'`) |
| Backend | Firebase Auth, Firestore, Firebase Storage |
| AI | Claude Sonnet 5 (costante `AI_MODEL`) |
| State | `@tanstack/react-query` |

---

## Project Structure

```text
src/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   └── api/
├── components/
│   ├── layout/
│   ├── meal-planner/
│   ├── pantry/
│   ├── recipe/
│   ├── shopping-list/
│   └── ui/
├── lib/
│   ├── firebase/
│   ├── hooks/
│   └── utils/
└── types/
```

---

## Critical Patterns

### Navigation
- Desktop: `>= 1440px`
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + drawer sidebar
- Always use `max-lg:portrait:` instead of bare `portrait:`
- Dashboard pages must not add their own outer padding; `layout.tsx` owns page padding

### Firebase
- Never persist `undefined`
- Use `null` where the model expects empties, or omit the key entirely
- All user-owned queries must filter by `userId`
- `where + orderBy` requires composite indexes in `firebase/firestore.indexes.json`

### React Query
- Global `staleTime: 2min`, `retry: false`
- `familyProfile` uses `5min`
- Every auth-bound query must use `enabled: !!user`
- No `onSnapshot` listeners; avoid realtime Firestore cost

### Cooking data
- `cooking_sessions` is active ephemeral state
- `cooking_history` is append-only analytics/history
- Statistics read only from `cooking_history`

### Recipe categories
- Recipes support multiple categories via `categoryIds?: string[]`; the legacy single `categoryId` is `@deprecated` (read-only fallback)
- Always read a recipe's categories through `getRecipeCategoryIds()` (`lib/utils/recipe-categories.ts`), never `recipe.categoryId` directly
- Subcategories have been removed entirely (type, Firebase helpers, UI, Firestore rule and index). Existing `subcategories` documents are inert leftovers

### Calories
- `caloriesPerServing?: number` is **per serving**, never a recipe total: `servings` is editable and cooking mode scales it at runtime
- Always an estimate (AI or manual), never a measured value. A `null` estimate must not be persisted
- Daily planner totals come from `computeWeekCalories()` (`lib/utils/meal-plan-calories.ts`); partial days render with `≥`
- Not shown in the shopping list — per-serving figures don't aggregate into anything a shopper acts on

### Recipe text and timers
- Recipe text persisted in Firebase should remain plain text
- `extractStepDuration()` is shared between parser and form-side auto-detect
- AI prompts use `[ING:n]`, `[QTY:n]`, and `[DUR:N]` consistently

### AI model and prompts
- Model string is centralized in `AI_MODEL` (`lib/utils/constants.ts`) — change it there, then update tech-stack docs; never hardcode a model literal in a route
- On Sonnet 5, `temperature`/`top_p`/`top_k`/`budget_tokens` return **400** — never set them
- Thinking per endpoint: `extract`/`format` run `adaptive` + `output_config.effort: 'low'`; `suggest` is `disabled`; `chat` is adaptive default. `output_config.effort` needs `@anthropic-ai/sdk >= ~0.100`
- `EXTRACTION_PROMPT` and `FORMAT_RECIPE_PROMPT` drop ingredients never used in the procedure (conservative fail-safe: keep everything if the procedure is terse). Keep the rule mirrored in both prompts

### Web search and photos (chat only)
- Both are **opt-in per message** and live only on `chat-recipe`: `extract`/`format` promise fidelity to the source, so a second source of truth there would silently substitute a different recipe
- Web search uses `web_search_20260209` (no beta header); never declare `code_execution` alongside it
- Server-tool responses can return `stop_reason: 'pause_turn'` — always go through `createMessageWithToolLoop()` (`lib/api/claude-tool-loop.ts`)
- Photos are **not** kept in the conversation history (only a text marker); the model's own description carries forward

### Confirmations and touch
- Destructive confirmations use the shared `ConfirmDialog` (built on Radix Dialog); never native `confirm()`/`alert()`. Validation/error feedback uses `react-hot-toast`
- Touch-primary context: don't hide controls behind `group-hover` only (invisible on mobile). Reveal on `lg` only, keep visible below
- Category swatches come from `CATEGORY_COLOR_PRESETS` (earthy, on-brand)

### Theming and desktop scroll
- Style with semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`) so dark mode adapts for free; never `bg-white dark:bg-black`. `.dark` overrides store **OKLCH components only** (no `oklch()` wrapper/alpha) — see AGENTS.md
- `position: sticky` breaks inside `.shell-stage` (`overflow:hidden`). Desktop (≥1440px) uses an app-shell: fixed-height shell, internal `<main>` scroll — header/sidebar/footer stay put without sticky

---

## Recent Changes (Latest)

### 2026-07-26 — kcal, ricerca web + foto in chat, rimozione sottocategorie, portate nel piano
- **kcal per porzione**: nuovo campo `caloriesPerServing?: number` su `Recipe` e su entrambi i `ParsedRecipe`, più la route `POST /api/estimate-calories` (json_schema, `thinking: adaptive` + `effort: 'low'`). Una sola route serve tutti i flussi (PDF, testo libero, chat, ricette esistenti): l'estrazione resta fedele alla fonte e la stima è un passaggio separato, come `suggest-category`. Stima **per porzione** e non totale perché `servings` è modificabile e la cottura lo scala a runtime. Guardie server: `servings >= 1`, valori fuori da 20–3000 kcal → `null` (l'errore tipico del modello è saltare la divisione). Campo manuale nel form (stringa, per distinguere vuoto da `0`; in modifica il vuoto diventa `deleteField()`), pulsante "Stima calorie" nel dettaglio, kcal su card/dettaglio/anteprima e **totali giornalieri** nel pianificatore via `meal-plan-calories.ts` (i giorni parziali si mostrano con `≥`). Esclusa dalla lista spesa per scelta
- **Ricerca web e foto nella chat**, entrambe opt-in e solo su `chat-recipe`: `extract`/`format` hanno un contratto di fedeltà alla fonte, una seconda fonte di verità produrrebbe una sostituzione silenziosa. Web search `web_search_20260209` (nessun beta header, `code_execution` **non** dichiarato). Nuovo `claude-tool-loop.ts` per riprendere su `stop_reason: 'pause_turn'`: senza, `[/RICETTE]` non chiude e **le ricette spariscono senza errore**. `claude-blocks.ts` estrae testo e fonti gestendo il caso in cui `content` è un *oggetto errore* invece di un array (arriva su HTTP 200). Foto ridimensionate client-side (`image-resize.ts`, `imageOrientation: 'from-image'` — le foto da telefono arrivano ruotate), budget 3 foto / 3 MB validato **due volte** (client e server), e **non** persistite nella history (solo un marcatore testuale: 3 foto × 20 turni sarebbero ~280k token)
- **Sottocategorie rimosse del tutto**: erano già staccate dal flusso ricette ma la pagina Categorie continuava a permetterne la creazione. Via ~230 righe di UI, 5 funzioni Firebase, il cascade-delete, il tipo, la regola e l'indice Firestore. I documenti già in `subcategories` restano inerti (nessuna query li legge)
- **Portate e giorni su un piano avviato**: `addMealType`/`removeMealType`/`addDay` in `useMealPlanner` + nuova `PlanStructureCard`. Prima aggiungere "colazione" a una settimana avviata richiedeva di eliminare il piano. `removeMealType` cancella **anche gli slot**: `buildContributions` itera tutti gli slot senza filtrare per `activeMealTypes`, quindi uno slot orfano continuerebbe a contribuire alla lista della spesa. `MEAL_LABELS`/`SELECTABLE_MEAL_TYPES` centralizzati (erano 4 copie divergenti)
- **Structured outputs su `suggest-category`** al posto del fence-stripping manuale, e rimozione di `suggestCategoryAndSeason`/`createCategorizationPrompt` (123 righe morte in `extract-recipes`)

### 2026-07-05 — Upgrade Claude Sonnet 5 + pulizia ingredienti orfani
- **Modello → Claude Sonnet 5** su tutti gli endpoint AI, centralizzato nella costante `AI_MODEL` (`lib/utils/constants.ts`) al posto di 8 literal hardcoded. Migrazione pulita: nessun `temperature`/`top_p`/`top_k`/prefill (romperebbero con 400). SDK `@anthropic-ai/sdk` bumpato a 0.110.0 per abilitare `output_config.effort`
- **Thinking per endpoint**: `extract-recipes`/`format-recipe` usano `thinking: adaptive` + `output_config.effort: 'low'` (ragionamento leggero per la coerenza ingredienti↔procedimento, costo/latenza vicini al no-thinking); `suggest-category` `disabled`; `chat-recipe` adaptive default. `max_tokens` alzati per il nuovo tokenizer (~+30%): format/chat 4000→6000, suggest 500→700
- **Ingredienti orfani**: `EXTRACTION_PROMPT` (§11) e `FORMAT_RECIPE_PROMPT` (§9) ora **omettono** gli ingredienti mai usati/menzionati in nessuno step (refusi della fonte, es. arancia candita nelle sfogliatelle). Regola **conservativa fail-safe**: mantiene tutto se il procedimento è sintetico ("aggiungere i restanti ingredienti", ecc.)
- **Prompt caching valutato e scartato**: uso sporadico → la cache scade prima del riuso (TTL 5 min), sarebbe costo netto (premio scrittura 1,25×) non risparmio

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
| `NEXT_PUBLIC_SHOW_TEST_CREDENTIALS` | Client | Show test credentials in login (dev only) |

Notes:
- All protected AI routes require Firebase Admin credentials at runtime
- On Vercel, prefer `FIREBASE_ADMIN_CREDENTIALS_BASE64`
- For local development, split admin credentials are often easier to manage

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npx next build --webpack` | Reliable build verification |
| `npm audit` | Security audit |
| `npm audit fix` | Apply safe dependency fixes |
| `docker compose --env-file .env.local up --build` | Build and run self-hosted app |
| `firebase deploy --only firestore` | Deploy rules and indexes |
| `npm run emulators` | Start Firebase Auth/Firestore/Storage emulators for guided testing |
| `npm run test:e2e` | Run Playwright e2e specs (`e2e/**`) |

---

## Guided testing tooling

Installed so manual collaudi can be automated end-to-end instead of asking the user to click through the UI (see guided-testing protocol in Claude's memory — data prepared via throwaway scripts with spy words, one phase per message, expected outcome declared up front, everything scriptable automated).

- **Firebase Emulator Suite**: configured in `firebase.json` (`emulators.auth:9099`, `emulators.firestore:8080`, `emulators.storage:9199`, UI on `:4000`). Start with `npm run emulators`.
- **Client SDK emulator wiring**: opt-in via `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (see `.env.example`) — `src/lib/firebase/config.ts` and `src/lib/firebase/storage.ts` connect to the local emulators instead of production when set. Unset (default) behaves exactly as before.
- **Admin SDK emulator wiring**: no flag needed — `src/lib/firebase/admin.ts` auto-detects the standard `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env vars and skips requiring real service-account credentials when set (the emulator doesn't validate them).
- **Playwright**: `@playwright/test` installed as a devDependency, Chromium browser installed locally, config at `playwright.config.ts` (`baseURL` defaults to `http://localhost:3000`, one worker, trace on failure).
- **Throwaway scripts**: guided-testing scripts for a specific collaudo go in `e2e/scratch/` (gitignored — never committed) and are deleted at the end of that collaudo, per the protocol. Reusable e2e helpers, if any emerge, belong in tracked `e2e/` files instead.

Typical guided-testing session: `npm run emulators` in one terminal, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in another, then a scratch Playwright script under `e2e/scratch/` driving a real browser against the emulated backend, asserting on Firestore/HTTP state rather than page appearance.

Collaudi eseguiti con questa tooling (aggiungere una riga per ogni collaudo chiuso):
- *(nessun collaudo ancora eseguito con questa tooling — 2026-08-12: setup iniziale)*

---

## Database Collections

```text
users/{uid}             # User profiles + familyProfile + adHocShoppingRecipes
recipes/{id}            # Recipes
categories/{id}         # Recipe categories
cooking_sessions/{id}   # Active cooking progress
cooking_history/{id}    # Completed cooking events
meal_plans/{id}         # Weekly planner documents
pantry_items/{id}       # Pantry items with qty, expiry, stock level
```

Composite indexes maintained in repo:
- `categories`: `(userId ASC, order ASC)`
- `cooking_history`: `(userId ASC, completedAt DESC)`
- `cooking_sessions`: `(userId ASC, lastUpdatedAt DESC)`
- `meal_plans`: `(userId ASC, weekStartDate DESC)`
- `pantry_items`: `(userId ASC, createdAt DESC)`
- `recipes`: `(userId ASC, createdAt DESC)`

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract-recipes` | PDF → structured recipe extraction |
| `POST /api/format-recipe` | Free text → structured recipe formatting |
| `POST /api/suggest-category` | Category (1-3 names) + season suggestion |
| `POST /api/chat-recipe` | Multi-turn AI recipe generation (opt-in web search + vision) |
| `POST /api/estimate-calories` | Ingredients → estimated kcal per serving |

All endpoints above require an authenticated Firebase session. The weekly meal planner runs entirely client-side (local shuffle) and has no AI endpoint.

---

## Design Context

### Users
Italian households cooking at home. The app is used during real meal prep, often one-handed and in a bright kitchen environment.

### Brand personality
Curated, warm, editorial. It should feel like a private Italian cookbook, not a social food app or a generic SaaS dashboard.

### Aesthetic direction
- Light / dark / system theme (token-driven; dark is a warm "notturno", not pure black)
- Warm cream backgrounds, terracotta primary, sage accent
- Bodoni Moda for editorial emphasis, Jost for body readability
- Strong text hierarchy, generous touch targets, calm surfaces

### Core design principles
1. Cookbook over app
2. Content first
3. Warmth without noise
4. Readability in the kitchen
5. Privacy as a feature
