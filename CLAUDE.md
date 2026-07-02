# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-07-02

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
- AI-assisted PDF extraction, free-text formatting, and chat recipe generation
- cooking mode with active session tracking and per-step countdown timers
- weekly meal planning with local "shuffle" generation (no AI) and manual editing
- weekly shopping list aggregated from the meal plan (compatible-unit + singular/plural merging)
- family-aware AI quantity guidance via saved household profile (PDF/free-text/chat only)
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
- Subcategories no longer apply to recipes (removed from the recipe form/selector); the Subcategories management page under Categorie is unaffected

### Recipe text and timers
- Recipe text persisted in Firebase should remain plain text
- `extractStepDuration()` is shared between parser and form-side auto-detect
- AI prompts use `[ING:n]`, `[QTY:n]`, and `[DUR:N]` consistently

### Confirmations and touch
- Destructive confirmations use the shared `ConfirmDialog` (built on Radix Dialog); never native `confirm()`/`alert()`. Validation/error feedback uses `react-hot-toast`
- Touch-primary context: don't hide controls behind `group-hover` only (invisible on mobile). Reveal on `lg` only, keep visible below
- Category swatches come from `CATEGORY_COLOR_PRESETS` (earthy, on-brand)

### Theming and desktop scroll
- Style with semantic tokens (`bg-background`, `text-foreground`, `bg-card`, `border-border`) so dark mode adapts for free; never `bg-white dark:bg-black`. `.dark` overrides store **OKLCH components only** (no `oklch()` wrapper/alpha) — see AGENTS.md
- `position: sticky` breaks inside `.shell-stage` (`overflow:hidden`). Desktop (≥1440px) uses an app-shell: fixed-height shell, internal `<main>` scroll — header/sidebar/footer stay put without sticky

---

## Recent Changes (Latest)

### 2026-07-02 — Ricette multi-categoria + dependency security patches
- **Multi-categoria** (`types/index.ts`, `lib/utils/recipe-categories.ts`): `Recipe.categoryIds?: string[]` sostituisce il singolo `categoryId` (ora `@deprecated`, dual-read via `getRecipeCategoryIds()`, stesso schema di migrazione lazy di `season` → `seasons[]`); sottocategorie rimosse dal flusso ricette (`subcategoryId` eliminato dal tipo `Recipe`)
- **Selettore + form** (`category-selector.tsx`, `recipe-form.tsx`): da cascata categoria/sottocategoria a chip multi-select; salvataggio scrive `categoryIds[]` e azzera il legacy `categoryId` con `deleteField()` in edit
- **Card + liste** (`recipe-card.tsx`, `ricette/page.tsx`): badge categoria multipli (cap 2 + `+N`, tint dal colore salvato via alpha hex); filtro lista resta single-select ma matcha su intersezione; conteggi incrementano ogni categoria di ricette multi-categoria; rimosso interamente il filtro/conteggio sottocategoria
- **AI + meal planner**: `/api/suggest-category` propone 1-3 nomi categoria (`AISuggestion.categoryNames[]`, rimosso `isNewCategory`); tutti i flussi di salvataggio AI (assistente, pianificatore) risolvono N nomi → `categoryIds` via `Promise.all(createCategoryIfNotExists)`; shuffle/re-roll/filtri del pianificatore matchano su intersezione di categorie
- **Sicurezza**: `npm audit fix` — 22 → 10 vulnerabilità (rimosse tutte le high/critical); Next.js patchato 16.2.3 → 16.2.10 entro il range `^16.2.3` già dichiarato (nessuna modifica a `package.json`)
- ⚠️ Leggere sempre le categorie di una ricetta tramite `getRecipeCategoryIds()`, mai `recipe.categoryId` diretto (vedi AGENTS.md)

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
pantry_items/{id}       # Pantry items with qty, expiry, stock level
```

Composite indexes maintained in repo:
- `categories`: `(userId ASC, order ASC)`
- `cooking_history`: `(userId ASC, completedAt DESC)`
- `cooking_sessions`: `(userId ASC, lastUpdatedAt DESC)`
- `meal_plans`: `(userId ASC, weekStartDate DESC)`
- `pantry_items`: `(userId ASC, createdAt DESC)`
- `recipes`: `(userId ASC, createdAt DESC)`
- `subcategories`: `(categoryId ASC, userId ASC, order ASC)`

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract-recipes` | PDF → structured recipe extraction |
| `POST /api/format-recipe` | Free text → structured recipe formatting |
| `POST /api/suggest-category` | Category (1-3 names) + season suggestion |
| `POST /api/chat-recipe` | Multi-turn AI recipe generation |

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
