'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MealType } from '@/types';
import { MEAL_LABELS, SELECTABLE_MEAL_TYPES, sortMealTypes } from '@/lib/constants/meal-types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const DAY_CHIPS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const ALL_DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

interface PlanStructureCardProps {
  activeDays: number[];
  activeMealTypes: MealType[];
  /** True when the user has at least one recipe, so autofill can produce something. */
  hasRecipes: boolean;
  disabled?: boolean;
  onAddDay: (dayIndex: number) => Promise<void>;
  onRemoveDay: (dayIndex: number) => Promise<void>;
  onAddMealType: (mealType: MealType, autofill: boolean) => Promise<void>;
  onRemoveMealType: (mealType: MealType) => Promise<void>;
}

/**
 * Editor for the shape of an already-created plan: which days and which meals it covers.
 *
 * WHY IT EXISTS:
 * Both activeDays and activeMealTypes used to be fixed at creation time. Adding
 * breakfast to a week already in progress meant deleting the plan and rebuilding
 * it from scratch, losing every slot the user had curated.
 *
 * CONFIRMATION POLICY:
 * Removing a day or a meal also deletes its slots, so both go through ConfirmDialog.
 * Adding is non-destructive, but adding a meal asks one question — fill it with a
 * shuffle or leave it empty — because the two produce very different calendars.
 */
export function PlanStructureCard({
  activeDays,
  activeMealTypes,
  hasRecipes,
  disabled = false,
  onAddDay,
  onRemoveDay,
  onAddMealType,
  onRemoveMealType,
}: PlanStructureCardProps) {
  const [dayToRemove, setDayToRemove] = useState<number | null>(null);
  const [mealTypeToRemove, setMealTypeToRemove] = useState<MealType | null>(null);
  const [mealTypeToAdd, setMealTypeToAdd] = useState<MealType | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const inactiveDays = ALL_DAY_INDEXES.filter(day => !activeDays.includes(day));
  const inactiveMealTypes = SELECTABLE_MEAL_TYPES.filter(type => !activeMealTypes.includes(type));

  const isLastDay = activeDays.length === 1;
  const isLastMealType = activeMealTypes.length === 1;

  /** Runs a mutation, then closes whichever dialog triggered it. */
  async function runAndClose(action: () => Promise<void>, close: () => void) {
    setIsWorking(true);
    try {
      await action();
      close();
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Days ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Giorni inclusi nel piano</p>
          <p className="text-xs text-muted-foreground">
            Togli un giorno che non ti serve o riaggiungilo, senza rifare l&apos;intera settimana.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {activeDays.map((dayIndex) => (
            <button
              key={dayIndex}
              type="button"
              onClick={() => setDayToRemove(dayIndex)}
              disabled={isLastDay || disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
              title={
                isLastDay
                  ? 'Il piano deve mantenere almeno un giorno attivo'
                  : `Rimuovi ${DAY_CHIPS[dayIndex]}`
              }
              aria-label={`Rimuovi ${DAY_CHIPS[dayIndex]} dal piano`}
            >
              <span>{DAY_CHIPS[dayIndex]}</span>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}

          {inactiveDays.map((dayIndex) => (
            <button
              key={dayIndex}
              type="button"
              onClick={() => onAddDay(dayIndex)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              title={`Aggiungi ${DAY_CHIPS[dayIndex]}`}
              aria-label={`Aggiungi ${DAY_CHIPS[dayIndex]} al piano`}
            >
              <span>{DAY_CHIPS[dayIndex]}</span>
              <Plus className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Meal types ───────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Portate del piano</p>
          <p className="text-xs text-muted-foreground">
            Aggiungi una portata alla settimana già avviata: le ricette che hai scelto restano dove sono.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {sortMealTypes(activeMealTypes).map((mealType) => (
            <button
              key={mealType}
              type="button"
              onClick={() => setMealTypeToRemove(mealType)}
              disabled={isLastMealType || disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
              title={
                isLastMealType
                  ? 'Il piano deve mantenere almeno una portata'
                  : `Rimuovi ${MEAL_LABELS[mealType]}`
              }
              aria-label={`Rimuovi ${MEAL_LABELS[mealType]} dal piano`}
            >
              <span>{MEAL_LABELS[mealType]}</span>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}

          {inactiveMealTypes.map((mealType) => (
            <button
              key={mealType}
              type="button"
              onClick={() => setMealTypeToAdd(mealType)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              title={`Aggiungi ${MEAL_LABELS[mealType]}`}
              aria-label={`Aggiungi ${MEAL_LABELS[mealType]} al piano`}
            >
              <span>{MEAL_LABELS[mealType]}</span>
              <Plus className="h-3.5 w-3.5" />
            </button>
          ))}

          {inactiveMealTypes.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Il piano copre già tutte le portate.
            </p>
          )}
        </div>
      </div>

      {/* ── Add meal type: empty or shuffled ─────────── */}
      <Dialog
        open={mealTypeToAdd !== null}
        onOpenChange={(open) => {
          if (!open && !isWorking) setMealTypeToAdd(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Aggiungi {mealTypeToAdd ? MEAL_LABELS[mealTypeToAdd].toLowerCase() : ''} al piano
            </DialogTitle>
            <DialogDescription>
              Posso riempire la nuova riga pescando dal tuo ricettario, oppure lasciarla vuota
              perché la componga tu slot per slot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (mealTypeToAdd) {
                  runAndClose(() => onAddMealType(mealTypeToAdd, false), () => setMealTypeToAdd(null));
                }
              }}
              disabled={isWorking}
            >
              Lascia vuota
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (mealTypeToAdd) {
                  runAndClose(() => onAddMealType(mealTypeToAdd, true), () => setMealTypeToAdd(null));
                }
              }}
              disabled={isWorking || !hasRecipes}
              title={hasRecipes ? undefined : 'Non hai ancora ricette da cui pescare'}
            >
              Riempi con shuffle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={mealTypeToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMealTypeToRemove(null);
        }}
        title={
          mealTypeToRemove
            ? `Rimuovere ${MEAL_LABELS[mealTypeToRemove].toLowerCase()} dal piano?`
            : ''
        }
        description="Le ricette assegnate a questa portata escono dal piano e dalla lista della spesa. Le ricette restano nel ricettario."
        confirmLabel="Rimuovi portata"
        isConfirming={isWorking}
        onConfirm={() => {
          if (mealTypeToRemove) {
            runAndClose(() => onRemoveMealType(mealTypeToRemove), () => setMealTypeToRemove(null));
          }
        }}
      />

      <ConfirmDialog
        open={dayToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setDayToRemove(null);
        }}
        title={dayToRemove !== null ? `Rimuovere ${DAY_CHIPS[dayToRemove]} dal piano?` : ''}
        description="Le ricette assegnate a questo giorno escono dal piano e dalla lista della spesa. Le ricette restano nel ricettario."
        confirmLabel="Rimuovi giorno"
        isConfirming={isWorking}
        onConfirm={() => {
          if (dayToRemove !== null) {
            runAndClose(() => onRemoveDay(dayToRemove), () => setDayToRemove(null));
          }
        }}
      />
    </div>
  );
}
