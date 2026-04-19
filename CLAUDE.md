# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-04-19

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
- weekly meal planning
- family-aware AI quantity guidance via saved household profile
- historical cooking statistics

Privacy-first architecture: every user-owned document is isolated through Firebase ownership rules.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.2.3, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 |
| Backend | Firebase Auth, Firestore, Firebase Storage |
| AI | Claude Sonnet 4.6 |
| Key Utils | `nosleep.js`, `ingredient-scaler.ts`, `@tanstack/react-query` |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, Register
│   ├── (dashboard)/      # Ricette, Categorie, Cotture, Assistente AI, Pianificatore, Statistiche
│   └── api/              # extract-recipes, format-recipe, suggest-category, chat-recipe, plan-meals
├── components/
│   ├── layout/           # Header, Sidebar, BottomNavigation, MoreSheet
│   ├── meal-planner/     # Planner setup, grid, header, slot actions
│   ├── recipe/           # RecipeForm, RecipeDetail, cooking-related lists
│   └── ui/               # Shared primitives and pickers
├── lib/
│   ├── firebase/         # firestore, categories, cooking-sessions, cooking-history, meal-plans
│   ├── hooks/            # useAuth, useRecipes, useMealPlanner, useCountdownTimer
│   └── utils/            # parser (extractStepDuration exported), scaler, search helpers
└── types/                # Recipe, MealPlan, CookingSession, CookingHistoryEntry, ...
```

---

## Critical Patterns

### Navigation Breakpoint
- Desktop: `>= 1440px`
- Mobile portrait: bottom navigation
- Mobile landscape: hamburger + sliding sidebar

Always use `max-lg:portrait:` instead of bare `portrait:`.

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

### Step Duration
- `Step.duration?: number | null` — minutes; null means no timer
- `extractStepDuration()` exported from `recipe-parser.ts`, shared by parser and auto-detect form action
- AI token `[DUR:N]` consistently used across all four AI route prompts (same pattern as `[ING:n]`/`[QTY:n]`)

---

## Recent Changes (Mar–Apr 2026)

### Cooking Timers, React Query, and UX (Apr 2026)
- **React Query migration**: all data hooks and pages migrated from manual `useState+useEffect` to `@tanstack/react-query`; navigating back to a viewed recipe costs zero extra Firestore reads (2min stale time)
- **Per-step countdown timers**: cooking mode now shows an "▶ Avvia timer" button for any step with a duration; multiple timers can run in parallel (each step has its own independent countdown)
- **Floating timer overlay**: all active timers are shown as fixed chips (top-right), each with step label, MM:SS countdown, and a stop button
- **Step duration field**: recipe create/edit now has a "Durata (min)" input per step (`max={9999}`, supports up to ~166h)
- **Auto-detect durations**: edit recipe now includes an "Auto-rileva durate" button that scans step text and pre-fills durations non-destructively (skips steps that already have a value)
- **AI duration tokens**: all four AI route prompts now emit `[DUR:N]` on steps with a single clear duration; the parser strips the token and sets `step.duration` automatically
- **`extractStepDuration`**: two-pass detection (AI token first, then Italian regex: ranges, hours+minutes, hours, minutes, seconds); exported from `recipe-parser.ts` for reuse
- **Sticky save button**: "Salva Modifiche" in recipe edit is now `sticky bottom-0 max-lg:portrait:bottom-20` so it stays visible while scrolling long recipes

### Cooking Mode and Statistics (Apr 2026)
- **Manual cooking completion**: reaching 100% progress no longer auto-closes the session
- **Completion CTA**: cooking mode now shows an explicit `Termina cottura` action when all items are checked
- **Persistent cooking history**: completed sessions are recorded in new Firestore collection `cooking_history`
- **New page** `/statistiche`: shows total completed sessions, most cooked recipes, and recent completions
- **New collection**: `cooking_history` requires Firestore rules and composite index `(userId ASC, completedAt DESC)`

### Recipe and Category UX (Apr 2026)
- **Step reordering**: recipe create/edit now supports manual step ordering with move up/down controls
- **Dynamic step quantities**: recipe steps can now follow ingredient scaling through internal quantity references
- **Legacy step adaptation**: edit recipe now includes a conservative auto-adapt action for upgrading existing static step quantities
- **AI quantity linking**: newly AI-generated recipes can emit structured ingredient/step quantity references that are converted automatically during parsing
- **Preset category colors**: category create/edit now uses a curated color palette instead of the browser color input
- **Step ingredient name fallback**: `renderStepDescription` now detects when an ingredient name is absent from surrounding step text and appends it automatically (`"15 g di noci o mandorle"`); fixes existing recipes without data migration; all four AI route prompts updated to require the name alongside `[QTY:n]`

### Family Profile and AI Context (Apr 2026)
- **New page** `/profilo-famiglia`: users can save household members and optional notes
- **Persistent household profile**: family context is stored in `users/{uid}.familyProfile` and reused across supported AI flows
- **Targeted AI usage**: family profile can be enabled in free-text formatting, AI chat, and the weekly planner; PDF extraction is excluded (pure extraction)

### Weekly Meal Planner (Mar–Apr 2026)
- **New page** `/pianificatore`: 3-step flow (setup → generating → calendar)
- **AI generation**: `POST /api/plan-meals` mixes cookbook recipes and optional new AI recipes
- **Two-block AI output**: `[PIANO]` JSON lines + `[RICETTE_NUOVE]` markdown recipes
- **Weekly history**: users can keep multiple saved weeks; planner restores the current week on mount
- **Real week navigation**: arrows move across adjacent weeks and open setup for empty weeks

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
