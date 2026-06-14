'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type PositionFilter = 'all' | 'frigo' | 'dispensa' | 'freezer';

interface PantrySearchFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  positionFilter: PositionFilter;
  onPositionChange: (pos: PositionFilter) => void;
  onlyExpiring: boolean;
  onOnlyExpiringChange: (v: boolean) => void;
}

const POSITIONS: { id: PositionFilter; label: string; icon?: string }[] = [
  { id: 'all', label: 'Tutto' },
  { id: 'frigo', label: 'Frigo', icon: '❄' },
  { id: 'dispensa', label: 'Dispensa', icon: '▥' },
  { id: 'freezer', label: 'Freezer', icon: '✻' },
];

export function PantrySearchFilters({
  search,
  onSearchChange,
  positionFilter,
  onPositionChange,
  onlyExpiring,
  onOnlyExpiringChange,
}: PantrySearchFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          placeholder="Cerca nella dispensa…"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-card text-foreground pl-9 pr-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
      </div>

      {/* Position chips + expiring toggle */}
      <div className="flex flex-wrap gap-2">
        {POSITIONS.map(pos => (
          <button
            key={pos.id}
            onClick={() => onPositionChange(pos.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
              positionFilter === pos.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
          >
            {pos.icon && <span className="text-[11px]">{pos.icon}</span>}
            {pos.label}
          </button>
        ))}

        <button
          onClick={() => onOnlyExpiringChange(!onlyExpiring)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ml-auto',
            onlyExpiring
              ? 'bg-destructive/15 text-destructive'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          )}
        >
          Scade presto
        </button>
      </div>
    </div>
  );
}
