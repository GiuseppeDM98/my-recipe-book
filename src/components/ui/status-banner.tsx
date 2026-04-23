import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type StatusBannerTone = 'info' | 'success' | 'warning' | 'danger';

interface StatusBannerProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: StatusBannerTone;
  className?: string;
}

const toneClasses: Record<StatusBannerTone, string> = {
  info: 'border-primary/20 bg-[linear-gradient(135deg,_oklch(var(--primary)/0.07),_oklch(var(--background)/0.98))] text-foreground',
  success: 'border-accent/25 bg-[linear-gradient(135deg,_oklch(var(--accent)/0.12),_oklch(var(--background)/0.98))] text-foreground',
  warning: 'border-[oklch(70%_0.09_78)]/35 bg-[linear-gradient(135deg,_oklch(95%_0.03_78),_oklch(var(--background)/0.98))] text-foreground',
  danger: 'border-destructive/20 bg-[linear-gradient(135deg,_oklch(var(--destructive)/0.08),_oklch(var(--background)/0.98))] text-foreground',
};

const iconClasses: Record<StatusBannerTone, string> = {
  info: 'bg-primary/12 text-primary',
  success: 'bg-accent/14 text-accent',
  warning: 'bg-[oklch(82%_0.07_78)]/30 text-[oklch(48%_0.11_78)]',
  danger: 'bg-destructive/12 text-destructive',
};

/**
 * Shared status container for AI/info/error/success panels.
 * It keeps feedback consistent while still allowing contextual copy.
 */
export function StatusBanner({
  icon,
  title,
  description,
  action,
  tone = 'info',
  className,
}: StatusBannerProps) {
  return (
    <div
      className={cn(
        'shell-panel rounded-[1.35rem] px-4 py-4 shadow-[0_18px_35px_-28px_oklch(var(--foreground)/0.2)]',
        toneClasses[tone],
        className
      )}
    >
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full', iconClasses[tone])}>
            {icon}
          </span>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{title}</p>
            <div className="text-sm leading-6 text-muted-foreground">{description}</div>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
