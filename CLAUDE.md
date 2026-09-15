# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-09-15

> Read [WORKFLOW.md](WORKFLOW.md) before starting: session rules (branch,
> commit, language) and the guided testing protocol.

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
- estimated nutrition per serving (kcal, serving weight, macronutrients), AI-estimated or entered by hand, with kcal/100g derived on screen and daily kcal + macro totals in the planner
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

### Nutrition (calories, serving weight, macros)
- `caloriesPerServing?: number`, `servingWeightGrams?: number`, `macrosPerServing?: MacrosPerServing` (`{ proteinGrams, carbsGrams, fatGrams }`) are all **per serving**, never a recipe total: `servings` is editable and cooking mode scales it at runtime. Same shape on `Recipe` and on **both** `ParsedRecipe`s (`types/index.ts`, `recipe-parser.ts`)
- Always an estimate (AI or manual), never a measured value. A `null`/incomplete estimate must not be persisted — `MacrosPerServing` is all-or-nothing (a partial trio can't be expressed), the form blocks submit with a toast if only 1-2 of the 3 macro fields are filled
- kcal/100g is **never persisted**: derived at render time (`caloriesPerServing / servingWeightGrams * 100`), only when both are present and weight `> 0`
- `0` is a legitimate value for weight-independent macros (e.g. `fatGrams: 0`) — every display/aggregation gate on the new fields uses `!= null`, never truthiness. `caloriesPerServing`'s existing truthy gates stay valid only because 0 kcal is unreachable by construction (server min 20, form `> 0`)
- `/api/estimate-calories` fills all three in **one** AI call: the model returns kcal-per-serving directly (as before) but weight/macros as recipe **totals**; the server (`deriveNutritionPerServing()`, `lib/utils/nutrition-estimate.ts`) divides by servings and clamps (weight 30-1500 g/serving, each macro 0-300 g/serving) plus an Atwater consistency check (`4·protein + 4·carbs + 9·fat` within ±30% of kcal) — a failed check drops macros only, kcal and weight survive independently
- `useEstimateNutrition()` (`lib/hooks/useEstimateNutrition.ts`) is **fill-the-gaps**: re-estimating a recipe only writes fields it doesn't already have, so a manual value is never overwritten
- Daily planner totals come from `computeWeekNutrition()`/`computeDayNutrition()` (`lib/utils/meal-plan-calories.ts`, module name unchanged): kcal and macros have **separate** completeness counters (a pre-macros recipe has kcal but no macros), partial totals render with `≥`
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

### 2026-09-15 — Complete nutrition: serving weight, kcal/100g, macros (Spec C)
- **New `MacrosPerServing` type** (`types/index.ts`): `{ proteinGrams, carbsGrams, fatGrams }`, all-or-nothing (see "Nutrition" above). `servingWeightGrams?` and `macrosPerServing?` added to `Recipe` and to both `ParsedRecipe` declarations (`types/index.ts` and `recipe-parser.ts`)
- **`/api/estimate-calories` extended, still one AI call**: prompt renamed `createNutritionEstimationPrompt`, schema `NUTRITION_ESTIMATION_SCHEMA` (shape/types only — no `minimum`/`maximum`, which would 400 the whole request), `max_tokens` 900 → 1400 (thinking-adaptive reasoning tokens plus a bigger JSON output need the headroom). The model returns weight and macros as recipe **totals**; the new `lib/utils/nutrition-estimate.ts` (`deriveNutritionPerServing`, pure and unit-tested) divides by servings and applies plausibility clamps + the Atwater sanity check server-side — the route no longer does this inline
- **Client**: `getAICalorieEstimateForRecipe` → `getAINutritionEstimateForRecipe` (`recipe-parser.ts`, returns the three fields); `useEstimateCalories` → `useEstimateNutrition` (`lib/hooks/useEstimateNutrition.ts`, **fill-the-gaps**: writes only fields the recipe doesn't already have, so re-estimating never overwrites a manual value)
- **Form** (`recipe-form.tsx`): 4 new string-state fields (weight + 3 macros, same empty-string-means-no-estimate pattern as kcal); submit is blocked with a toast if only 1-2 of the 3 macro fields are filled (`MacrosPerServing` can't express a partial trio); clearing a field on edit uses `deleteField()` (updateDoc merges, so omitting the key would leave the old value)
- **Display**: recipe detail gets a secondary nutrition row (`≈ N g`, `N kcal/100 g`, `P/C/G` — all `!= null` gated) below the existing meta row; the "Stima calorie" button becomes "Stima valori nutrizionali" and now also shows once kcal are present but weight/macros aren't; extraction preview gets two new chips; recipe card is **unchanged** (kcal only, by design)
- **Planner**: `computeDayCalories`/`computeWeekCalories` → `computeDayNutrition`/`computeWeekNutrition` (`meal-plan-calories.ts`, module path unchanged) with separate kcal/macro completeness counters; `WeeklyCalendarGrid` renders a second, smaller macro line under the kcal line on both desktop and mobile
- **Not touched**: shopping list (documented out-of-scope — per-serving figures don't aggregate into anything a shopper acts on), recipe card, cooking mode, `extract-recipes`/`format-recipe`/`chat-recipe`/`suggest-category`, per-person scaling (Spec F)

Older entries live in `git log` (each spec ships as one squashed PR, e.g. "feat: add recipe sections with AI reorganization" for Spec B), not here.

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

Installed so manual guided tests can be automated end-to-end instead of asking the user to click through the UI (protocol in [WORKFLOW.md](WORKFLOW.md) — data prepared via throwaway scripts with spy words, one phase per message, expected outcome declared up front, everything scriptable automated).

- **Firebase Emulator Suite**: configured in `firebase.json` (`emulators.auth:9099`, `emulators.firestore:8080`, `emulators.storage:9199`, UI on `:4000`). Start with `npm run emulators`.
- **Client SDK emulator wiring**: opt-in via `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (see `.env.example`) — `src/lib/firebase/config.ts` and `src/lib/firebase/storage.ts` connect to the local emulators instead of production when set. Unset (default) behaves exactly as before.
- **Admin SDK emulator wiring**: no flag needed — `src/lib/firebase/admin.ts` auto-detects the standard `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env vars and skips requiring real service-account credentials when set (the emulator doesn't validate them).
- **Playwright**: `@playwright/test` installed as a devDependency, Chromium browser installed locally, config at `playwright.config.ts` (`baseURL` defaults to `http://localhost:3000`, one worker, trace on failure).
- **Throwaway scripts**: guided-testing scripts for a specific guided test go in `e2e/scratch/` (gitignored — never committed) and are deleted at the end of that guided test, per the protocol. Reusable e2e helpers, if any emerge, belong in tracked `e2e/` files instead.

Typical guided-testing session: `npm run emulators` in one terminal, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in another, then a scratch Playwright script under `e2e/scratch/` driving a real browser against the emulated backend, asserting on Firestore/HTTP state rather than page appearance.

Two command-level details that cost a debugging round each (2026-09-11):
- A scratch script that imports anything from `lib/utils` transitively pulls in `lib/firebase/config.ts`, and Playwright does not load `.env.local` the way Next does → `auth/invalid-api-key` before the test even runs. Prefix the command: `set -a; . ./.env.local; set +a; FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test ...`
- For the guided tour itself (WORKFLOW.md obligation 4 — never dictate clicks), run the tour spec with `--headed` and end each test with a long `page.waitForTimeout(...)`: the window stays open on the exact URL with the session already authenticated and the interaction already performed, and it is stopped from chat when the user has finished looking.
- A `waitForURL(/\/ricette\/[^/]+$/)` meant to catch the post-create redirect also matches the `/ricette/new` page the script is already on (`new` satisfies `[^/]+`), so the wait resolves immediately and the following assertion reads Firestore before the create has actually happened. Same risk for any dynamic-segment route with a static sibling (`/new`, `/edit`): exclude the sibling explicitly, e.g. `/\/ricette\/(?!new$)[^/]+$/` (2026-09-15).

Guided tests run with this tooling (add one line for each closed guided test):
- **2026-09-15 — Spec C (complete nutrition)**: 5 automated phases (manual form persists weight/macros and the detail page renders the derived kcal/100g → a partial macro trio blocks submit with the exact toast → clearing weight/macros in edit deletes them via `deleteField()`, kcal untouched → a legitimate `fatGrams: 0` stays visible, not hidden by a truthy gate → planner day header shows kcal + partial macro totals, a day with only an unestimated recipe shows neither line), all green, assertions on the emulated Firestore and on rendered text, never page appearance alone. Phase F (real AI estimate, needs `ANTHROPIC_API_KEY`) was skipped by user choice — not run, not counted as verified. 5-point guided tour on the dev server (nutrition row on detail, new form block, planner desktop/mobile layouts, dark mode): no issues found. Script bug found and fixed during Phase A: a `waitForURL` regex (`/\/ricette\/[^/]+$/`) also matched the `/ricette/new` page itself, so the assertion read Firestore before the create had actually redirected — fixed by excluding `new` from the match.
- **2026-09-11 — Spec B (ingredient/method sections)**: 6 automated phases (parser → ordering → end-to-end reorganization with real AI → negative outcome → route called by hand with 401/401/400/200 → ownership pair on the Firestore rules), all green, assertions on Firestore and on the HTTP responses; then a 5-point guided tour on a headed Chromium window opened by the script (obligation 4: never dictate clicks to the user). **Bug found by the guided tour and fixed in session**: on a reorganized recipe the two columns contradicted each other — Ingredients opened with "Per l'assemblaggio" (the ingredient array is still the original flat one, and the first ingredient belonged to the last component) while Preparation correctly started from the ragù via `sectionOrder`. Fixed with `orderedSectionNamesFromSteps()`, which makes both columns follow the step order, plus 5 new tests. Two harness defects fixed: Jest was picking up the Playwright specs in `e2e/` (added `testPathIgnorePatterns` in `jest.config.js`), and a guided-test script that imports `lib/utils` needs `.env.local` exported by hand.
- **2026-08-24 — Spec A (meal ordering + spuntino/merenda)**: 6 phases (seed → read-time self-correction → canonical write via `addMealType` → setup with the pranzo toggle → removing merenda without orphan slots → desktop/mobile screenshots with 5 meals), all green, assertions on real Firestore (not just page appearance). Harness bug discovered and fixed during the guided test: a Playwright assertion based on text already present in the setup form gave a false positive before the Firestore write had completed — fixed by waiting for a marker visible only in the calendar step. No application bugs found.

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
| `POST /api/estimate-calories` | Ingredients → estimated kcal, serving weight and macronutrients per serving |
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
