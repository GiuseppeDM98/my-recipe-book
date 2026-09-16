'use client';

import { Check } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils/cn';
import { PANTRY_CATEGORIES } from '@/lib/utils/pantry-utils';
import { DepartmentRow } from '@/lib/utils/shopping-departments';

interface MoveToDepartmentSheetProps {
  /** Row being moved, or null when the sheet is closed. Content is derived from
   * this prop on every open — never copied into local state (AGENTS.md: non-reactive useState(prop)). */
  target: (DepartmentRow & { currentDepartmentId: string }) | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (canonicalKey: string, departmentId: string) => void;
}

/**
 * "Sposta in reparto…" — permanently overrides the department of one
 * ingredient (by canonical key, so it applies to every occurrence and future
 * weeks). Not destructive: no ConfirmDialog, feedback via toast from the mutation.
 */
export function MoveToDepartmentSheet({ target, onOpenChange, onSelect }: MoveToDepartmentSheetProps) {
  return (
    <Sheet open={target !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-lg:portrait:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Sposta in reparto</SheetTitle>
          <SheetDescription>
            {target
              ? `Scegli il reparto in cui vedere «${target.name}». La scelta vale per sempre per questo ingrediente.`
              : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 max-h-[60vh] space-y-1 overflow-y-auto">
          {target &&
            PANTRY_CATEGORIES.map(category => {
              const isCurrent = category.id === target.currentDepartmentId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    onSelect(target.canonicalKey, category.id);
                    onOpenChange(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                    isCurrent ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted'
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="flex-1 truncate font-medium">{category.name}</span>
                  {isCurrent && <Check className="h-4 w-4 flex-shrink-0" />}
                </button>
              );
            })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
