'use client';

import { useEffect, useRef, useState } from 'react';
import { Shuffle, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DisclosurePanel } from '@/components/ui/disclosure-panel';
import { ServingsStepper } from '@/components/recipe/servings-stepper';
import { Category, MealPlanSetupConfig, MealType, MealTypeConfig, Season } from '@/types';
import {
  SEASON_ICONS,
  SEASON_LABELS,
  getCurrentSeason,
  getCurrentWeekMonday,
} from '@/lib/constants/seasons';
import { MEAL_LABELS, SELECTABLE_MEAL_TYPES, sortMealTypes } from '@/lib/constants/meal-types';
import { MAX_SERVINGS_PLANNED, MIN_SERVINGS_PLANNED } from '@/lib/utils/planner-members';
import { cn } from '@/lib/utils/cn';

interface MealPlanSetupFormProps {
  categories: Category[];
  /** Generate a plan locally by shuffling the user's recipes. */
  onGenerate: (config: MealPlanSetupConfig) => void;
  onCreateManual: (config: MealPlanSetupConfig) => void;
  isLoading: boolean;
  initialWeekStartDate?: string;
  /** Family size (or the fallback): prefills "Per quante persone cucini di solito?". */
  defaultServingsPlanned: number;
}

const PEOPLE_STEPPER_LABELS = {
  decrease: 'Riduci persone',
  increase: 'Aumenta persone',
  input: 'Numero di persone',
};

function formatRulesSummary(ruleCount: number): string {
  if (ruleCount === 0) return 'nessuna regola';
  return ruleCount === 1 ? '1 regola' : `${ruleCount} regole`;
}

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const SEASONS_FOR_PLANNER: Exclude<Season, 'tutte_stagioni'>[] = [
  'primavera', 'estate', 'autunno', 'inverno'
];

/**
 * Setup of a new weekly plan.
 *
 * PROGRESSIVE SURFACES, NOT A WIZARD: the fields are few, so a multi-screen wizard
 * would add taps without removing load. What everyone must decide ("Giorni e portate",
 * people included) is always open; what only tunes the shuffle ("Stagione e regole")
 * is collapsed behind a live summary, so its state is readable without opening it.
 *
 * WHERE THE RULES LIVE AFTER SETUP: nowhere. Season and per-meal categories guide the
 * GENERATION only — MealPlanSetupConfig is never persisted — and the panel says so, so
 * nobody looks for them on the calendar later.
 */
export function MealPlanSetupForm({
  categories,
  onGenerate,
  onCreateManual,
  isLoading,
  initialWeekStartDate,
  defaultServingsPlanned,
}: MealPlanSetupFormProps) {
  const [season, setSeason] = useState<Exclude<Season, 'tutte_stagioni'>>(getCurrentSeason());
  const [activeMealTypes, setActiveMealTypes] = useState<MealType[]>(['pranzo', 'cena']);
  const [weekStartDate, setWeekStartDate] = useState(initialWeekStartDate ?? getCurrentWeekMonday());
  const [mealTypeConfigs, setMealTypeConfigs] = useState<Partial<Record<MealType, MealTypeConfig>>>({});
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // The family profile loads after the first render: follow the default until the user
  // picks a number, then never overwrite their choice (useState(prop) alone would
  // freeze the pre-load fallback of 2).
  const [servingsPlanned, setServingsPlanned] = useState(defaultServingsPlanned);
  const hasChosenServings = useRef(false);
  useEffect(() => {
    if (!hasChosenServings.current) setServingsPlanned(defaultServingsPlanned);
  }, [defaultServingsPlanned]);

  const isValid = activeMealTypes.length > 0 && activeDays.length > 0;

  const ruleCount = Object.values(mealTypeConfigs).reduce(
    (count, config) =>
      count + (config?.preferredCategoryId ? 1 : 0) + (config?.excludedCategoryIds?.length ?? 0),
    0
  );

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
      defaultServingsPlanned: servingsPlanned,
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
      return sortMealTypes([...prev, type]);
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
    <div className="space-y-4">
      {/* ── Giorni e portate: what every plan needs, always open ─────────── */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-5">
        <h2 className="font-display text-xl font-semibold text-foreground">Giorni e portate</h2>

        {/* Day selector */}
        <div>
          <p id="setup-days-label" className="text-sm font-medium text-foreground mb-2">
            Giorni da pianificare
          </p>
          <div role="group" aria-labelledby="setup-days-label" className="flex flex-wrap gap-2">
            {DAY_CHIPS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                aria-pressed={activeDays.includes(i)}
                className={cn(
                  'h-11 w-11 rounded-full border text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  activeDays.includes(i)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted'
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
          <p id="setup-meals-label" className="text-sm font-medium text-foreground mb-1">
            Cosa vuoi pianificare
          </p>
          <div role="group" aria-labelledby="setup-meals-label" className="grid grid-cols-2 gap-x-2 sm:grid-cols-3">
            {SELECTABLE_MEAL_TYPES.map((value) => (
              <label key={value} className="flex min-h-11 items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={activeMealTypes.includes(value)}
                  onChange={() => toggleMealType(value)}
                  className="h-5 w-5 accent-primary"
                />
                <span className="text-sm text-foreground">{MEAL_LABELS[value]}</span>
              </label>
            ))}
          </div>
          {activeMealTypes.length === 0 && (
            <p className="text-xs text-destructive mt-2">Seleziona almeno un tipo di pasto</p>
          )}
        </div>

        {/* People */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">
            Per quante persone cucini di solito?
          </p>
          <ServingsStepper
            value={servingsPlanned}
            onChange={next => {
              hasChosenServings.current = true;
              setServingsPlanned(next);
            }}
            min={MIN_SERVINGS_PLANNED}
            max={MAX_SERVINGS_PLANNED}
            size="md"
            labels={PEOPLE_STEPPER_LABELS}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Puoi cambiarlo pasto per pasto dal calendario.
          </p>
        </div>
      </section>

      {/* ── Stagione e regole: tunes the shuffle only, collapsed by default ── */}
      <DisclosurePanel
        title="Stagione e regole"
        summary={`${SEASON_LABELS[season]} · ${formatRulesSummary(ruleCount)}`}
      >
        <div className="space-y-5">
          <p className="text-xs leading-5 text-muted-foreground">
            Queste regole guidano solo la generazione: dopo, modifichi ogni pasto direttamente dal calendario.
          </p>

          {/* Season */}
          <div>
            <p id="setup-season-label" className="text-sm font-medium text-foreground mb-2">Stagione</p>
            <div role="group" aria-labelledby="setup-season-label" className="flex flex-wrap gap-2">
              {SEASONS_FOR_PLANNER.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSeason(s)}
                  aria-pressed={season === s}
                  className={cn(
                    'flex min-h-11 items-center gap-1.5 px-3.5 rounded-full border text-sm font-medium transition-colors lg:min-h-9',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    season === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-muted'
                  )}
                >
                  <span aria-hidden="true">{SEASON_ICONS[s]}</span>
                  <span>{SEASON_LABELS[s]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Per-meal category settings — drive the shuffle so each meal pulls from
              sensible categories (e.g. no desserts at lunch). */}
          {activeMealTypes.length > 0 && categories.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Categorie per portata</p>
              <p className="text-xs leading-5 text-muted-foreground">
                Per ogni pasto scegli la categoria da usare e quelle da evitare: così lo shuffle non mette, ad esempio, un dolce a pranzo.
              </p>

              {/* Flat rows split by hairlines: this already sits on a card surface. */}
              <div className="mt-2 divide-y divide-border">
                {sortMealTypes(activeMealTypes).map(type => {
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
                    <div key={type} className="space-y-2.5 py-3">
                      <p className="text-sm font-semibold text-foreground">{MEAL_LABELS[type]}</p>

                      {/* Preferred category */}
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`setup-preferred-${type}`}
                          className="text-xs text-muted-foreground w-20 shrink-0"
                        >
                          Preferisci
                        </label>
                        <select
                          id={`setup-preferred-${type}`}
                          value={cfg.preferredCategoryId ?? ''}
                          onChange={e => setMealPreferred(type, e.target.value)}
                          className={cn(
                            'h-11 min-w-0 flex-1 text-sm border border-border rounded-md px-2 bg-background text-foreground lg:h-9',
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
                        <label
                          htmlFor={`setup-excluded-${type}`}
                          className="text-xs text-muted-foreground w-20 shrink-0 pt-3 lg:pt-2.5"
                        >
                          Escludi
                        </label>
                        <div className="min-w-0 flex-1 space-y-2">
                          {excluded.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {excluded.map(catId => {
                                const cat = categories.find(c => c.id === catId);
                                if (!cat) return null;
                                return (
                                  <span
                                    key={catId}
                                    className="inline-flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-0.5 text-xs font-medium text-foreground"
                                  >
                                    {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                                    {cat.name}
                                    <button
                                      type="button"
                                      onClick={() => removeMealExclusion(type, catId)}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={`Non escludere più ${cat.name}`}
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {availableToExclude.length > 0 && (
                            <select
                              id={`setup-excluded-${type}`}
                              value=""
                              onChange={e => { addMealExclusion(type, e.target.value); e.target.value = ''; }}
                              className={cn(
                                'h-11 w-full text-sm border border-border rounded-md px-2 bg-background text-foreground lg:h-9',
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
            </div>
          )}

          {/* No categories yet: explain why the per-meal filter is unavailable
              instead of silently showing nothing. */}
          {activeMealTypes.length > 0 && categories.length === 0 && (
            <p className="text-xs leading-5 text-muted-foreground">
              Crea delle categorie (es. Primi, Secondi, Dolci) per far scegliere allo shuffle la portata giusta per ogni pasto.
            </p>
          )}
        </div>
      </DisclosurePanel>

      {/* ── CTA bar ──────────────────────────────────────────────────────────
          Sticky only below 1440px, where the window scrolls. From `lg` the page
          scrolls inside <main> within .shell-stage (overflow:hidden), which cancels
          position:sticky — there the bar simply closes the column. */}
      <div
        className={cn(
          'sticky bottom-0 max-lg:portrait:bottom-20 z-10 border-t border-border bg-background py-3',
          'lg:static lg:border-t-0 lg:bg-transparent lg:py-2',
          'flex flex-col gap-2 sm:flex-row'
        )}
      >
        <Button
          type="button"
          onClick={() => onGenerate(buildConfig())}
          disabled={!isValid || isLoading}
          className="h-11 w-full gap-2 sm:flex-1"
        >
          <Shuffle className="h-4 w-4" />
          Genera piano (shuffle)
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onCreateManual(buildConfig())}
          disabled={!isValid || isLoading}
          className="h-11 w-full gap-2 sm:flex-1"
        >
          <PenLine className="h-4 w-4" />
          Crea piano manuale
        </Button>
      </div>
    </div>
  );
}
