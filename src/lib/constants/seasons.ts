/**
 * Centralized season constants for Il Mio Ricettario.
 *
 * WHY CENTRALIZED:
 * Previously duplicated across 6 files (season-selector, recipe-card,
 * recipe-detail, extracted-recipe-preview, ricette page, types).
 * Single source of truth prevents inconsistencies and simplifies updates.
 *
 * DRY PRINCIPLE:
 * Instead of maintaining 6 separate copies of SEASON_ICONS and SEASON_LABELS,
 * we have one canonical source that all components import from.
 * Adding a new season now requires updating only 3 locations:
 * - This file (add to all three exports)
 * - ITALIAN_SEASONAL_INGREDIENTS in api/suggest-category/route.ts
 * - ITALIAN_SEASONAL_INGREDIENTS in api/extract-recipes/route.ts
 *
 * CHECKLIST: If you add a season value, also update:
 * - ITALIAN_SEASONAL_INGREDIENTS in api/suggest-category/route.ts
 * - ITALIAN_SEASONAL_INGREDIENTS in api/extract-recipes/route.ts
 */

import { Season } from '@/types';

/**
 * Emoji icons for each season.
 *
 * Used for visual identification in UI (buttons, badges, cards).
 * Emojis are universally recognized and don't require localization.
 */
export const SEASON_ICONS: Record<Season, string> = {
  primavera: '🌸',
  estate: '☀️',
  autunno: '🍂',
  inverno: '❄️',
  tutte_stagioni: '🌍'
};

/**
 * Italian display labels for each season.
 *
 * Used in UI text, filters, and accessibility labels.
 * Capitalized for proper noun display in Italian.
 */
export const SEASON_LABELS: Record<Season, string> = {
  primavera: 'Primavera',
  estate: 'Estate',
  autunno: 'Autunno',
  inverno: 'Inverno',
  tutte_stagioni: 'Tutte le stagioni'
};

/**
 * Array of all season values in display order.
 *
 * Used for iteration in UI components (filters, multi-select).
 * Order: Spring → Summer → Autumn → Winter → All Seasons
 * (follows natural seasonal progression, with "all seasons" last)
 */
export const ALL_SEASONS: Season[] = [
  'primavera',
  'estate',
  'autunno',
  'inverno',
  'tutte_stagioni'
];

/**
 * Returns the current Italian meteorological season based on month.
 *
 * Italian meteorological seasons (calendar-based, not astronomical):
 * - Primavera: March, April, May
 * - Estate:    June, July, August
 * - Autunno:   September, October, November
 * - Inverno:   December, January, February
 *
 * WHY NOT tutte_stagioni:
 * This function provides a planning default, not a recipe tag.
 * "All seasons" has no meaning as a planning constraint.
 *
 * Used by the meal planner setup form to pre-select the current season.
 */
export function getCurrentSeason(): Exclude<Season, 'tutte_stagioni'> {
  const month = new Date().getMonth(); // 0-based (0 = January)
  if (month >= 2 && month <= 4) return 'primavera';
  if (month >= 5 && month <= 7) return 'estate';
  if (month >= 8 && month <= 10) return 'autunno';
  return 'inverno'; // months 11 (Dec), 0 (Jan), 1 (Feb)
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday of the current calendar week.
 *
 * Always returns a Monday because meal plans are week-aligned starting Monday,
 * matching the Italian/European convention (ISO 8601 week starts Monday).
 *
 * Used by the meal planner setup form to pre-fill the week selector.
 */
export function getCurrentWeekMonday(): string {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = day === 0 ? -6 : 1 - day; // shift so Monday = offset 0
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}
