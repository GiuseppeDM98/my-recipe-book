import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

interface EditorialEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  eyebrow?: string;
  className?: string;
}

/**
 * Shared empty state shell so first-time and no-result screens feel intentional
 * instead of ad-hoc placeholders scattered through the app.
 */
export function EditorialEmptyState({
  icon,
  title,
  description,
  action,
  eyebrow,
  className,
}: EditorialEmptyStateProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[1.5rem] border border-dashed border-border bg-[radial-gradient(circle_at_top,_oklch(var(--primary)/0.09),_transparent_42%),linear-gradient(180deg,_oklch(var(--card))_0%,_oklch(var(--background))_100%)] px-6 py-12 text-center',
        className
      )}
    >
      <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/15 bg-background/90 px-4 py-2 shadow-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {eyebrow ? (
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
      </div>

      <h2 className="mt-5 font-display text-3xl font-semibold italic text-foreground">{title}</h2>
      <p className="mx-auto mt-3 max-w-[42ch] text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
    </div>
  );
}
