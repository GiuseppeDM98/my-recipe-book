'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ShoppingItem } from '@/types';
import { ShoppingItemRow } from './ShoppingItemRow';

interface ShoppingSectionProps {
  title: string;
  items: ShoppingItem[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  defaultExpanded?: boolean;
}

export function ShoppingSection({
  title,
  items,
  checkedIds,
  onToggle,
  onRemove,
  defaultExpanded = true,
}: ShoppingSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const checkedCount = items.filter(item => checkedIds.has(item.id)).length;
  const allChecked = checkedCount === items.length && items.length > 0;

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
            ? 'text-green-600 bg-green-50 border border-green-200'
            : 'text-foreground hover:bg-muted'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
        )}
        <span className="flex-1 truncate">
          {allChecked && '✓ '}
          {title}
        </span>
        <span className={cn(
          'text-xs font-normal',
          allChecked ? 'text-green-500' : 'text-muted-foreground'
        )}>
          {checkedCount}/{items.length}
        </span>
      </button>

      {/* Grid animation — GPU-friendly, niente max-height thrash */}
      <div className={cn(
        'grid motion-reduce:transition-none',
        'transition-[grid-template-rows] duration-200 ease-in-out',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}>
        <div className="overflow-hidden">
          <div className="space-y-1 pl-2 pt-1">
            {items.map(item => (
              <ShoppingItemRow
                key={item.id}
                item={item}
                checked={checkedIds.has(item.id)}
                onToggle={() => onToggle(item.id)}
                onRemove={item.isCustom ? () => onRemove(item.id) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
