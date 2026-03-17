# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-03-17

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

## Recent Changes (Mar 2026)

### Weekly Meal Planner (Mar 2026)
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

### AI Assistant: Chat Recipe Generation (Mar 2026)
- **Page renamed**: `/estrattore-ricette` → `/assistente-ai`
- **New endpoint** `POST /api/chat-recipe`: `[RISPOSTA]/[RICETTE]` delimiter format
- **Context injection**: Existing recipes passed on first turn to avoid duplicates

### AI Extractor: Free-Text Input (Mar 2026)
- **Tab "Testo libero"**: type/paste any format → `POST /api/format-recipe` → structured recipe

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
