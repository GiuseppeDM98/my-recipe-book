'use client';

import { useEffect, useState } from 'react';
import { Sparkles, PenLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Category, MealPlanSetupConfig, MealType, MealTypeConfig, Season } from '@/types';
import {
  SEASON_ICONS,
  SEASON_LABELS,
  getCurrentSeason,
  getCurrentWeekMonday,
} from '@/lib/constants/seasons';
import { cn } from '@/lib/utils/cn';
import { FamilyContextToggle } from '@/components/family/family-context-toggle';

interface MealPlanSetupFormProps {
  categories: Category[];
  onGenerateWithAI: (config: MealPlanSetupConfig) => void;
  onCreateManual: (config: MealPlanSetupConfig) => void;
  isLoading: boolean;
  isTestAccount: boolean;
  initialWeekStartDate?: string;
  useFamilyContext: boolean;
  onUseFamilyContextChange: (checked: boolean) => void;
  hasValidFamilyProfile: boolean;
}

const ALL_MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
];

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const DIETARY_OPTIONS = [
  { value: 'senza_carne', label: 'Senza carne' },
  { value: 'senza_pesce', label: 'Senza pesce' },
  { value: 'vegetariano', label: 'Vegetariano' },
  { value: 'vegano', label: 'Vegano' },
  { value: 'senza_glutine', label: 'Senza glutine' },
  { value: 'ricco_legumi', label: 'Ricco di legumi' },
];

const MEAL_LABELS: Record<MealType, string> = {
  colazione: 'Colazione', pranzo: 'Pranzo', cena: 'Cena',
  primo: 'Primo piatto', secondo: 'Secondo piatto', contorno: 'Contorno', dolce: 'Dolce',
};

const SEASONS_FOR_PLANNER: Exclude<Season, 'tutte_stagioni'>[] = [
  'primavera', 'estate', 'autunno', 'inverno'
];

export function MealPlanSetupForm({
  categories,
  onGenerateWithAI,
  onCreateManual,
  isLoading,
  isTestAccount,
  initialWeekStartDate,
  useFamilyContext,
  onUseFamilyContextChange,
  hasValidFamilyProfile,
}: MealPlanSetupFormProps) {
  const [season, setSeason] = useState<Exclude<Season, 'tutte_stagioni'>>(getCurrentSeason());
  const [activeMealTypes, setActiveMealTypes] = useState<MealType[]>(['pranzo', 'cena']);
  const [weekStartDate, setWeekStartDate] = useState(initialWeekStartDate ?? getCurrentWeekMonday());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [mealTypeConfigs, setMealTypeConfigs] = useState<Partial<Record<MealType, MealTypeConfig>>>({});
  const [newRecipePerMeal, setNewRecipePerMeal] = useState<Partial<Record<MealType, number>>>({
    pranzo: 2,
    cena: 0,
  });
  const [userNotes, setUserNotes] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const isValid = activeMealTypes.length > 0 && activeDays.length > 0;

  useEffect(() => {
    setWeekStartDate(initialWeekStartDate ?? getCurrentWeekMonday());
  }, [initialWeekStartDate]);

  function buildConfig(): MealPlanSetupConfig {
    const totalNewRecipes = Object.values(newRecipePerMeal).reduce((sum, n) => sum + (n ?? 0), 0);
    const hasConfigs = Object.values(mealTypeConfigs).some(
      c => c?.preferredCategoryId || c?.excludedCategoryIds?.length
    );
    return {
      season,
      activeMealTypes,
      excludedCategoryIds: [],
      newRecipeCount: totalNewRecipes,
      weekStartDate,
      newRecipePerMeal: Object.keys(newRecipePerMeal).length > 0 ? newRecipePerMeal : undefined,
      userNotes: userNotes.trim() || null,
      dietaryRestrictions: dietaryRestrictions.length > 0 ? dietaryRestrictions : null,
      activeDays: activeDays.length < 7 ? activeDays : null,
      mealTypeConfigs: hasConfigs ? mealTypeConfigs : null,
    };
  }

  function toggleDietaryRestriction(value: string) {
    setDietaryRestrictions(prev =>
      prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
    );
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
        setNewRecipePerMeal(m => { const n = { ...m }; delete n[type]; return n; });
        setMealTypeConfigs(m => { const n = { ...m }; delete n[type]; return n; });
        return prev.filter(t => t !== type);
      }
      setNewRecipePerMeal(m => ({ ...m, [type]: 0 }));
      return [...prev, type];
    });
  }

  function setMealRecipeCount(type: MealType, count: number) {
    setNewRecipePerMeal(prev => ({ ...prev, [type]: count }));
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

      {/* Dietary restrictions */}
      <div>
        <p className="text-sm font-medium text-foreground mb-2">Preferenze dietetiche</p>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleDietaryRestriction(opt.value)}
              className={cn(
                'px-3 py-1.5 rounded-full border text-sm font-medium transition-colors',
                dietaryRestrictions.includes(opt.value)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-border hover:bg-accent'
              )}
            >
              {opt.label}
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
          {ALL_MEAL_TYPES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={activeMealTypes.includes(value)}
                onChange={() => toggleMealType(value)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
        {activeMealTypes.length === 0 && (
          <p className="text-xs text-destructive mt-2">Seleziona almeno un tipo di pasto</p>
        )}
      </div>

      {/* Per-meal new recipe sliders */}
      {activeMealTypes.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground mb-3">
            Ricette nuove generate dall'AI
          </p>
          <div className="space-y-4">
            {activeMealTypes.map(type => {
              const count = newRecipePerMeal[type] ?? 0;
              return (
                <div key={type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-foreground">{MEAL_LABELS[type]}</span>
                    <span className="text-sm font-bold text-primary tabular-nums w-4 text-center">
                      {count}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={7}
                    value={count}
                    onChange={e => setMealRecipeCount(type, parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>0 (solo dal ricettario)</span>
                    <span>7</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes and free-text preferences */}
      <div>
        <p className="text-sm font-medium text-foreground mb-1">Note e preferenze</p>
        <textarea
          value={userNotes}
          onChange={e => setUserNotes(e.target.value.slice(0, 500))}
          placeholder="Es: voglio ricette veloci da preparare, ho già delle zucchine in frigo..."
          rows={3}
          className={cn(
            'w-full text-sm border border-border rounded-md px-3 py-2 resize-none',
            'bg-background text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary'
          )}
        />
        {userNotes.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 text-right">{userNotes.length}/500</p>
        )}
      </div>

      <FamilyContextToggle
        checked={useFamilyContext}
        onChange={onUseFamilyContextChange}
        disabled={isTestAccount || (!hasValidFamilyProfile && !useFamilyContext)}
        hasValidProfile={hasValidFamilyProfile}
        compact
      />

      {/* Advanced options: per-meal category settings */}
      {activeMealTypes.length > 0 && categories.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {showAdvanced ? 'Nascondi impostazioni AI avanzate' : 'Mostra impostazioni AI avanzate'}
          </button>

          {showAdvanced && (
            <div className="space-y-3 border-t pt-4">
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Impostazioni per portata</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Per ogni portata puoi indicare una categoria preferita e le categorie da escludere.
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
        </>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3 pt-2">
        {isTestAccount && (
          <p className="text-xs text-muted-foreground bg-accent rounded-md px-3 py-2">
            L'account di test non può usare la generazione AI. Puoi comunque creare un piano manuale.
          </p>
        )}
        <Button
          onClick={() => onGenerateWithAI(buildConfig())}
          disabled={!isValid || isLoading || isTestAccount}
          className="w-full gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Genera piano con AI
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
