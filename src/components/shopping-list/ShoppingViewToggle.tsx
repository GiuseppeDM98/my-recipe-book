'use client';

import { cn } from '@/lib/utils/cn';

export type ShoppingViewMode = 'reparto' | 'ricetta';

interface ShoppingViewToggleProps {
  value: ShoppingViewMode;
  onChange: (value: ShoppingViewMode) => void;
}

const OPTIONS: Array<{ value: ShoppingViewMode; label: string }> = [
  { value: 'reparto', label: 'Per reparto' },
  { value: 'ricetta', label: 'Per ricetta' },
];

/** Two-option segmented control switching between department and per-recipe grouping. */
export function ShoppingViewToggle({ value, onChange }: ShoppingViewToggleProps) {
  return (
    <div className="inline-flex rounded-lg bg-muted p-1">
      {OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            value === option.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
