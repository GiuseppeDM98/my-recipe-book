# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-09-11

> Leggi [WORKFLOW.md](WORKFLOW.md) prima di iniziare: regole di sessione (branch,
> commit, lingua) e protocollo di collaudo guidato.

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
- multi-part recipes split into named sections ("Per il ragù", "La pasta"), with an AI action that proposes sections for a flat recipe already saved
- cooking mode with active session tracking and per-step countdown timers
- weekly meal planning (colazione/spuntino/pranzo/merenda/cena, always in canonical day order) with local "shuffle" generation (no AI) and manual editing
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

### Recipe sections
- Section headers accept **any** name (`## Ingredienti La pasta`, `## Procedimento per il ragù`); a bare `## Ingredienti` means section `null`. Patterns live in `SECTION_HEADER_PATTERNS` (`recipe-parser.ts`)
- Sections render in **order of first appearance** in the array, never alphabetically — document order is the order of preparation
- On a recipe reorganized after the fact the ingredient array no longer implies anything (it is still the old flat listing), so both columns take their order from the steps via `orderedSectionNamesFromSteps()` — pass it as `orderedSections` to `IngredientListCollapsible` wherever a recipe's ingredients and steps are shown together
- `POST /api/reorganize-recipe` proposes sections for a flat recipe but returns **only** `id → section` assignments: no text, no id is ever rewritten, so active `cooking_sessions` and `{{qty:ingredientId}}` tokens survive. Apply it through `applySectionAssignments()` (`lib/utils/section-assignments.ts`), which writes explicit `null` for unassigned items

### Recipe text and timers
- Recipe text persisted in Firebase should remain plain text
- `extractStepDuration()` is shared between parser and form-side auto-detect
- AI prompts use `[ING:n]`, `[QTY:n]`, and `[DUR:N]` consistently

### AI model and prompts
- Model string is centralized in `AI_MODEL` (`lib/utils/constants.ts`) — change it there, then update tech-stack docs; never hardcode a model literal in a route
- On Sonnet 5, `temperature`/`top_p`/`top_k`/`budget_tokens` return **400** — never set them
- Thinking per endpoint: `extract`/`format` run `adaptive` + `output_config.effort: 'low'`; `suggest` is `disabled`; `chat` is adaptive default. `output_config.effort` needs `@anthropic-ai/sdk >= ~0.100`
- `EXTRACTION_PROMPT` and `FORMAT_RECIPE_PROMPT` drop ingredients never used in the procedure (conservative fail-safe: keep everything if the procedure is terse). Keep the rule mirrored in both prompts
- The **prescriptive sections rule** ("distinct components → you MUST create sections") is mirrored between `chat-recipe` and `format-recipe` and deliberately absent from `extract-recipes`, which promises fidelity to the PDF. Don't "fix" the asymmetry — same scoping doctrine as the family context and web search

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

### 2026-09-11 — Sezioni ingredienti/procedimento (Spec B)
- **Bug parser corretto**: la regex delle sezioni catturava solo nomi che iniziano con `per ` (`/##\s+Ingredienti(?:\s+(per\s+.+))?$/i`); un `## Ingredienti La pasta` — proprio la forma che `EXTRACTION_PROMPT` §3 impone di preservare — faceva fallire l'intera regex per via dell'ancora `$`, e la riga veniva comunque consumata dal guard `startsWith` → sezione persa **in silenzio**. Ora `SECTION_HEADER_PATTERNS` (`recipe-parser.ts`) cattura qualsiasi nome e assorbe spazi/`:` finali; `## Ingredienti` nudo resta sezione `null`. Il guard `startsWith('## Ingredienti')` resta case-sensitive (variante tutta maiuscola non riconosciuta, invariato)
- **Regola prescrittiva sulle sezioni**: `chat-recipe` (`REGOLE PER LE RICETTE`) e `format-recipe` (§4) ora **impongono** di dividere in sezioni i piatti con componenti logicamente distinte, con nomi coerenti tra ingredienti e procedimento. `extract-recipes` **deliberatamente NON** la riceve (promette fedeltà alla fonte) — asimmetria voluta, documentata anche con uno scope note nel file della route
- **Ordinamento per prima apparizione**: `ingredient-list-collapsible.tsx` non ordina più le sezioni alfabeticamente (metteva "Per la crema" prima di "Per la base"); `steps-list-collapsible.tsx` sostituisce il fallback `?? 999` con l'indice di prima apparizione, così le sezioni create dal form (che non hanno `sectionOrder`) non finiscono più tutte in coda in ordine casuale
- **Nuova `POST /api/reorganize-recipe`** + pulsante "Organizza in sezioni" nel dettaglio (visibile solo su ricette flat con ≥6 ingredienti e ≥4 step): il modello riceve gli id e restituisce **solo** l'assegnazione `id → sezione`, mai testi. Il server ricalcola `sectionOrder` dall'ordine reale degli step, scarta id inventati e converte in `reorganized: false` una proposta che collassa su una sola sezione (`sanitizeSectionProposal`). Anteprima in Dialog, scrittura solo su conferma
- **Modulo condiviso** `lib/utils/section-assignments.ts` (puro, testato): `sanitizeSectionProposal`, `applySectionAssignments`, `hasNamedSections`, `summarizeSectionProposal`. `applySectionAssignments` scrive `null` esplicito sugli item non assegnati e non tocca id/testi/`order` → cotture attive e token `{{qty:ingredientId}}` restano validi per costruzione
- **Ordine coerente fra le due colonne** (emerso dal collaudo guidato, non previsto dalla spec): gli ingredienti non hanno un campo d'ordine, quindi il loro ordine di sezione è implicito nell'array — che su una ricetta riorganizzata è ancora la vecchia lista piatta e non dice più nulla. `orderedSectionNamesFromSteps()` estrae l'ordine di cottura dagli step (`sectionOrder`) e lo passa come `orderedSections` a `IngredientListCollapsible` (dettaglio ricetta + modalità cottura) e all'anteprima nel Dialog. Solo ordine di render: nessun dato riscritto, nessun campo nuovo su `Ingredient`
- **Non toccato**: contatore globale degli step, init di `prevCheckedRef` nei collapsible, round-trip del form che genera la sezione fantasma `"Ingredienti"` (neutralizzata dal gating di `hasNamedSections`, nessuna migrazione dati)

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

Installed so manual collaudi can be automated end-to-end instead of asking the user to click through the UI (protocol in [WORKFLOW.md](WORKFLOW.md) — data prepared via throwaway scripts with spy words, one phase per message, expected outcome declared up front, everything scriptable automated).

- **Firebase Emulator Suite**: configured in `firebase.json` (`emulators.auth:9099`, `emulators.firestore:8080`, `emulators.storage:9199`, UI on `:4000`). Start with `npm run emulators`.
- **Client SDK emulator wiring**: opt-in via `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (see `.env.example`) — `src/lib/firebase/config.ts` and `src/lib/firebase/storage.ts` connect to the local emulators instead of production when set. Unset (default) behaves exactly as before.
- **Admin SDK emulator wiring**: no flag needed — `src/lib/firebase/admin.ts` auto-detects the standard `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env vars and skips requiring real service-account credentials when set (the emulator doesn't validate them).
- **Playwright**: `@playwright/test` installed as a devDependency, Chromium browser installed locally, config at `playwright.config.ts` (`baseURL` defaults to `http://localhost:3000`, one worker, trace on failure).
- **Throwaway scripts**: guided-testing scripts for a specific collaudo go in `e2e/scratch/` (gitignored — never committed) and are deleted at the end of that collaudo, per the protocol. Reusable e2e helpers, if any emerge, belong in tracked `e2e/` files instead.

Typical guided-testing session: `npm run emulators` in one terminal, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in another, then a scratch Playwright script under `e2e/scratch/` driving a real browser against the emulated backend, asserting on Firestore/HTTP state rather than page appearance.

Two command-level details that cost a debugging round each (2026-09-11):
- A scratch script that imports anything from `lib/utils` transitively pulls in `lib/firebase/config.ts`, and Playwright does not load `.env.local` the way Next does → `auth/invalid-api-key` before the test even runs. Prefix the command: `set -a; . ./.env.local; set +a; FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test ...`
- For the guided tour itself (WORKFLOW.md obbligo 4 — never dictate clicks), run the tour spec with `--headed` and end each test with a long `page.waitForTimeout(...)`: the window stays open on the exact URL with the session already authenticated and the interaction already performed, and it is stopped from chat when the user has finished looking.

Collaudi eseguiti con questa tooling (aggiungere una riga per ogni collaudo chiuso):
- **2026-09-11 — Spec B (sezioni ingredienti/procedimento)**: 6 fasi automatiche (parser → ordinamento → riorganizzazione end-to-end con AI reale → esito negativo → route chiamata a mano con 401/401/400/200 → coppia proprietà sulle regole Firestore), tutte verdi, asserzioni su Firestore e sulle risposte HTTP; poi giro guidato in 5 punti su finestra Chromium headed aperta dallo script (obbligo 4: mai dettare click all'utente). **Bug trovato dal giro guidato e corretto in sessione**: su una ricetta riorganizzata le due colonne si contraddicevano — Ingredienti apriva con "Per l'assemblaggio" (l'array degli ingredienti è ancora quello piatto originale, e il primo ingrediente apparteneva all'ultima componente) mentre Preparazione partiva correttamente dal ragù via `sectionOrder`. Risolto con `orderedSectionNamesFromSteps()` che fa guidare entrambe le colonne dall'ordine degli step, più 5 test nuovi. Due difetti di harness corretti: Jest raccoglieva gli spec Playwright di `e2e/` (aggiunto `testPathIgnorePatterns` in `jest.config.js`), e uno script di collaudo che importa `lib/utils` ha bisogno di `.env.local` esportato a mano.
- **2026-08-24 — Spec A (ordinamento portate + spuntino/merenda)**: 6 fasi (seed → auto-correzione in lettura → scrittura canonica via `addMealType` → setup con toggle pranzo → rimozione merenda senza slot orfani → screenshot desktop/mobile a 5 portate), tutte verdi, asserzioni su Firestore reale (non solo aspetto pagina). Bug di harness scoperto e corretto durante il collaudo: un'asserzione Playwright basata su un testo già presente nel form di setup dava falso positivo prima che la scrittura Firestore fosse completata — corretto attendendo un marker visibile solo nello step calendario. Nessun bug applicativo trovato.

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
| `POST /api/reorganize-recipe` | Existing flat recipe → section assignments keyed on existing ids |

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
