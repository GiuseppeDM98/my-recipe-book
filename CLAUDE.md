# Il Mio Ricettario - AI Developer Reference

> **Status**: Phase 1 MVP - Production Ready | **Updated**: 2026-03-16

## Quick Reference

| Resource | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | Gotchas and patterns (debug >30min) |
| [README.md](README.md) | User documentation and setup |
| [docs/](docs/) | Design documents (DD1, DD2, DD3) |

---

## Project Overview

Digital recipe book with AI-powered PDF extraction, free-text recipe formatting, and AI chat recipe generation. Text-focused, privacy-first, optimized for actual cooking use. Italian cuisine focus with seasonal ingredient classification.

**Target users**: Home cooks digitizing recipe collections, users with PDF cookbooks, anyone wanting AI-generated recipe suggestions.

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
│   ├── (dashboard)/      # Ricette, Categorie, Cotture, Assistente AI
│   └── api/              # extract-recipes, format-recipe, suggest-category, chat-recipe
├── components/
│   ├── ui/               # Button, Card, Dialog, Sheet, etc.
│   ├── recipe/           # RecipeForm, RecipeCard, RecipeTextInput, RecipeChatInput
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

### AI Assistant: Chat Recipe Generation (Mar 2026)
- **Page renamed**: `/estrattore-ricette` → `/assistente-ai`, title "Assistente Ricette AI"
- **New tab "Chat AI"**: Conversational AI chef that suggests new recipes based on user requests and existing cookbook context
- **New endpoint** `POST /api/chat-recipe`: multi-turn conversation, returns `{ reply, extractedRecipes }` via `[RISPOSTA]/[RICETTE]` delimiters
- **New component** `RecipeChatInput`: chat UI with history, auto-scroll, typing indicator, starter prompt chips
- **Context injection**: Existing recipes passed on first turn so AI avoids duplicate suggestions
- **Chat appends recipes**: Unlike PDF/text modes, chat accumulates cards across turns
- **`source.name`**: Chat recipes saved as `'Generata con Chat AI'`
- **Parser fix**: `parseRecipeSection` now uses `findIndex` for `#` title (was assuming `lines[0]`)

### AI Extractor: Free-Text Input (Mar 2026)
- **Tab "Testo libero"**: Users type/paste recipe in any format; Claude reformats it
- **Endpoint** `POST /api/format-recipe`: text → Claude → same markdown as PDF pipeline
- **`source.type`**: text recipes saved as `'manual'`, PDF recipes as `'pdf'`

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
| `POST /api/chat-recipe` | Chat message + history -> Claude -> reply + recipe markdown |

---

## Resources

- **Gotchas**: [AGENTS.md](AGENTS.md) - Critical patterns that cause >30min debug
- **User Docs**: [README.md](README.md) - Installation, usage, features
- **Comments**: [COMMENTS.md](COMMENTS.md) - Code commenting guidelines
- **Design**: [docs/](docs/) - DD1 (MVP), DD2 (Advanced), DD3 (AI)
