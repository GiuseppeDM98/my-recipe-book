# Draft Release Notes

## ✨ New Features

- Added a new Statistics page to track your most cooked recipes, total completed cooking sessions, and recent completions
- Added cooking history tracking so completed sessions can power long-term stats and activity insights
- Added manual step reordering when creating or editing recipes

### 💬 AI Chat Recipe Generation
You can now ask the AI to suggest new recipes through a chat interface. Describe what ingredients you have, request a specific cuisine or dietary style, or simply ask for something different from what's already in your cookbook — the AI will propose one or more recipes you can save instantly.

- Added "Chat AI" tab in the AI Assistant page
- The AI knows your existing cookbook and avoids suggesting duplicates
- Multi-turn conversation: refine the recipe with follow-up messages ("make it vegetarian", "reduce the cooking time")
- Generated recipes appear as preview cards below the chat, ready to review and save
- Works like PDF and free-text extraction: AI suggests category and season automatically

### 🖊️ Free-Text Recipe Input in AI Extractor
You can now type or paste a recipe in any format directly into the AI Extractor — no PDF needed. Just write something like "pasta al pomodoro: 400g spaghetti, a can of tomatoes, garlic..." and Claude will turn it into a perfectly structured recipe ready to save.

- Added "Free text" tab in the AI Extractor page alongside the existing PDF tab
- Accepts rough notes, copy-pasted text, or informally written recipes in any format
- Claude automatically formats ingredients, steps, sections, and metadata
- AI category and season suggestions work exactly like with PDF extraction

### 🔍 Recipe Search
Search your recipes by name directly from the recipes page. The search supports Italian characters (à, è, ì, ò, ù) and works seamlessly with existing season and category filters.

- Fast, real-time search as you type
- Works with Italian accented characters
- Combines with season and category filters for refined results
- Shows result count and clear button for convenience

### 🌸☀️🍂❄️ Multiple Seasons per Recipe
You can now assign multiple seasons to a single recipe. Perfect for dishes that work well across different times of year, like Pasta e Fagioli (autumn + winter).

- Select one or more seasons when creating or editing recipes
- Recipe cards display all assigned season badges
- Filter view shows recipes for each selected season
- Existing recipes automatically migrate when edited

### 📱 Apple Home Screen Icon
When adding Il Mio Ricettario to your iPad home screen, you'll now see the custom recipe book icon instead of a generic screenshot.

### 📅 Weekly Meal Planner
Plan your meals for the entire week — powered by AI or built manually slot by slot.

- Added new "Pianificatore" page accessible from the sidebar and "More" menu
- Choose between AI-generated planning or manual mode (fill slots yourself by clicking)
- AI picks recipes from your existing cookbook and optionally generates brand-new ones
- Configure how many new AI recipes you want per meal type (breakfast, lunch, dinner)
- Filter by season; optionally assign a preferred category to each meal type so the AI picks more relevant recipes
- AI automatically suggests category and season for each newly generated recipe — pre-filled in the save form
- Edit any slot after generation: click a cell to swap the recipe
- Green cells (existing cookbook recipes) show a "Go to recipe" link for quick access
- Purple cells (AI-generated, not yet saved) show a "Save to cookbook" button that opens the save panel directly
- Plans are saved to Firebase and restored automatically on the next visit
- Added weekly plan history, so multiple saved weeks can coexist instead of replacing the previous plan
- Added real week-to-week navigation in the planner, including empty weeks that open a pre-filled setup screen
- Added saved-week shortcuts during plan creation, so you can reopen an existing weekly plan without leaving setup

## 🐛 Bug Fixes

- Fixed cooking sessions closing automatically as soon as all ingredients and steps were checked
- Fixed ingredient quantities not updating when changing the number of servings for recipes added via the "Free text" tab in the AI Extractor
- Fixed preparation and cooking times showing as N/A for some PDF-extracted recipes
- Fixed "Save to cookbook" button in meal planner calendar cells not opening the save panel (it scrolled to the card but left it collapsed)
- Fixed meal plans not restoring on page reload due to a missing Firestore composite index
- Fixed self-hosted Docker Compose startup failing on installations without a `public` assets folder
- Fixed weekly planner navigation sometimes opening the wrong week or suggesting a new plan for an existing saved week

## 🔧 Improvements

- Improved cooking mode with a clear "Finish cooking" action after completing a recipe
- Improved category creation and editing with a faster preset color palette
- **Renamed AI Extractor to AI Assistant**: The page is now called "Assistente Ricette AI" to reflect its expanded capabilities beyond just PDF extraction
- **Upgraded AI model**: All AI features now use Claude Sonnet 4.6 for improved quality and accuracy
- **Cleaner recipe text**: Fixed an issue where AI would sometimes include formatting symbols (asterisks) in step descriptions — all recipe text is now stored as clean plain text
- **Centralized Season Management**: Season labels and icons are now consistent across the entire application
- **Backward Compatibility**: Existing recipes with single seasons continue to work perfectly
- **Italian Character Support**: All text search functions now properly handle Italian diacritics
- Added a self-hosted Docker deployment option alongside Vercel so users can run the app on their own machine or VPS
- Added a documented fallback for self-hosted installations that do not want to configure Google sign-in
- Improved the planner header to clearly separate "New plan" from "Delete plan"
- Improved planner recovery when browsing weeks without a saved plan, making it easier to return to active plans
- Improved AI features so they now consistently require a valid signed-in session before running
- Improved self-hosted setup guidance for protected AI features by documenting the required Firebase Admin runtime credentials

## 🔒 Security

- Fixed 4 npm vulnerabilities: `fast-xml-parser` (critical), `minimatch` (high), `@isaacs/brace-expansion` (high), `ajv` (moderate)
- Updated the app to a patched Next.js release to address current framework security advisories
- Added server-side authentication checks to all AI-powered endpoints to block unauthenticated access
- Tightened Firebase Storage access rules so authenticated users are limited to their own recipe file paths

## 📚 Documentation

- Added a full Docker Compose deployment guide for self-hosted setups
- Added clearer setup notes for Google Sign-In on custom domains and self-hosted deployments
- Added deployment guidance explaining which environment variables are required at build time versus runtime
- Added the main Docker Compose workflows for self-hosted users, including build, start, stop, and log commands
- Added setup guidance for Firebase Admin credentials required by protected AI routes in self-hosted deployments
