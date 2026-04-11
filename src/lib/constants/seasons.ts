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
 * Format a Date using the local calendar day instead of UTC.
 *
 * WHY NOT toISOString():
 * Meal plans are keyed by local week dates like "2026-04-13". Converting a
 * midnight local Date to ISO can shift to the previous UTC day in European
 * timezones, causing week navigation and lookups to miss existing plans.
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Return the Monday for the week containing the given local calendar date.
 */
export function getWeekMonday(date: Date): string {
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return formatLocalDate(monday);
}

/**
 * Add or subtract whole weeks from a local "YYYY-MM-DD" date string.
 */
export function addWeeksToDateString(dateString: string, weeks: number): string {
  const date = new Date(dateString + 'T00:00:00');
  date.setDate(date.getDate() + (weeks * 7));
  return formatLocalDate(date);
}

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
  return getWeekMonday(new Date());
}
