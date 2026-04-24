'use client';

import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

interface PlannerHeaderProps {
  weekStartDate: string;    // "YYYY-MM-DD" Monday
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onNewPlan: () => void;
  onDeletePlan: () => void;
  hasPlan: boolean;
  isGenerating: boolean;
}

/**
 * Header for the meal planner calendar view.
 *
 * Shows the current week range with prev/next navigation and action buttons.
 * The week label is formatted as "Lun 17 – Dom 23 marzo 2026".
 */
export function PlannerHeader({
  weekStartDate,
  onPrevWeek,
  onNextWeek,
  onNewPlan,
  onDeletePlan,
  hasPlan,
  isGenerating,
}: PlannerHeaderProps) {
  const weekLabel = formatWeekLabel(weekStartDate);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Week navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevWeek}
          disabled={isGenerating}
          aria-label="Settimana precedente"
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className={cn(
          'text-sm font-semibold text-foreground whitespace-nowrap px-1',
          'min-w-[160px] text-center'
        )}>
          {weekLabel}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNextWeek}
          disabled={isGenerating}
          aria-label="Settimana successiva"
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {hasPlan && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeletePlan}
            disabled={isGenerating}
            className="h-8 gap-1.5"
            aria-label="Elimina piano corrente"
          >
            <Trash2 className="h-4 w-4" />
            Elimina piano
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onNewPlan}
          disabled={isGenerating}
          className="h-8 gap-1"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuovo piano
        </Button>
      </div>
    </div>
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
