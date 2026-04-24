'use client';

import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, BookPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Category, MealSlot, MealType, Season } from '@/types';
import { SEASON_ICONS, SEASON_LABELS, ALL_SEASONS } from '@/lib/constants/seasons';
import { cn } from '@/lib/utils/cn';

interface NewRecipeReviewCardProps {
  slot: MealSlot;
  categories: Category[];
  onSave: (slot: MealSlot, categoryName: string, seasons: Season[]) => Promise<void>;
  isSaving: boolean;
  isSaved: boolean;
  /** When true, the save panel opens automatically (e.g. triggered from the grid cell button). */
  forceExpanded?: boolean;
}

const DAY_LABELS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MEAL_LABELS: Record<MealType, string> = { colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena', primo: 'Primo', secondo: 'Secondo', contorno: 'Contorno', dolce: 'Dolce' };

/**
 * Review card for an AI-generated recipe that hasn't been saved to the cookbook yet.
 *
 * Shows the recipe title and a brief summary (ingredient count, step count).
 * An expandable section lets the user pick category and seasons before saving.
 * Once saved, the card shows a success state and becomes non-interactive.
 *
 * WHY INLINE CATEGORY/SEASON SELECTION (not a separate dialog):
 * Consistent with ExtractedRecipePreview in assistente-ai.
 * Keeps the save flow within the planner page without navigation.
 */
export function NewRecipeReviewCard({
  slot,
  categories,
  onSave,
  isSaving,
  isSaved,
  forceExpanded = false,
}: NewRecipeReviewCardProps) {
  const [expanded, setExpanded] = useState(forceExpanded);
  useEffect(() => { if (forceExpanded) setExpanded(true); }, [forceExpanded]);
  // Pre-populate with AI suggestions when available
  const [selectedCategory, setSelectedCategory] = useState(slot.suggestedCategoryName ?? '');
  const [selectedSeasons, setSelectedSeasons] = useState<Season[]>(slot.suggestedSeasons ?? []);

  if (!slot.newRecipe) return null;

  const recipe = slot.newRecipe;

  function toggleSeason(s: Season) {
    setSelectedSeasons(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function handleSave() {
    await onSave(slot, selectedCategory, selectedSeasons);
  }

  const slotLabel = `${DAY_LABELS[slot.dayIndex]} — ${MEAL_LABELS[slot.mealType]}`;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        isSaved
          ? 'border-accent/30 bg-accent/8'
          : 'border-primary/20 bg-primary/5'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles className={cn(
            'h-4 w-4 mt-0.5 shrink-0',
            isSaved ? 'text-accent' : 'text-primary'
          )} />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground">
              {recipe.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{slotLabel}</p>
          </div>
        </div>

        {isSaved ? (
          <div className="flex items-center gap-1 text-accent text-xs font-medium shrink-0">
            <Check className="h-3.5 w-3.5" />
            Salvata
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-primary hover:text-primary-700 shrink-0"
            aria-label={expanded ? 'Chiudi' : 'Salva nel ricettario'}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Recipe summary (always visible) */}
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span>{recipe.ingredients.length} ingredienti</span>
        <span>{recipe.steps.length} passaggi</span>
        {recipe.prepTime && <span>{recipe.prepTime} min prep</span>}
      </div>

      {/* Save panel (expandable) */}
      {expanded && !isSaved && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          {/* Category */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Categoria <span className="text-muted-foreground font-normal">(opzionale)</span>
            </label>
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className={cn(
                'w-full text-sm border border-border rounded-lg px-3 py-2',
                'bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
              )}
            >
              <option value="">Nessuna categoria</option>
              {categories.map(c => (
                <option key={c.id} value={c.name}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Seasons */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Stagioni <span className="text-muted-foreground font-normal">(opzionale)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SEASONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSeason(s)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors',
                    selectedSeasons.includes(s)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-accent'
                  )}
                >
                  <span>{SEASON_ICONS[s]}</span>
                  <span>{SEASON_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className="w-full gap-2"
          >
            <BookPlus className="h-3.5 w-3.5" />
            {isSaving ? 'Salvataggio...' : 'Salva nel ricettario'}
          </Button>
        </div>
      )}
    </div>
  );
}
