# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-04-11

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Gotchas and patterns (debug >30min) |
| [README.md](README.md) | User documentation and setup |
| [docs/](docs/) | Feature specs and future plans |

---

## Project Overview

Digital recipe book with AI-powered PDF extraction, free-text recipe formatting, AI chat recipe generation, and weekly meal planning. Text-focused, privacy-first, optimized for actual cooking use. Italian cuisine focus with seasonal ingredient classification.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.1.6, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 |
| Backend | Firebase Auth + Firestore, Claude API (claude-sonnet-4-6) |
| Key Utils | `nosleep.js` (wake lock), `ingredient-scaler.ts` (quantity scaling) |

---

## Project Structure

```
src/
├── app/
│   ├── (auth)/           # Login, Register
│   ├── (dashboard)/      # Ricette, Categorie, Cotture, Assistente AI, Pianificatore
│   └── api/              # extract-recipes, format-recipe, suggest-category, chat-recipe, plan-meals
├── components/
│   ├── ui/               # Button, Card, Dialog, Sheet, etc.
│   ├── recipe/           # RecipeForm, RecipeCard, RecipeTextInput, RecipeChatInput
│   ├── meal-planner/     # MealPlanSetupForm, WeeklyCalendarGrid, MealSlotCell, ...
│   └── layout/           # Header, Sidebar, BottomNavigation
├── lib/
│   ├── constants/        # seasons.ts (getCurrentSeason, getCurrentWeekMonday)
│   ├── firebase/         # firestore.ts, categories.ts, cooking-sessions.ts, meal-plans.ts
│   ├── hooks/            # useAuth, useRecipes, useMealPlanner
│   └── utils/            # recipe-parser.ts, ingredient-scaler.ts, search.ts
└── types/                # Recipe, Ingredient, MealType, MealSlot, MealPlan, ...
```

---

## Critical Patterns

**See [AGENTS.md](AGENTS.md) for all gotchas.** Key patterns:

### Navigation Breakpoint
- **Desktop**: >= 1440px (sidebar always visible)
- **Mobile Portrait**: Bottom nav (4 tabs)
- **Mobile Landscape**: Hamburger + sliding sidebar

**CRITICAL**: Use `max-lg:portrait:` not `portrait:` to avoid desktop conflicts.

### Firebase Data
- Use `null` for optional fields (never `undefined`)
- All queries must filter by `userId`
- Composite indexes required for `where + orderBy` — add to `firebase/firestore.indexes.json`

### AI Recipe Parser
- `stripMarkdown()` in `recipe-parser.ts` strips `**bold**` / `*italic*` at parse time
- Always store plain text in Firebase — never markdown in recipe fields

---

## Recent Changes (Mar-Apr 2026)

### Weekly Meal Planner (Mar-Apr 2026)
- **New page** `/pianificatore`: 3-step flow (setup → generating → calendar)
- **AI generation**: `POST /api/plan-meals` — Claude picks from existing cookbook + generates new recipes
- **Two-block AI output**: `[PIANO]` (one JSON line per slot) + `[RICETTE_NUOVE]` (markdown)
- **Ordered assignment**: new recipes matched to slots by position, not title (title-matching is fragile)
- **Per-meal sliders**: configurable count of AI-generated recipes per meal type
- **Course category hints**: optional preferred category per meal type, sent as AI prompt hints
- **AI category/season suggestions**: included in `[PIANO]` JSON for `type="new"` slots, pre-populate save form
- **"Go to recipe" link**: green cells link directly to `/ricette/{id}`
- **MealType**: `'colazione' | 'pranzo' | 'cena' | 'primo' | 'secondo' | 'contorno' | 'dolce'` (course types wired but not shown in form UI yet)
- **New collection**: `meal_plans` — requires composite Firestore index `(userId ASC, weekStartDate DESC)`
- **Firebase rules**: `meal_plans` security rules added to `firebase/firestore.rules`
- **Weekly history**: one plan per week can coexist in Firebase; "Nuovo piano" no longer deletes the current week
- **Week-aware restore**: page mount loads the current week, not the latest plan overall
- **Real week navigation**: prev/next arrows load adjacent weeks and fall back to setup when a week has no saved plan
- **Setup recovery UX**: setup keeps the viewed week, shows saved plan shortcuts, and can reopen existing weeks without leaving the form
- **Date handling fix**: week keys now use local date formatting helpers instead of `toISOString()` to avoid timezone drift in Europe/Rome

### Deployment: Vercel + Docker Compose (Apr 2026)
- **Dual deployment path**: project now documents two first-class deployment options
  - `Vercel` for managed hosting
  - `Docker Compose` for self-hosting on a local machine or VPS
- **New artifacts**: `Dockerfile`, `compose.yaml`, `.dockerignore`
- **Next standalone runtime**: existing `output: 'standalone'` is now documented as the production container strategy
- **Docker build fix**: standalone container build now tolerates repositories without a `public/` directory
- **Env model documented**:
  - `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_REGISTRATIONS_ENABLED` are build-time sensitive in Docker
  - `ANTHROPIC_API_KEY` remains runtime-only
- **Compose workflow documented**:
  - `build`, `up --build`, `up --build -d`, `up -d`, `logs -f app`, `down`
- **Runtime verified**:
  - `docker compose --env-file .env.local build` passes
  - `docker compose --env-file .env.local up --build -d` starts successfully
  - app responds on port `3000`
- **Google OAuth clarification**:
  - No auth code changes required for Docker
  - Self-hosted production requires the deployed public hostname in Firebase Auth → `Authorized domains`
  - Fallback for installs without OAuth setup: `NEXT_PUBLIC_REGISTRATIONS_ENABLED=false`
- **Docs updated**: `README.md` and `SETUP.md` now include self-hosted Docker Compose setup, env instructions, troubleshooting, and reverse-proxy notes

---

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_FIREBASE_*` | Client + Server | Firebase config (6 vars) |
| `ANTHROPIC_API_KEY` | Server Only | Claude AI API |

---

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (localhost:3000) |
| `npm run build` | Production build |
| `docker compose --env-file .env.local build` | Build the self-hosted production image only |
| `docker compose --env-file .env.local up --build` | Build and run self-hosted production container locally |
| `docker compose --env-file .env.local up -d` | Start the already-built self-hosted container in background |
| `docker compose --env-file .env.local logs -f app` | Follow app container logs |
| `docker compose --env-file .env.local down` | Stop and remove self-hosted containers |
| `firebase deploy --only firestore` | Deploy rules + indexes |

---

## Database Collections

```
users/{uid}           # User profiles
recipes/{id}          # Recipes (userId field for ownership)
categories/{id}       # User categories
cooking_sessions/{id} # Active cooking progress
meal_plans/{id}       # Weekly meal plans (userId, weekStartDate, slots[], activeMealTypes[])
```

Composite index required: `meal_plans` on `(userId ASC, weekStartDate DESC)`.

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract-recipes` | PDF -> Claude -> Markdown (max 4.4MB) |
| `POST /api/format-recipe` | Free text -> Claude -> Markdown |
| `POST /api/suggest-category` | Recipe -> Category + Season suggestion |
| `POST /api/chat-recipe` | Chat message + history -> reply + recipe markdown |
| `POST /api/plan-meals` | Setup config + recipes -> weekly meal plan slots |

---

## Resources

- **Gotchas**: [AGENTS.md](AGENTS.md)
- **User Docs**: [README.md](README.md)
- **Feature specs**: [docs/](docs/) — meal planner history, etc.
