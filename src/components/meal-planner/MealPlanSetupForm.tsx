'use client';

import { useState } from 'react';
import { Sparkles, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Category, MealPlanSetupConfig, MealType, Season } from '@/types';
import { SEASON_ICONS, SEASON_LABELS, getCurrentSeason, getCurrentWeekMonday } from '@/lib/constants/seasons';
import { cn } from '@/lib/utils/cn';

interface MealPlanSetupFormProps {
  categories: Category[];
  onGenerateWithAI: (config: MealPlanSetupConfig) => void;
  onCreateManual: (config: MealPlanSetupConfig) => void;
  isLoading: boolean;
  isTestAccount: boolean;
}

const ALL_MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'colazione', label: 'Colazione' },
  { value: 'pranzo', label: 'Pranzo' },
  { value: 'cena', label: 'Cena' },
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
}: MealPlanSetupFormProps) {
  const [season, setSeason] = useState<Exclude<Season, 'tutte_stagioni'>>(getCurrentSeason());
  const [activeMealTypes, setActiveMealTypes] = useState<MealType[]>(['pranzo', 'cena']);
  const [excludedCategoryIds, setExcludedCategoryIds] = useState<string[]>([]);
  const [weekStartDate, setWeekStartDate] = useState(getCurrentWeekMonday());
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [courseCategoryMap, setCourseCategoryMap] = useState<Partial<Record<MealType, string>>>({});
  const [newRecipePerMeal, setNewRecipePerMeal] = useState<Partial<Record<MealType, number>>>({
    pranzo: 2,
    cena: 0,
  });

  const isValid = activeMealTypes.length > 0;

  function buildConfig(): MealPlanSetupConfig {
    const totalNewRecipes = Object.values(newRecipePerMeal).reduce((sum, n) => sum + (n ?? 0), 0);
    return {
      season,
      activeMealTypes,
      excludedCategoryIds,
      newRecipeCount: totalNewRecipes,
      weekStartDate,
      courseCategoryMap: Object.keys(courseCategoryMap).length > 0 ? courseCategoryMap : undefined,
      newRecipePerMeal: Object.keys(newRecipePerMeal).length > 0 ? newRecipePerMeal : undefined,
    };
  }

  function toggleMealType(type: MealType) {
    setActiveMealTypes(prev => {
      if (prev.includes(type)) {
        setNewRecipePerMeal(m => { const n = { ...m }; delete n[type]; return n; });
        setCourseCategoryMap(m => { const n = { ...m }; delete n[type]; return n; });
        return prev.filter(t => t !== type);
      }
      setNewRecipePerMeal(m => ({ ...m, [type]: 0 }));
      return [...prev, type];
    });
  }

  function setMealRecipeCount(type: MealType, count: number) {
    setNewRecipePerMeal(prev => ({ ...prev, [type]: count }));
  }

  function setCourseCategory(type: MealType, categoryId: string) {
    setCourseCategoryMap(prev => {
      const next = { ...prev };
      if (categoryId) next[type] = categoryId;
      else delete next[type];
      return next;
    });
  }

  function toggleCategory(id: string) {
    setExcludedCategoryIds(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
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

      {/* Meal types — flat list, all types on the same level */}
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

      {/* Advanced options */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        {showAdvanced ? 'Nascondi opzioni avanzate' : 'Mostra opzioni avanzate'}
      </button>

      {showAdvanced && (
        <div className="space-y-5 border-t pt-4">
          {/* Week selector */}
          <div>
            <p className="text-sm font-medium text-foreground mb-1">Settimana</p>
            <input
              type="date"
              value={weekStartDate}
              min={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10); })()}
              max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 2); return d.toISOString().slice(0, 10); })()}
              onChange={e => {
                const d = new Date(e.target.value + 'T00:00:00');
                const day = d.getDay();
                const diff = day === 0 ? -6 : 1 - day;
                d.setDate(d.getDate() + diff);
                setWeekStartDate(d.toISOString().slice(0, 10));
              }}
              className={cn(
                'text-sm border border-border rounded-md px-3 py-1.5',
                'bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary'
              )}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Viene automaticamente arrotondata al lunedì della settimana selezionata
            </p>
          </div>

          {/* Category preference per active meal type */}
          {activeMealTypes.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Categoria preferita per portata</p>
              <p className="text-xs text-muted-foreground mb-3">
                L'AI darà priorità alle ricette di questa categoria quando pianifica ogni portata.
              </p>
              <div className="space-y-2">
                {activeMealTypes.map(type => (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-32 shrink-0">{MEAL_LABELS[type]}</span>
                    <select
                      value={courseCategoryMap[type] ?? ''}
                      onChange={e => setCourseCategory(type, e.target.value)}
                      className={cn(
                        'flex-1 text-sm border border-border rounded-md px-2 py-1.5 bg-background',
                        'focus:outline-none focus:ring-2 focus:ring-primary'
                      )}
                    >
                      <option value="">Nessuna preferenza</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Category exclusions */}
          {categories.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Escludi categorie</p>
              <p className="text-xs text-muted-foreground mb-2">
                Le ricette di queste categorie non verranno suggerite dall'AI
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {categories.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={excludedCategoryIds.includes(cat.id)}
                      onChange={() => toggleCategory(cat.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm">
                      {cat.icon && <span className="mr-1">{cat.icon}</span>}
                      {cat.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
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
