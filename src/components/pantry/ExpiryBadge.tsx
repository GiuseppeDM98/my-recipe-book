'use client';

import { ExpiryInfo, ExpiryStatus } from '@/lib/utils/pantry-utils';
import { cn } from '@/lib/utils/cn';

interface ExpiryBadgeProps {
  info: ExpiryInfo;
  className?: string;
}

const WARNING_COLOR = 'oklch(45% 0.14 75)';

export function ExpiryBadge({ info, className }: ExpiryBadgeProps) {
  const { status, label } = info;

  if (status === 'nessuna') return null;

  const isUrgent = status === 'scaduto' || status === 'oggi';
  const isWarning = status === 'urgente' || status === 'presto';
  const isMuted = status === 'ok' || status === 'lungo';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none',
        isUrgent && 'bg-destructive/10 text-destructive',
        isMuted && 'bg-muted text-muted-foreground',
        className
      )}
      style={isWarning ? { background: 'oklch(68% 0.15 75 / 0.15)', color: WARNING_COLOR } : undefined}
    >
      {label}
    </span>
  );
}

export function expiryBorderClass(status: ExpiryStatus): string {
  if (status === 'scaduto' || status === 'oggi' || status === 'urgente') {
    return 'border-destructive/20 bg-destructive/5';
  }
  return '';
}
