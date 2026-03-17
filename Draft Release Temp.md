# Draft Release Notes

## ✨ New Features

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

## 🐛 Bug Fixes

- Fixed ingredient quantities not updating when changing the number of servings for recipes added via the "Free text" tab in the AI Extractor
- Fixed preparation and cooking times showing as N/A for some PDF-extracted recipes
- Fixed "Save to cookbook" button in meal planner calendar cells not opening the save panel (it scrolled to the card but left it collapsed)
- Fixed meal plans not restoring on page reload due to a missing Firestore composite index

## 🔧 Improvements

- **Renamed AI Extractor to AI Assistant**: The page is now called "Assistente Ricette AI" to reflect its expanded capabilities beyond just PDF extraction
- **Upgraded AI model**: All AI features now use Claude Sonnet 4.6 for improved quality and accuracy
- **Cleaner recipe text**: Fixed an issue where AI would sometimes include formatting symbols (asterisks) in step descriptions — all recipe text is now stored as clean plain text
- **Centralized Season Management**: Season labels and icons are now consistent across the entire application
- **Backward Compatibility**: Existing recipes with single seasons continue to work perfectly
- **Italian Character Support**: All text search functions now properly handle Italian diacritics

## 🔒 Security

- Fixed 4 npm vulnerabilities: `fast-xml-parser` (critical), `minimatch` (high), `@isaacs/brace-expansion` (high), `ajv` (moderate)
