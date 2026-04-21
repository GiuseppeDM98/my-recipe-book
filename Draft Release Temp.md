# Draft Release Notes

## ✨ New Features

- Added a Weekly Shopping List page that automatically generates your shopping list from the current week's meal plan — ingredients from all recipes are aggregated and organised by section
- Added the ability to check off items as you shop, with a progress bar showing how many items you have left
- Added support for adding custom items to the shopping list manually, so you can include things not in your meal plan
- Added week navigation on the shopping list page so you can view the list for past and future weeks
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
- Added dietary preference chips to the meal planner setup — choose from Meat-free, Fish-free, Vegetarian, Vegan, Gluten-free, and Legume-rich to guide recipe selection
- Added a free-text notes field to the meal planner setup so you can tell the AI things like "I want quick recipes" or "I already have zucchini in the fridge"
- Added a regenerate button on each occupied meal slot — click ↺ to swap a single recipe without rebuilding the entire week
- Added a day selector to the meal planner so you can plan only specific days (e.g. weekdays only) instead of the full week

## 🐛 Bug Fixes

- Fixed input fields, dropdowns, and text areas in recipe editing and the family profile page showing a white background instead of the app's warm cream theme
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

- Improved recipe filters on the recipe list page — filters are now hidden by default in a collapsible panel; tap "Filter" to expand season, category, and subcategory controls; active filters appear as removable chips so you always know what is applied
- Improved editorial typography throughout the app — recipe titles, page headings, and section labels (Ingredients, Preparation, Notes) now display in Bodoni Moda italic as intended, giving the interface a stronger cookbook feel
- Improved cooking mode with a persistent "Finish cooking" button in a sticky footer — the button is always visible and activates automatically when all ingredients and steps are checked; it can no longer be accidentally dismissed
- Improved empty states across the app with distinct visuals per page — each empty page now has a relevant emoji, italic heading, and a softer background instead of a generic dashed border
- Improved meal planner slot design — cookbook recipes and AI-generated recipes are now distinguished by small corner badges (book icon vs. sparkle icon) instead of colored side borders
- Improved shopping list week navigation with an explicit "Week of…" label so the selected week is always clear
- Improved the overall visual design with a warm cream background and terracotta accents inspired by Italian cookbooks, replacing the default white interface
- Improved typography throughout the app with Bodoni Moda editorial headings and Jost body text, giving the interface a more refined cookbook feel
- Improved season badges on recipe detail pages to use the app's warm terracotta palette instead of blue
- Improved the Statistics page layout — replaced three identical metric cards with a cleaner editorial summary showing your total count, most-cooked dish, and recent activity in a more readable format
- Improved collapsible sections in cooking mode and the shopping list with smoother, more natural open/close animations
- Improved bottom navigation on iPhone and iPad to respect the safe area at the bottom of the screen, preventing content from being hidden behind the home indicator
- Improved cooking mode so interactive ingredient and step rows can now be navigated and checked via keyboard, in addition to touch
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
- Improved the meal planner advanced settings with unified per-meal category cards — set a preferred category and excluded categories for each meal type in one place instead of two separate sections
- Improved season filtering in the meal planner so the selected season now applies to existing cookbook recipes, not just newly generated ones
- Improved self-hosted setup with a documented fallback for installations that do not want Google sign-in
- Improved AI recipe suggestions so they can optionally take your household composition into account for more suitable quantities
- Improved the AI Assistant by keeping PDF upload focused on pure extraction, without household-based quantity adjustments
- Improved navigation performance so revisiting a recipe page no longer reloads data from the server when the content is still fresh
- Improved the "Save Changes" button in recipe editing so it stays visible at the bottom of the screen while scrolling through long recipes
- Improved AI-assisted recipe formatting and PDF extraction to automatically detect and store step durations, activating the timer button without any manual input
- Improved the meal planner calendar so today's date is visually highlighted, making it easier to orient yourself at a glance
- Improved cooking mode so completed ingredient and step sections turn green with a checkmark, giving clear visual feedback as you work through a recipe
- Improved cooking mode so sections collapse automatically with a smooth animation once all their items are checked, reducing visual noise as you progress through the recipe

## 🔒 Security

- Test account credentials are no longer shown on the login page by default — they must be explicitly enabled for development environments
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
