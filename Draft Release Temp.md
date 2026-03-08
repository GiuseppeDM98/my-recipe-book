# Draft Release Notes

## ✨ New Features

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

## 🐛 Bug Fixes

- Fixed ingredient quantities not updating when changing the number of servings for recipes added via the "Free text" tab in the AI Extractor
- Fixed preparation and cooking times showing as N/A for some PDF-extracted recipes

## 🔧 Improvements

- **Upgraded AI model**: All AI features now use Claude Sonnet 4.6 for improved quality and accuracy
- **Cleaner recipe text**: Fixed an issue where AI would sometimes include formatting symbols (asterisks) in step descriptions — all recipe text is now stored as clean plain text
- **Centralized Season Management**: Season labels and icons are now consistent across the entire application
- **Backward Compatibility**: Existing recipes with single seasons continue to work perfectly
- **Italian Character Support**: All text search functions now properly handle Italian diacritics

## 🔒 Security

- Fixed 4 npm vulnerabilities: `fast-xml-parser` (critical), `minimatch` (high), `@isaacs/brace-expansion` (high), `ajv` (moderate)
