# Draft Release Notes

## ✨ New Features

- Added a new Statistics page to track your most cooked recipes, total completed cooking sessions, and recent completions
- Added cooking history tracking so completed sessions can power long-term stats and activity insights
- Added manual step reordering when creating or editing recipes
- Added dynamic ingredient quantities inside recipe steps, so preparation text can stay in sync with serving changes
- Added a "Chat AI" tab in the AI Assistant page for multi-turn recipe generation
- Added free-text recipe input in the AI Assistant, so you can paste rough notes without uploading a PDF
- Added recipe search with Italian character support and live filtering
- Added support for assigning multiple seasons to a single recipe
- Added a custom Apple home screen icon for iPad and iPhone installs
- Added the Weekly Meal Planner page with AI-assisted and manual planning modes
- Added saved week history in the planner so multiple weekly plans can coexist
- Added week-to-week planner navigation, including empty weeks that open a pre-filled setup screen
- Added saved-week shortcuts during planner setup to reopen existing plans faster
- Added a self-hosted Docker deployment option alongside Vercel
- Added a dedicated Family Profile page to save household members and notes for AI-assisted planning
- Added per-step countdown timers in cooking mode — tap "Start timer" on any step that has a duration to activate a live countdown
- Added support for multiple timers running at the same time, so you can track an oven and a resting time simultaneously
- Added a "Duration (min)" field to the step editor in recipe create and edit, so you can set timers for any step manually
- Added an "Auto-detect durations" button in recipe edit that scans step text and pre-fills durations automatically, without overwriting values you already set

## 🐛 Bug Fixes

- Fixed ingredient names disappearing from recipe steps when AI-generated or adapted recipes used a quantity reference without explicitly writing the ingredient name in the step text (e.g. "Add 15 g and stir" now correctly shows "Add 15 g of walnuts and stir")
- Fixed AI Assistant requests failing with unauthorized errors after the new protected AI authentication checks
- Fixed cooking sessions closing automatically as soon as all ingredients and steps were checked
- Fixed ingredient quantities not updating when changing the number of servings for recipes added via the free-text AI flow
- Fixed preparation and cooking times showing as N/A for some PDF-extracted recipes
- Fixed the planner "Save to cookbook" action not opening the recipe save panel correctly
- Fixed meal plans not restoring on page reload when the required Firestore index was missing
- Fixed self-hosted Docker Compose startup failing on installations without a `public` assets folder
- Fixed weekly planner navigation sometimes opening the wrong week or suggesting a new plan for an already saved week
- Fixed recipe deletion messaging so it now clearly explains that completed cooking history stays available in Statistics
- Fixed a browser validation error when a step duration exceeded 999 minutes (e.g. "leave to rise for 24 hours")

## 🔧 Improvements

- Improved cooking mode with a clear "Finish cooking" action after completing a recipe
- Improved cooking mode so ingredient scaling is reflected more consistently across both ingredients and preparation steps
- Improved recipe editing with an automatic step adaptation action to help upgrade older recipes to dynamic quantities
- Improved category creation and editing with a faster preset color palette
- Improved the AI Assistant naming and UX to reflect capabilities beyond PDF extraction
- Improved AI-generated recipes so step quantities can be linked automatically and future serving changes stay more reliable
- Improved AI recipe structure by encouraging shorter, more distinct preparation steps when multiple quantities are involved
- Improved AI-generated recipe cleanup so saved text no longer includes stray markdown symbols
- Improved season labels and icons so they stay consistent across the app
- Improved compatibility for older recipes that still use a single-season format
- Improved planner actions by clearly separating "New plan" from "Delete plan"
- Improved planner recovery when browsing weeks without a saved plan
- Improved self-hosted setup with a documented fallback for installations that do not want Google sign-in
- Improved AI recipe suggestions so they can optionally take your household composition into account for more suitable quantities
- Improved the AI Assistant by keeping PDF upload focused on pure extraction, without household-based quantity adjustments
- Improved navigation performance so revisiting a recipe page no longer reloads data from the server when the content is still fresh
- Improved the "Save Changes" button in recipe editing so it stays visible at the bottom of the screen while scrolling through long recipes
- Improved AI-assisted recipe formatting and PDF extraction to automatically detect and store step durations, activating the timer button without any manual input

## 🔒 Security

- Updated the app to a patched Next.js release to address current framework security advisories
- Added server-side authentication checks to all AI-powered endpoints to block unauthenticated access
- Tightened Firebase Storage access rules so authenticated users are limited to their own recipe file paths
- Fixed currently auto-remediable npm vulnerabilities through dependency updates

## 📚 Documentation

- Added a full Docker Compose deployment guide for self-hosted setups
- Added clearer setup notes for Google Sign-In on custom domains and self-hosted deployments
- Added deployment guidance explaining which environment variables are required at build time versus runtime
- Added the main Docker Compose workflows for self-hosted users, including build, start, stop, and log commands
- Added setup guidance for Firebase Admin credentials required by protected AI routes in self-hosted deployments
- Added clearer setup guidance for Firebase Admin credentials in local development and Vercel deployments

## 🏗️ Technical

- Added the Firestore-backed `cooking_history` collection to support analytics and cooking completion history
- Added the composite indexes and rules needed for planner history, cooking history, and ordered dashboard queries
- Updated dependency manifests and lockfiles to keep the verified Next.js version aligned across the project
- Migrated all data hooks and pages to React Query for consistent caching and deduplication of Firestore reads
