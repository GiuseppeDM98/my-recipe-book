'use client';

import { cn } from '@/lib/utils/cn';

interface ShoppingProgressBarProps {
  checked: number;
  total: number;
}

export function ShoppingProgressBar({ checked, total }: ShoppingProgressBarProps) {
  if (total === 0) return null;

  const percent = Math.round((checked / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {checked} di {total} articoli
        </span>
        <span className={cn('font-medium', percent === 100 ? 'text-green-600' : 'text-primary')}>
          {percent}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            percent === 100 ? 'bg-green-500' : 'bg-primary'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
