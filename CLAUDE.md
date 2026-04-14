# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-04-14

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
- cooking mode with active session tracking
- weekly meal planning
- historical cooking statistics

Privacy-first architecture: every user-owned document is isolated through Firebase ownership rules.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.2.3, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 |
| Backend | Firebase Auth, Firestore, Firebase Storage |
| AI | Claude Sonnet 4.6 |
| Key Utils | `nosleep.js`, `ingredient-scaler.ts` |

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
│   ├── hooks/            # useAuth, useRecipes, useMealPlanner
│   └── utils/            # parser, scaler, search helpers
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

---

## Recent Changes (Mar-Apr 2026)

### Cooking Mode and Statistics (Apr 2026)
- **Manual cooking completion**: reaching 100% progress no longer auto-closes the session
- **Completion CTA**: cooking mode now shows an explicit `Termina cottura` action when all items are checked
- **Persistent cooking history**: completed sessions are recorded in new Firestore collection `cooking_history`
- **New page** `/statistiche`: shows total completed sessions, most cooked recipes, and recent completions
- **Navigation update**: statistics is available from the dashboard navigation
- **New collection**: `cooking_history` requires Firestore rules and composite index `(userId ASC, completedAt DESC)`

### Recipe and Category UX (Apr 2026)
- **Step reordering**: recipe create/edit now supports manual step ordering with move up/down controls
- **Dynamic step quantities**: recipe steps can now follow ingredient scaling through internal quantity references
- **Legacy step adaptation**: edit recipe now includes a conservative auto-adapt action for upgrading existing static step quantities
- **AI quantity linking**: newly AI-generated recipes can emit structured ingredient/step quantity references that are converted automatically during parsing
- **Cleaner AI step structure**: AI prompts now explicitly prefer one main action or one main quantity reference per step
- **Preset category colors**: category create/edit now uses a curated color palette instead of the browser color input

### Weekly Meal Planner (Mar-Apr 2026)
- **New page** `/pianificatore`: 3-step flow (setup → generating → calendar)
- **AI generation**: `POST /api/plan-meals` mixes cookbook recipes and optional new AI recipes
- **Two-block AI output**: `[PIANO]` JSON lines + `[RICETTE_NUOVE]` markdown recipes
- **Ordered assignment**: new recipes matched to slots by position, not by title
- **Weekly history**: users can keep multiple saved weeks instead of a single replaceable plan
- **Week-aware restore**: planner mount restores the current week, not the latest plan overall
- **Real week navigation**: arrows move across adjacent weeks and open setup for empty weeks
- **Setup recovery UX**: setup keeps the viewed week and exposes shortcuts to saved weeks
- **Date handling fix**: local date helpers replaced `toISOString().slice(0, 10)` for week keys

### Deployment and Security Hardening (Apr 2026)
- **Docker Compose path documented**: self-hosted deployment now has build/run/log workflows in docs
- **Protected AI routes**: all AI endpoints verify Firebase ID tokens server-side
- **Shared client auth headers**: AI requests attach `Authorization: Bearer <idToken>` and now force a fresh token for protected AI calls
- **Firebase Admin runtime support**: Docker/self-hosted deployments can verify tokens via `FIREBASE_ADMIN_CREDENTIALS_BASE64` or split fallback env vars
- **Robust Firebase Admin bootstrap**: service-account base64 parsing now supports Firebase's real snake_case JSON keys and reuses a deterministic admin app name
- **Production requirement**: Vercel deploys need Firebase Admin credentials too, not just `NEXT_PUBLIC_FIREBASE_*`
- **Storage rules tightened**: Firebase Storage access is scoped to user-owned recipe paths
- **Dependency refresh**: project updated and verified on Next.js 16.2.3; `npm audit fix` removed all non-low vulnerabilities currently auto-fixable without unsafe downgrades

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
users/{uid}             # User profiles
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
