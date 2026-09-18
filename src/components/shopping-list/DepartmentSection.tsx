'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { DepartmentRow, DepartmentSectionModel } from '@/lib/utils/shopping-departments';
import { ShoppingItemRow } from './ShoppingItemRow';

interface DepartmentSectionProps {
  section: DepartmentSectionModel;
  onToggle: (id: string, adHocGroupId?: string) => void;
  onRemove: (id: string, adHocGroupId?: string) => void;
  /**
   * Opens "Sposta in reparto…" for a row. Not called for rows whose
   * department comes from the matched pantry entry (source === 'pantry'):
   * an override there would have no effect because of precedence.
   */
  onMove: (row: DepartmentRow, currentDepartmentId: string) => void;
}

/**
 * One collapsible department section in the "Per reparto" shopping list view.
 * Structurally identical to ShoppingSection, plus a color swatch dot (never a
 * side-stripe, AGENTS.md ban) identifying the department at a glance.
 */
export function DepartmentSection({ section, onToggle, onRemove, onMove }: DepartmentSectionProps) {
  const [expanded, setExpanded] = useState(true);

  const checkedCount = section.rows.filter(row => row.checked).length;
  const allChecked = checkedCount === section.rows.length && section.rows.length > 0;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left',
          'font-semibold text-sm transition-colors',
          allChecked
            ? 'text-accent bg-accent/8 border border-accent/30'
            : 'text-foreground hover:bg-muted'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: section.color }}
        />
        <span className="flex-1 truncate">
          {allChecked && '✓ '}
          {section.name}
        </span>
        <span className={cn('text-xs font-normal', allChecked ? 'text-accent' : 'text-muted-foreground')}>
          {checkedCount}/{section.rows.length}
        </span>
      </button>

      <div
        className={cn(
          'grid motion-reduce:transition-none',
          'transition-[grid-template-rows] duration-200 ease-in-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pl-2 pt-1">
            {section.rows.map(row => (
              <ShoppingItemRow
                key={row.rowKey}
                name={row.name}
                quantity={row.quantity}
                checked={row.checked}
                footnote={row.footnote}
                onToggle={() => onToggle(row.id, row.groupId)}
                onRemove={row.kind !== 'plan' ? () => onRemove(row.id, row.groupId) : undefined}
                onMove={row.source !== 'pantry' ? () => onMove(row, section.id) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
