'use client';

import { useEffect, useState } from 'react';
import { Shuffle, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Category, MealPlanSetupConfig, MealType, MealTypeConfig, Season } from '@/types';
import {
  SEASON_ICONS,
  SEASON_LABELS,
  getCurrentSeason,
  getCurrentWeekMonday,
} from '@/lib/constants/seasons';
import { MEAL_LABELS, SELECTABLE_MEAL_TYPES } from '@/lib/constants/meal-types';
import { cn } from '@/lib/utils/cn';

interface MealPlanSetupFormProps {
  categories: Category[];
  /** Generate a plan locally by shuffling the user's recipes. */
  onGenerate: (config: MealPlanSetupConfig) => void;
  onCreateManual: (config: MealPlanSetupConfig) => void;
  isLoading: boolean;
  initialWeekStartDate?: string;
}

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const SEASONS_FOR_PLANNER: Exclude<Season, 'tutte_stagioni'>[] = [
  'primavera', 'estate', 'autunno', 'inverno'
];

export function MealPlanSetupForm({
  categories,
  onGenerate,
  onCreateManual,
  isLoading,
  initialWeekStartDate,
}: MealPlanSetupFormProps) {
  const [season, setSeason] = useState<Exclude<Season, 'tutte_stagioni'>>(getCurrentSeason());
  const [activeMealTypes, setActiveMealTypes] = useState<MealType[]>(['pranzo', 'cena']);
  const [weekStartDate, setWeekStartDate] = useState(initialWeekStartDate ?? getCurrentWeekMonday());
  const [mealTypeConfigs, setMealTypeConfigs] = useState<Partial<Record<MealType, MealTypeConfig>>>({});
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const isValid = activeMealTypes.length > 0 && activeDays.length > 0;

  useEffect(() => {
    setWeekStartDate(initialWeekStartDate ?? getCurrentWeekMonday());
  }, [initialWeekStartDate]);

  function buildConfig(): MealPlanSetupConfig {
    const hasConfigs = Object.values(mealTypeConfigs).some(
      c => c?.preferredCategoryId || c?.excludedCategoryIds?.length
    );
    return {
      season,
      activeMealTypes,
      excludedCategoryIds: [],
      newRecipeCount: 0,
      weekStartDate,
      activeDays: activeDays.length < 7 ? activeDays : null,
      mealTypeConfigs: hasConfigs ? mealTypeConfigs : null,
    };
  }

  function toggleDay(dayIndex: number) {
    setActiveDays(prev => {
      if (prev.includes(dayIndex)) {
        if (prev.length === 1) return prev;
        return prev.filter(d => d !== dayIndex);
      }
      return [...prev, dayIndex].sort((a, b) => a - b);
    });
  }

  function toggleMealType(type: MealType) {
    setActiveMealTypes(prev => {
      if (prev.includes(type)) {
        setMealTypeConfigs(m => { const n = { ...m }; delete n[type]; return n; });
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
  }

  function setMealPreferred(type: MealType, categoryId: string) {
    setMealTypeConfigs(prev => {
      const existing = prev[type] ?? {};
      const excluded = existing.excludedCategoryIds ?? [];
      return {
        ...prev,
        [type]: {
          ...existing,
          preferredCategoryId: categoryId || null,
          // auto-remove from excluded if the same category is chosen as preferred
          excludedCategoryIds: categoryId ? excluded.filter(id => id !== categoryId) : excluded,
        },
      };
    });
  }

  function addMealExclusion(type: MealType, categoryId: string) {
    if (!categoryId) return;
    setMealTypeConfigs(prev => {
      const existing = prev[type]?.excludedCategoryIds ?? [];
      if (existing.includes(categoryId)) return prev;
      return {
        ...prev,
        [type]: { ...prev[type], excludedCategoryIds: [...existing, categoryId] },
      };
    });
  }

  function removeMealExclusion(type: MealType, categoryId: string) {
    setMealTypeConfigs(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        excludedCategoryIds: (prev[type]?.excludedCategoryIds ?? []).filter(id => id !== categoryId),
      },
    }));
  }

  return (
    <div className="space-y-6">
      {/* Season */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Stagione</p>
        <div className="flex flex-wrap gap-2">
          {SEASONS_FOR_PLANNER.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setSeason(s)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors',
                season === s
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

      {/* Day selector */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Giorni da pianificare</p>
        <div className="flex flex-wrap gap-2">
          {DAY_CHIPS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={cn(
                'w-10 h-10 rounded-full border text-sm font-medium transition-colors',
                activeDays.includes(i)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {activeDays.length === 0 && (
          <p className="text-xs text-destructive mt-2">Seleziona almeno un giorno</p>
        )}
      </div>

      {/* Meal types */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Cosa vuoi pianificare</p>
        <div className="grid grid-cols-2 gap-2">
          {SELECTABLE_MEAL_TYPES.map((value) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeMealTypes.includes(value)}
                onChange={() => toggleMealType(value)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{MEAL_LABELS[value]}</span>
            </label>
          ))}
        </div>
        {activeMealTypes.length === 0 && (
          <p className="text-xs text-destructive mt-2">Seleziona almeno un tipo di pasto</p>
        )}
      </div>

      {/* Per-meal category settings — drive the shuffle so each meal pulls from
          sensible categories (e.g. no desserts at lunch). Always visible because
          without them the shuffle would pick any recipe for any meal. */}
      {activeMealTypes.length > 0 && categories.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Categorie per portata</p>
            <p className="text-xs text-muted-foreground mb-3">
              Per ogni pasto scegli la categoria da usare e quelle da evitare: così lo shuffle non mette, ad esempio, un dolce a pranzo.
            </p>
          </div>
          {activeMealTypes.map(type => {
                const cfg = mealTypeConfigs[type] ?? {};
                const excluded = cfg.excludedCategoryIds ?? [];
                const preferredId = cfg.preferredCategoryId ?? '';
                // A category can't be both preferred and excluded for the same meal type
                const availableToExclude = categories.filter(
                  c => !excluded.includes(c.id) && c.id !== preferredId
                );
                const availableToPrefer = categories.filter(
                  c => !excluded.includes(c.id)
                );
                return (
                  <div
                    key={type}
                    className="rounded-lg border border-border bg-muted/30 p-3 space-y-3"
                  >
                    <p className="text-sm font-semibold text-foreground">{MEAL_LABELS[type]}</p>

                    {/* Preferred category */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0">Preferisci</span>
                      <select
                        value={cfg.preferredCategoryId ?? ''}
                        onChange={e => setMealPreferred(type, e.target.value)}
                        className={cn(
                          'flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background',
                          'focus:outline-none focus:ring-2 focus:ring-primary'
                        )}
                      >
                        <option value="">Nessuna preferenza</option>
                        {availableToPrefer.map(cat => (
                          <option key={cat.id} value={cat.id}>
                            {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Excluded categories */}
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-20 shrink-0 pt-1.5">Escludi</span>
                      <div className="flex-1 space-y-2">
                        {excluded.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {excluded.map(catId => {
                              const cat = categories.find(c => c.id === catId);
                              if (!cat) return null;
                              return (
                                <span
                                  key={catId}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium"
                                >
                                  {cat.icon && <span>{cat.icon}</span>}
                                  {cat.name}
                                  <button
                                    type="button"
                                    onClick={() => removeMealExclusion(type, catId)}
                                    className="hover:opacity-70 transition-opacity"
                                    aria-label={`Rimuovi ${cat.name}`}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {availableToExclude.length > 0 && (
                          <select
                            value=""
                            onChange={e => { addMealExclusion(type, e.target.value); e.target.value = ''; }}
                            className={cn(
                              'text-sm border border-border rounded-md px-2 py-1.5 bg-background',
                              'focus:outline-none focus:ring-2 focus:ring-primary'
                            )}
                          >
                            <option value="">Aggiungi categoria...</option>
                            {availableToExclude.map(cat => (
                              <option key={cat.id} value={cat.id}>
                                {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
        </div>
      )}

      {/* No categories yet: explain why the per-meal filter is unavailable
          instead of silently showing nothing. */}
      {activeMealTypes.length > 0 && categories.length === 0 && (
        <p className="text-xs text-muted-foreground border-t pt-4">
          Crea delle categorie (es. Primi, Secondi, Dolci) per far scegliere allo shuffle la portata giusta per ogni pasto.
        </p>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3 pt-2">
        <Button
          onClick={() => onGenerate(buildConfig())}
          disabled={!isValid || isLoading}
          className="w-full gap-2"
        >
          <Shuffle className="h-4 w-4" />
          Genera piano (shuffle)
        </Button>
        <Button
          variant="outline"
          onClick={() => onCreateManual(buildConfig())}
          disabled={!isValid || isLoading}
          className="w-full gap-2"
        >
          <PenLine className="h-4 w-4" />
          Crea piano manuale
        </Button>
      </div>
    </div>
  );
}
