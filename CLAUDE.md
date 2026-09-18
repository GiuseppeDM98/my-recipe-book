# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-09-18 (Spec F)

> Read [WORKFLOW.md](WORKFLOW.md) before starting: session rules (branch,
> commit, language) and the guided testing protocol.

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Debug-heavy gotchas and implementation patterns |
| [doc/guide/pantry-matching.md](doc/guide/pantry-matching.md) | Domain guide: ingredient ↔ pantry engine, shopping list / pantry / cooking integration |
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
- weekly meal planning (colazione/spuntino/pranzo/merenda/cena, always in canonical day order) with local "shuffle" generation (no AI) and manual editing; **family plan**: every meal knows how many people it is cooked for and can carry per-member variants ("pasta for everyone, minestrone for Sofia")
- weekly shopping list aggregated from the meal plan (quantities scaled to the people planned on each meal, compatible-unit + singular/plural merging), plus ad-hoc "Voglio preparare questo" additions from any recipe, independent of the weekly plan; a "Per reparto / Per ricetta" toggle groups the list by supermarket department (13-department taxonomy shared with the pantry, precedence chain pantry → user override → curated dictionary → "Altro", user-correctable via "Sposta in reparto…")
- family-aware AI quantity guidance via saved household profile (PDF/free-text/chat only)
- estimated nutrition per serving (kcal, serving weight, macronutrients), AI-estimated or entered by hand, with kcal/100g derived on screen and daily **per-person** kcal + macro totals in the planner
- historical cooking statistics
- pantry/dispensa tracking with expiry management and stock levels, wired to the shopping list (water/ice never listed, "Hai già in casa" for what the stock covers, batch "Aggiungi alla dispensa" of checked items) and to cooking (stock deduction proposed at "Termina cottura")
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

### Family plan (people, variants, scaling)
- Slot identity stays `(dayIndex, mealType)`. `MealSlot.servingsPlanned?: number | null` = TOTAL people served (variants included); `MealSlot.variants?: MealSlotVariant[] | null` = `{ id, memberIds, existingRecipeId, recipeTitle }`, **existing cookbook recipes only**. The base meal feeds `servingsPlanned − Σ memberIds.length`, clamped to 0
- **Legacy invariant (sacred)**: `servingsPlanned == null` → no scaling, quantities byte-for-byte as written — such a slot never even enters `scaleQuantity()` (the scaler reformats `1/2` → `0,5` at any factor). The field is written only by the shuffle, the slot editor after an explicit user action, and `updateSlot` on a previously empty cell. No batch migration: lazy dual-read, like `categoryIds`
- Scaling factor = `people / (recipe.servings || 4)` via `scaleQuantity()`, applied in `buildContributions()` before aggregation (`aggregateIngredients`/`mergeQuantities` untouched). Fetch recipes with `collectPlanRecipeIds(plan)` — it includes the variants'. The ad-hoc list is not scaled
- Slot rules are pure and tested in `lib/utils/meal-plan-slots.ts`; a dish swap and the ↺ re-roll keep people and variants (`withBaseRecipe`). Every plan mutation goes through `applyPlan()` and calls `invalidateShoppingList()`; slot mutations read `latestPlanRef`, not the `currentPlan` closure (CHECKLIST comment on `useMealPlanner`)
- Planner nutrition is **per person**: the headline is the base path (unchanged number for plans without variants), `memberDeltas` lists only the members who eat a variant that day. `servingsPlanned` never enters kcal
- Members/default people: `lib/utils/planner-members.ts`. Default for a newly filled cell = `MealPlan.defaultServingsPlanned` (the people chosen at setup, persisted on the plan and carried by copy-plan; it never rescales existing slots) → else valid family members count → else 2. A variant member removed from the profile stays planned (scaling), disappears from kcal, renders "Componente rimosso" — never auto-cleaned
- `null`, never `undefined`, for both new fields (the whole `slots` array is rewritten on every mutation)

### Recipe sections
- Section headers accept **any** name (`## Ingredienti La pasta`, `## Procedimento per il ragù`); a bare `## Ingredienti` means section `null`. Patterns live in `SECTION_HEADER_PATTERNS` (`recipe-parser.ts`)
- Sections render in **order of first appearance** in the array, never alphabetically — document order is the order of preparation
- On a recipe reorganized after the fact the ingredient array no longer implies anything (it is still the old flat listing), so both columns take their order from the steps via `orderedSectionNamesFromSteps()` — pass it as `orderedSections` to `IngredientListCollapsible` wherever a recipe's ingredients and steps are shown together
- `POST /api/reorganize-recipe` proposes sections for a flat recipe but returns **only** `id → section` assignments: no text, no id is ever rewritten, so active `cooking_sessions` and `{{qty:ingredientId}}` tokens survive. Apply it through `applySectionAssignments()` (`lib/utils/section-assignments.ts`), which writes explicit `null` for unassigned items

### Pantry matching (shopping list, batch add, cooking deduction, department view)
Full rules in [doc/guide/pantry-matching.md](doc/guide/pantry-matching.md). The non-negotiables:
- Match an ingredient to the pantry **only** through `lib/utils/ingredient-matching.ts` — never ad-hoc name equality. A non-match is the safe failure: automatic only on exact canonical key or confirmed alias; fuzzy candidates never act alone; no count ↔ mass conversion
- `PantryItem.aliases` holds `canonicalIngredientKey()` output, a persisted format; write it only with `addPantryItemAlias()` (`arrayUnion`)
- The trivial list (water, ice) is closed; custom list items are never filtered nor classified
- Multi-document pantry writes go through `applyPantryBatch()`, accumulated per document first
- Keep the `finalizeCooking` write order: pantry → `pantryDeducted` → history with `entryId` = session id → session delete
- Shopping list department classification (`classifyIngredientDepartment`, `lib/utils/ingredient-departments.ts`) follows a fixed precedence: matched pantry entry's `categoryId` → user override (`users/{uid}.ingredientDepartmentOverrides`) → curated dictionary → `'altro'` fallback. `PANTRY_CATEGORIES` (13 slugs) is the single taxonomy for pantry and shopping list — never a second one

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
- Every theme color in `tailwind.config.js` is `'oklch(var(--x) / <alpha-value>)'`: without the placeholder Tailwind silently emits NO utility for an opacity modifier (`bg-primary/10`…). `borderColor.DEFAULT` is bound to `--border`, so a bare `border` is on-palette in both themes
- Style with semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`) so dark mode adapts for free; never `bg-white dark:bg-black`. `.dark` overrides store **OKLCH components only** (no `oklch()` wrapper/alpha) — see AGENTS.md
- `position: sticky` breaks inside `.shell-stage` (`overflow:hidden`). Desktop (≥1440px) uses an app-shell: fixed-height shell, internal `<main>` scroll — header/sidebar/footer stay put without sticky

---

## Recent Changes (Latest)

### 2026-09-17 — Family plan (people + per-member variants) and planner redesign (Spec F)
- **Model** `MealSlotVariant` + `MealSlot.servingsPlanned`/`variants` (`types/index.ts`), `MealPlanSetupConfig.defaultServingsPlanned`; no new collection/rule/index (fields live in `meal_plans.slots`, owner-based rules)
- **Scaling** `buildContributions` (`ingredient-aggregator.ts`) scales base and variants through `scaleQuantity()`; legacy slots (`servingsPlanned == null`) bypass the scaler entirely; new `collectPlanRecipeIds()` feeds `useShoppingList`'s batch fetch with the variants' recipes
- **Nutrition** `meal-plan-calories.ts` (module name unchanged): `computeDayNutrition`/`computeWeekNutrition` take `members` and return per-person totals + `memberDeltas` (kcal and macros — Spec C was already in, so the §4.3.4 extension point was implemented on the `DayNutrition` shape with Spec C's separate completeness counters, not the spec's "null when one is missing")
- **Hook** `useMealPlanner`: `setSlotServings`, `setSlotVariants`, `defaultServingsPlanned` (via `useFamilyProfile`), `latestPlanRef`/`applyPlan`, `PlannerStep` without the dead `'generating'`; slot rules extracted to pure `lib/utils/meal-plan-slots.ts`, members/default/chips to `lib/utils/planner-members.ts` (`resolveFamilyMemberLabel` now shared with `family-context.ts`)
- **UI**: `MealSlotEditorSheet` + `RecipePickerPanel` replace `RecipePickerSheet` (deleted); `MealSlotCell` variant chips; `PlannerHeader` one row + "Oggi" + ghost "Elimina piano" (user choice, Stamp Rule); `MealPlanSetupForm` = "Giorni e portate" card with the people stepper + collapsed "Stagione e regole" with a live summary (user choice) + CTA bar sticky only below `lg`; `PlanStructureCard` collapsed with summary; empty state / "already has a plan" banner / "Come funziona?" disclosure / empty-grid banner on the page; per-member kcal detail (desktop `title`, mobile expandable row); mobile auto-scroll to today; new shared `ui/disclosure-panel.tsx`; `ServingsStepper` gained `labels`/`disabled`
- **Design process**: `impeccable` skill used for the direction (shape brief confirmed by the user) and for the final review — detector clean (advisory `10px` chips only, mandated by the spec), two batched screenshot rounds at 1600px and 390px
- **Found by the review, pre-existing, fixed app-wide at the user's request**: Tailwind emitted no CSS for opacity modifiers on token colors (`bg-primary/10`, `ring-primary/40`… ~237 usages) because the theme colors lacked `<alpha-value>` — the planner's "today" marker was a default **blue** ring on desktop and invisible on mobile; and a bare `border` fell back to Tailwind's cold `gray-200`, a near-white line in dark mode. `tailwind.config.js`: `<alpha-value>` on every color + `borderColor.DEFAULT` on the `--border` token. Visual pass: 13 pages × light/dark × 1600px/390px before/after, ranked by pixel diff — intended tints and panels light up, dark mode loses its harsh lines, no regressions seen. Two planner texts moved off alpha for contrast (`text-primary/70` date, `text-muted-foreground/80` macros)
- **Spec amended, each point confirmed by the user** (list at the top of `specs/spec-f-…md`, roadmap contract 5): "Conferma N persone" button on legacy slots; variants editable ("Modifica"); base recipe excluded from the variant picker; structure panel collapsed ABOVE the grid; **people chosen at setup persisted as `MealPlan.defaultServingsPlanned`** (was session-only: cells filled after a reload fell back to the family size)
- **Verified** (2026-09-17): `npx tsc --noEmit` exit 0 · `npm test` 317/317 (19 suites) · `npx next build --webpack` exit 0 (77 distinct token/alpha utilities in the production CSS, were 0) · guided test: see "Guided testing tooling" below
- **Not touched**: `aggregateIngredients`/`mergeQuantities`/canonical keys, ad-hoc list scaling, AI endpoints, Firestore rules/indexes, cooking mode

Older entries live in `git log` (each spec ships as one squashed PR, e.g. "feat: integrate pantry with shopping list and cooking" for Spec D), not here.

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
| `node e2e/mirror-dump.mjs` | Guided testing: READ-ONLY dump of the personal account from production into `e2e/scratch/mirror/` (gitignored) — see WORKFLOW.md "Mirroring the real account" |
| `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node e2e/mirror-load.mjs` | Guided testing: load that dump into the emulators (same uid, local throwaway password) |

---

## Guided testing tooling

Installed so manual guided tests can be automated end-to-end instead of asking the user to click through the UI (protocol in [WORKFLOW.md](WORKFLOW.md) — data prepared via throwaway scripts with spy words, one phase per message, expected outcome declared up front, everything scriptable automated).

- **Firebase Emulator Suite**: configured in `firebase.json` (`emulators.auth:9099`, `emulators.firestore:8080`, `emulators.storage:9199`, UI on `:4000`). Start with `npm run emulators`.
- **Client SDK emulator wiring**: opt-in via `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` (see `.env.example`) — `src/lib/firebase/config.ts` and `src/lib/firebase/storage.ts` connect to the local emulators instead of production when set. Unset (default) behaves exactly as before.
- **Admin SDK emulator wiring**: no flag needed — `src/lib/firebase/admin.ts` auto-detects the standard `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` env vars and skips requiring real service-account credentials when set (the emulator doesn't validate them).
- **Playwright**: `@playwright/test` installed as a devDependency, Chromium browser installed locally, config at `playwright.config.ts` (`baseURL` defaults to `http://localhost:3000`, one worker, trace on failure).
- **Throwaway scripts**: guided-testing scripts for a specific guided test go in `e2e/scratch/` (gitignored — never committed) and are deleted at the end of that guided test, per the protocol. Reusable e2e helpers, if any emerge, belong in tracked `e2e/` files instead.

Typical guided-testing session: `npm run emulators` in one terminal, `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev` in another, then a scratch Playwright script under `e2e/scratch/` driving a real browser against the emulated backend, asserting on Firestore/HTTP state rather than page appearance.

Command-level details that cost a debugging round each:
- A scratch script that imports anything from `lib/utils` transitively pulls in `lib/firebase/config.ts`, and Playwright does not load `.env.local` the way Next does → `auth/invalid-api-key` before the test even runs. Prefix the command: `set -a; . ./.env.local; set +a; FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx playwright test ...`
- For the guided tour itself (WORKFLOW.md obligation 4 — never dictate clicks), run the tour spec with `--headed` and end each test with a long `page.waitForTimeout(...)`: the window stays open on the exact URL with the session already authenticated and the interaction already performed, and it is stopped from chat when the user has finished looking.
- A `waitForURL(/\/ricette\/[^/]+$/)` meant to catch the post-create redirect also matches the `/ricette/new` page the script is already on (`new` satisfies `[^/]+`), so the wait resolves immediately and the following assertion reads Firestore before the create has actually happened. Same risk for any dynamic-segment route with a static sibling (`/new`, `/edit`): exclude the sibling explicitly, e.g. `/\/ricette\/(?!new$)[^/]+$/` (2026-09-15).
- A scenario that uses "Voglio preparare questo" on a recipe already in the plan lists every ingredient twice (plan row + ad-hoc row — no cross-block merge, by design): row locators need `.first()`/`.nth()`, otherwise Playwright fails in strict mode and it looks like a broken page (2026-09-15).
- Shopping list state (`shoppingCheckedIds`, custom items, `shoppingPantryIncludedIds`, ad-hoc flags) is written with a 500 ms debounce: assert it with `expect.poll`, never with a single read right after the click — that is a false negative, not a lost write (2026-09-15).
- `lg` is 1440px in this repo and Playwright's default viewport is 1280px: a spec that never sets a ≥1440 viewport exercises only the mobile layouts. Run sheet/dialog flows at a phone width **and** at a desktop width — the Spec D tour found a desktop-only dead overlay the 390px phases couldn't see (2026-09-15).
- Emulators and `next dev` started as Claude Code background tasks are killed when the machine runs low on memory, and the emulator data (in memory) goes with them — it happened twice during the Spec D tour. For a long guided tour, have the user start both in their own terminals, then rerun the seed (2026-09-15).

- A seed that writes `users/{uid}` by hand must include the `uid` field: `auth-context` builds the app's `user` from that DOCUMENT, not from Firebase Auth, so without it every `where('userId', '==', user.uid)` throws `Unsupported field value: undefined` and the page just looks empty (2026-09-17).
- The planner renders BOTH layouts (desktop grid + stacked mobile cards) and hides one with CSS: `getByText(...).first()` resolves to the hidden copy and times out. Chain `.locator('visible=true')` before `.first()`/`.last()` (2026-09-17).
- `waitForLoadState('networkidle')` never resolves against the emulators (Firestore keeps a channel open): a 52-screenshot sweep stalled until the test timeout. Navigate with `waitUntil: 'domcontentloaded'` and wait for a marker (2026-09-17).
- A login helper that navigates with `waitUntil: 'domcontentloaded'` and fills the form right away can land BEFORE React hydrates: the controlled email input is reset to empty, the submit does nothing and `waitForURL` hangs until the test timeout (it looks like a broken login). Refill inside `expect(...).toPass()` until both values stick, then submit (2026-09-17).

Guided tests run with this tooling (add one line for each closed guided test):
- **2026-09-18 — Spec F (family plan + planner redesign)**: first guided test run on the **mirror of the personal account** (dumped read-only with the new tracked `e2e/mirror-dump.mjs`, loaded with `e2e/mirror-load.mjs`; the read is allowed by a permission rule on that exact command in the gitignored local settings) plus spy-word fixtures; 11/11 automated and green at the first complete run, assertions on the emulated Firestore and on HTTP responses: A-invariance on the 3 real pre-Spec F plans (33 isolated ingredients compared with the recipe text, 0 mismatches, 0 missing; check marks kept; opening the editor and blurring the people field writes nothing) and on the spy legacy plan (`400 g`, `1/2 tazza`, `160 g` byte for byte) → B-context (setup prefilled with the family size, 5 people + shuffle → every slot `servingsPlanned: 5`, `variants: null`, plan `defaultServingsPlanned: 5`, all 14 spy quantities scaled as computed by hand, `q.b.` untouched) → C-new behavior (manual plan for 5: default read from the document after a reload; Sofia variant persisted with the base recipe excluded from the picker; `S` chip; `Base ≈620 kcal/pers. · Sofia ≈280`; base ×4 keeps `1/2 tazza` unreformatted, variant ×1; stepper +1 then immediate close persisted; ↺ keeps people and variant; copy carries slots and default, not the shopping state) → D-below the UI (people change and dish change back to back both persisted; on a legacy plan a dish swap keeps `servingsPlanned` null and the list unscaled, a variant sets 3 in the same write on that slot only; 0 console errors) → mobile 390px (bottom sheet full width, kcal detail expandable with Sofia's total, auto-scroll to today, orphan hint) → E-negative (owner PATCH 200 / intruder PATCH and GET 403 `PERMISSION_DENIED` on the same `meal_plans` doc, data unchanged; Sofia removed from the profile → `?` chip "Componente rimosso", list identical, no auto-cleanup, no kcal delta). Tour (F) on the synthetic user, two windows 1600px/390px: header, editor, setup, phone, dark mode — no issues found. Harness bugs fixed on the way: a seed `users/{uid}` without `uid`; a seed that wiped whole collections (would have destroyed the mirror); `.first()` hitting the hidden desktop copy; `networkidle` never resolving; a login form filled before hydration.
- **2026-09-16 — Spec E (shopping list by department)**: synthetic spy-word fixtures in the emulators (recipe + current-week plan + one pantry entry + one ad-hoc group). By user choice the tour ran F first (manual visual pass on the 5 points of the department UI — toggle default, pantry-precedence hiding "Sposta", the move sheet, cross-view check persistence, the new pantry categories in the form — no issues found), then A-E automated and green: A-invariance (the untouched "Per ricetta" view still renders and still checks off items) → B-context switch ("Per reparto" really is the default, PANTRY_CATEGORIES section order, dictionary/fallback/pantry-precedence classification all correct) → C-new behavior ("Sposta in reparto" and the custom-item department select both write `ingredientDepartmentOverrides`, additively, surviving a reload) → D-below the UI (cross-view check marks assert against `meal_plans.shoppingCheckedIds` via `expect.poll`, not page appearance) → E-negative case (owner/intruder pair on `users/{uid}.ingredientDepartmentOverrides`, foreign write → `permission-denied`, owner data unchanged — the pre-existing rule, unmodified by this spec, still holds for the new field). Two script bugs fixed on the way (both harness, not product): a department-section header locator anchored on the bare name broke once "✓ " gets prepended when a section is fully checked (same known pattern as `ShoppingSection`); a reload issued right after a checkbox click raced the 500ms shopping-list debounce — fixed by polling Firestore before reloading, per the existing "assert with `expect.poll`" convention.
- **2026-09-15 — Spec D (pantry ↔ shopping list ↔ cooking)**: synthetic spy-word fixtures in the emulators — the mirror of the personal account was NOT done, the production read was denied by the auto-mode permission classifier. Automated, 21/21 green with assertions on the emulated Firestore and on rule errors: A-invariance 3 (checks survive reload and SPA remount, "Aggiungi articolo" without a plan → localStorage, pantry page) → C 10 (trivial items absent from plan and ad-hoc but kept as custom item; "Hai già in casa" parking and re-include persisted on the plan and on the ad-hoc item, SPA remount included; badges, alias confirmation with immediate recategorization, session-only dismissal; batch add with one increment per entry and checks kept; cooking deduction confirm / "Salta" / session already `pantryDeducted` / abandon, with exactly one history doc whose id is the session id; pantry micro-fixes; desktop quick sheet) → D 4 (history retry idempotent, alias idempotent, pantry batch atomic, fourth plan field) → E 4 own/foreign pairs, foreign → `permission-denied` with data unchanged. Guided tour (F) stopped by the user after two findings, both fixed in session and turned into assertions: on ≥1440px tapping a pantry item left only the blurred overlay (pre-existing `lg:hidden` on `PantryItemQuickSheet`) → centered modal on lg; a partially stocked item didn't say how much to buy → badge "· mancano N" + shortfall prefill (user decision). Not seen by eye: deduction dialog on a phone, dark mode, "Consumato" chips (emulators and dev server killed twice by low memory). Two script bugs fixed on the way: duplicate accessible names plan + ad-hoc, a debounced write read too early.
- **2026-09-15 — Spec C (complete nutrition)**: 5 automated phases (manual form persists weight/macros and the detail page renders the derived kcal/100g → a partial macro trio blocks submit with the exact toast → clearing weight/macros in edit deletes them via `deleteField()`, kcal untouched → a legitimate `fatGrams: 0` stays visible, not hidden by a truthy gate → planner day header shows kcal + partial macro totals, a day with only an unestimated recipe shows neither line), all green, assertions on the emulated Firestore and on rendered text, never page appearance alone. Phase F (real AI estimate, needs `ANTHROPIC_API_KEY`) was skipped by user choice — not run, not counted as verified. 5-point guided tour on the dev server (nutrition row on detail, new form block, planner desktop/mobile layouts, dark mode): no issues found. Script bug found and fixed during Phase A: a `waitForURL` regex (`/\/ricette\/[^/]+$/`) also matched the `/ricette/new` page itself, so the assertion read Firestore before the create had actually redirected — fixed by excluding `new` from the match.
- **2026-09-11 — Spec B (ingredient/method sections)**: 6 automated phases (parser → ordering → end-to-end reorganization with real AI → negative outcome → route called by hand with 401/401/400/200 → ownership pair on the Firestore rules), all green, assertions on Firestore and on the HTTP responses; then a 5-point guided tour on a headed Chromium window opened by the script (obligation 4: never dictate clicks to the user). **Bug found by the guided tour and fixed in session**: on a reorganized recipe the two columns contradicted each other — Ingredients opened with "Per l'assemblaggio" (the ingredient array is still the original flat one, and the first ingredient belonged to the last component) while Preparation correctly started from the ragù via `sectionOrder`. Fixed with `orderedSectionNamesFromSteps()`, which makes both columns follow the step order, plus 5 new tests. Two harness defects fixed: Jest was picking up the Playwright specs in `e2e/` (added `testPathIgnorePatterns` in `jest.config.js`), and a guided-test script that imports `lib/utils` needs `.env.local` exported by hand.
- **2026-08-24 — Spec A (meal ordering + spuntino/merenda)**: 6 phases (seed → read-time self-correction → canonical write via `addMealType` → setup with the pranzo toggle → removing merenda without orphan slots → desktop/mobile screenshots with 5 meals), all green, assertions on real Firestore (not just page appearance). Harness bug discovered and fixed during the guided test: a Playwright assertion based on text already present in the setup form gave a false positive before the Firestore write had completed — fixed by waiting for a marker visible only in the calendar step. No application bugs found.

---

## Database Collections

```text
users/{uid}             # User profiles + familyProfile + adHocShoppingRecipes (items may carry pantryIncluded)
recipes/{id}            # Recipes
categories/{id}         # Recipe categories
cooking_sessions/{id}   # Active cooking progress (+ pantryDeducted once the stock was scaled)
cooking_history/{id}    # Completed cooking events (id = session id since Spec D; older docs random ids)
meal_plans/{id}         # Weekly planner documents (defaultServingsPlanned; slots carry servingsPlanned + per-member variants; + shopping state: checked, custom, shoppingPantryIncludedIds)
pantry_items/{id}       # Pantry items with qty, expiry, stock level, aliases (confirmed canonical keys)
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
