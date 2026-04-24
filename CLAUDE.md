# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-04-24

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
| Frontend | Next.js 16.2.3, React 18.2, TypeScript 5.3, Tailwind CSS 3.4 |
| Typography | Bodoni Moda + Jost via `next/font/google` |
| Backend | Firebase Auth, Firestore, Firebase Storage |
| AI | Claude Sonnet 4.6 |
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

### Recipe text and timers
- Recipe text persisted in Firebase should remain plain text
- `extractStepDuration()` is shared between parser and form-side auto-detect
- AI prompts use `[ING:n]`, `[QTY:n]`, and `[DUR:N]` consistently

---

## Recent Changes (Last 2-3 Months)

### Editorial UI system
- Introduced a cinematic editorial shell through `shell-stage`, `shell-panel`, warmer OKLCH surfaces, and shared typography across dashboard pages
- Unified loading, empty, inline status, and toast feedback through shared UI primitives instead of page-by-page placeholders
- Removed the global auth bootstrap loader; protected routes now rely on page-local states to avoid route-to-route flash

### Planner and shopping flows
- Added the weekly shopping list at `/lista-spesa`, derived directly from the saved meal plan and local per-week checklist state
- Expanded planner setup with dietary chips, free-text notes, specific-day planning, and per-meal category preferences/exclusions
- Added single-slot regeneration with a dedicated note dialog and current-slot context so small changes behave like dish variations instead of full replacements
- Added post-generation day removal in the planner so an active week can be corrected without rebuilding it

### Planner reliability and save flow
- Planner AI recipe cards are saveable only when a real `newRecipe` payload exists
- Save-to-cookbook now normalizes optional recipe fields before writing to Firestore
- `/api/plan-meals` now enforces stricter parity between `[PIANO]` and `[RICETTE_NUOVE]`, especially for single-slot regeneration, and fails explicitly on partial AI output

### Recipe and cooking UX
- Recipe filters on `/ricette` are now collapsible with active chips and precomputed counts for smoother interaction
- The recipe step editor is cleaner on mobile, with controls moved below content and lighter step chrome
- Cooking mode supports multiple simultaneous timers, sticky completion CTA, section completion feedback, and dynamic step quantity scaling

### Responsive cleanup
- Planner desktop columns are wider and recipe titles are more legible
- The mobile-landscape/tablet sidebar drawer is now opaque and easier to read
- AI Assistant tabs and several dashboard layouts were tightened to avoid small-screen overflow

### Design system polish and UX fixes (2026-04)
- Replaced hardcoded Tailwind `green-*`, `orange-500`, `purple-*` with design system tokens (`accent`, `primary`, `border`) across cooking mode collapsibles, shopping list, progress bar, AI assistant, family profile, and planner AI cards
- Fixed `text-white` and `hover:bg-white/20` in cooking mode — replaced with `text-primary-foreground` and `hover:bg-primary-foreground/20`
- Fixed active cooking session not appearing on `/cotture-in-corso` without hard refresh: added `queryClient.invalidateQueries` after `createCookingSession` and `deleteCookingSession`
- Removed loading flash on `/cotture-in-corso` by decoupling the empty-state render from `isLoading`
- Removed loading flash on AI Assistant tab switches by converting `RecipeTextInput` and `RecipeChatInput` from `next/dynamic` to static imports
- Fixed Italian accented characters written as ASCII apostrophes (`li'`, `c'e'`, `piu'`, `cio'`) across recipe list, AI assistant, and shopping list pages

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

---

## Database Collections

```text
users/{uid}             # User profiles + familyProfile
recipes/{id}            # Recipes
categories/{id}         # Recipe categories
subcategories/{id}      # Category children
cooking_sessions/{id}   # Active cooking progress
cooking_history/{id}    # Completed cooking events
meal_plans/{id}         # Weekly planner documents
```

Composite indexes maintained in repo:
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
| `POST /api/plan-meals` | Weekly meal-plan generation and slot regeneration |

All endpoints above require an authenticated Firebase session.

---

## Design Context

### Users
Italian households cooking at home. The app is used during real meal prep, often one-handed and in a bright kitchen environment.

### Brand personality
Curated, warm, editorial. It should feel like a private Italian cookbook, not a social food app or a generic SaaS dashboard.

### Aesthetic direction
- Light mode only
- Warm cream backgrounds, terracotta primary, sage accent
- Bodoni Moda for editorial emphasis, Jost for body readability
- Strong text hierarchy, generous touch targets, calm surfaces

### Core design principles
1. Cookbook over app
2. Content first
3. Warmth without noise
4. Readability in the kitchen
5. Privacy as a feature
