'use client';

import { Season } from '@/types';
import { SEASON_ICONS, SEASON_LABELS, ALL_SEASONS } from '@/lib/constants/seasons';

/**
 * SeasonSelector Component - Multi-Select Season Picker
 *
 * MIGRATION FROM SINGLE TO MULTIPLE SEASONS:
 * Previously used mutually exclusive button selection (one season only).
 * Now supports selecting multiple seasons via toggle buttons.
 *
 * USER INTERACTION:
 * - Click season button: Toggle in/out of selection
 * - Can select 0 to 5 seasons (no maximum enforced)
 * - Visual feedback: Selected buttons use primary color with shadow/scale
 * - Counter shows "N stagione/i selezionate" below buttons
 *
 * WHY MULTI-SELECT:
 * Italian recipes often span multiple seasons (e.g., Pasta e Fagioli
 * is both autunno + inverno). Single season selection was too restrictive.
 */

interface SeasonSelectorProps {
  selectedSeasons?: Season[]; // Changed from selectedSeason (single value)
  onSeasonsChange: (seasons: Season[]) => void; // Changed from onSeasonChange
  aiSuggested?: boolean;
}

export function SeasonSelector({
  selectedSeasons = [],
  onSeasonsChange,
  aiSuggested
}: SeasonSelectorProps) {

  /**
   * Toggle season in/out of selection array.
   *
   * If season already selected: Remove it (filter out)
   * If season not selected: Add it (spread + push)
   *
   * This creates a new array reference, triggering React re-render.
   */
  const handleToggle = (season: Season) => {
    if (selectedSeasons.includes(season)) {
      // Remove season from array
      onSeasonsChange(selectedSeasons.filter(s => s !== season));
    } else {
      // Add season to array
      onSeasonsChange([...selectedSeasons, season]);
    }
  };

  return (
    <div>
      {/* Label with AI suggestion badge */}
      <div className="flex items-center gap-2 mb-2">
        <label className="block text-sm font-medium">Stagioni</label>
        {aiSuggested && (
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex items-center gap-1">
            ✨ Suggerito da AI
          </span>
        )}
      </div>

      {/* Multi-select season buttons */}
      <div className="flex gap-2 flex-wrap">
        {ALL_SEASONS.map((season) => {
          const isSelected = selectedSeasons.includes(season);
          return (
            <button
              key={season}
              type="button"
              onClick={() => handleToggle(season)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md scale-105'
                  : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              <span className="mr-2 text-lg">{SEASON_ICONS[season]}</span>
              {SEASON_LABELS[season]}
            </button>
          );
        })}
      </div>

      {/* Selection counter (only shown if at least one season selected) */}
      {selectedSeasons.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {selectedSeasons.length} stagione/i {selectedSeasons.length === 1 ? 'selezionata' : 'selezionate'}
        </p>
      )}
    </div>
  );
}
