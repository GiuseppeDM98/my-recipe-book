# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-03-08

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Gotchas and patterns (debug >30min) |
| [README.md](README.md) | User documentation and setup |
| [docs/](docs/) | Design documents (DD1, DD2, DD3) |

---

## Project Overview

Digital recipe book with AI-powered PDF extraction and free-text recipe formatting. Text-focused, privacy-first, optimized for actual cooking use. Italian cuisine focus with seasonal ingredient classification.

**Target users**: Home cooks digitizing recipe collections, users with PDF cookbooks.

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
│   ├── (dashboard)/      # Ricette, Categorie, Cotture, Estrattore
│   └── api/              # extract-recipes, format-recipe, suggest-category
├── components/
│   ├── ui/               # Button, Card, Dialog, Sheet, etc.
│   ├── recipe/           # RecipeForm, RecipeCard, RecipeTextInput, CategorySelector
│   └── layout/           # Header, Sidebar, BottomNavigation
├── lib/
│   ├── constants/        # seasons.ts (centralized season constants)
│   ├── firebase/         # firestore.ts, categories.ts, cooking-sessions.ts
│   ├── hooks/            # useAuth, useRecipes
│   └── utils/            # recipe-parser.ts, ingredient-scaler.ts, search.ts
└── types/                # Recipe, Ingredient, Step, Category, CookingSession
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

### Cooking Sessions
- Setup screen pattern (no useEffect creation)
- Auto-delete at 100% progress

### AI Recipe Parser
- `stripMarkdown()` in `recipe-parser.ts` strips `**bold**` / `*italic*` at parse time
- Always store plain text in Firebase — never markdown in recipe fields

---

## Recent Changes (Jan 2026 - Mar 2026)

### AI Parser Bug Fixes (Mar 2026)
- **Ingredient scaling fix**: Text-extracted recipes now correctly split `name` and `quantity` — scaler works on serving change. Parser uses 4 cascading strategies (see [AGENTS.md](AGENTS.md) §7)
- **Metadata extraction fix**: Prep/cook times no longer show N/A — parser accepts both `**Label:**` (bold) and `Label:` (plain) metadata headers from Claude
- **`format-recipe` prompt**: Ingredient format changed to `"nome, quantità"` (e.g., `"Pasta, 200 g"`) for correct parser split

### AI Extractor: Free-Text Input (Mar 2026)
- **New tab "Testo libero"**: Users type/paste recipe in any format; Claude reformats it
- **New endpoint** `POST /api/format-recipe`: text → Claude → same markdown as PDF pipeline
- **New component** `RecipeTextInput`: textarea with 50-char minimum, char counter
- **`source.type`**: text recipes saved as `'manual'`, PDF recipes as `'pdf'`
- **Shared pipeline**: `processExtractedMarkdown()` reused by both PDF and text modes
- **Model**: all endpoints updated to `claude-sonnet-4-6`

### Recipe Search & Multiple Seasons (Jan 2026)
- **Recipe search**: Client-side title search with Italian character support (à, è, ì, ò, ù)
- **Multiple seasons**: Recipes can have multiple season tags (e.g., autunno + inverno)
- **Lazy migration**: Backward-compatible from single `season` to `seasons[]` array
- **Centralized constants**: Season icons/labels in `lib/constants/seasons.ts`

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
| `npm run test` | Run Jest tests |
| `npm run lint` | ESLint |

---

## Database Collections

```
users/{uid}           # User profiles
recipes/{id}          # Recipes (userId field for ownership)
categories/{id}       # User categories
subcategories/{id}    # Nested under categories
cooking_sessions/{id} # Active cooking progress
```

All documents require `userId` field. Security rules enforce ownership.

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/extract-recipes` | PDF -> Claude -> Markdown (max 4.4MB) |
| `POST /api/format-recipe` | Free text -> Claude -> Markdown (single recipe) |
| `POST /api/suggest-category` | Recipe -> Category + Season suggestion |

---

## Resources

- **Gotchas**: [AGENTS.md](AGENTS.md) - Critical patterns that cause >30min debug
- **User Docs**: [README.md](README.md) - Installation, usage, features
- **Comments**: [COMMENTS.md](COMMENTS.md) - Code commenting guidelines
- **Design**: [docs/](docs/) - DD1 (MVP), DD2 (Advanced), DD3 (AI)
