'use client';

import { ChevronLeft, ChevronRight, Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface PlannerHeaderProps {
  weekStartDate: string;    // "YYYY-MM-DD" Monday
  onPrevWeek: () => void;
  onNextWeek: () => void;
  /** Jumps back to the current week. Omitted = the button never shows. */
  onGoToToday?: () => void;
  /** True when the displayed week is the current one: "Oggi" would be a no-op. */
  isCurrentWeek: boolean;
  onNewPlan: () => void;
  onDeletePlan: () => void;
  onCopyPlan?: () => void;
  hasPlan: boolean;
  isGenerating: boolean;
}

/**
 * Header of the meal planner: page title, week navigation, plan actions.
 *
 * LAYOUT: one row on desktop (title left, week centered, actions right — a three-zone
 * grid keeps the week optically centered whatever the side widths), stacked below
 * 1440px with 44px touch targets.
 *
 * WHY "ELIMINA PIANO" IS A GHOST BUTTON:
 * A filled rust button sitting permanently in the header was the most saturated patch
 * of the page and competed with the terracotta primary (DESIGN.md, The Stamp Rule).
 * The action stays one tap away and is still guarded by a ConfirmDialog; only its
 * resting weight changed.
 */
export function PlannerHeader({
  weekStartDate,
  onPrevWeek,
  onNextWeek,
  onGoToToday,
  isCurrentWeek,
  onNewPlan,
  onDeletePlan,
  onCopyPlan,
  hasPlan,
  isGenerating,
}: PlannerHeaderProps) {
  const weekLabel = formatWeekLabel(weekStartDate);

  return (
    <header className="flex flex-col gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6">
      <h1 className="font-display text-3xl font-semibold italic leading-tight text-foreground">
        Pianificatore pasti
      </h1>

      {/* Week navigation */}
      <div className="flex items-center justify-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevWeek}
          disabled={isGenerating}
          aria-label="Settimana precedente"
          className="h-11 w-11 lg:h-9 lg:w-9 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span
          className={cn(
            'text-sm font-semibold text-foreground whitespace-nowrap px-1 tabular-nums',
            'min-w-[160px] text-center'
          )}
          aria-live="polite"
        >
          {weekLabel}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNextWeek}
          disabled={isGenerating}
          aria-label="Settimana successiva"
          className="h-11 w-11 lg:h-9 lg:w-9 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {onGoToToday && !isCurrentWeek && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGoToToday}
            disabled={isGenerating}
            className="ml-1 h-11 lg:h-9"
            aria-label="Torna alla settimana corrente"
          >
            Oggi
          </Button>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onNewPlan}
          disabled={isGenerating}
          className="h-11 lg:h-9 gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Nuovo piano
        </Button>

        {hasPlan && onCopyPlan && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyPlan}
            disabled={isGenerating}
            className="h-11 lg:h-9 gap-1.5"
            aria-label="Copia il piano in un'altra settimana"
          >
            <Copy className="h-4 w-4" />
            Copia piano
          </Button>
        )}

        {hasPlan && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeletePlan}
            disabled={isGenerating}
            className="h-11 lg:h-9 gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Elimina piano corrente"
          >
            <Trash2 className="h-4 w-4" />
            Elimina piano
          </Button>
        )}
      </div>
    </header>
  );
}

/**
 * Format a week start date (Monday) as "17 – 23 marzo 2026".
 */
function formatWeekLabel(weekStartDate: string): string {
  const start = new Date(weekStartDate + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const month = end.toLocaleDateString('it-IT', { month: 'long' });
  const year = end.getFullYear();

  // If week spans two months, include start month too
  if (start.getMonth() !== end.getMonth()) {
    const startMonth = start.toLocaleDateString('it-IT', { month: 'long' });
    return `${startDay} ${startMonth} – ${endDay} ${month} ${year}`;
  }

  return `${startDay} – ${endDay} ${month} ${year}`;
}
