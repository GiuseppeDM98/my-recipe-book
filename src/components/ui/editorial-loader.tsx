import { ChefHat } from 'lucide-react';

import { cn } from '@/lib/utils/cn';

interface EditorialLoaderProps {
  label: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}

/**
 * Warm loading block used across pages where the user is waiting on AI/auth/data.
 * The copy does most of the emotional work; motion stays brief and optional.
 */
export function EditorialLoader({ label, hint, className, compact = false }: EditorialLoaderProps) {
  return (
    <div
      className={cn(
        'shell-panel rounded-[1.5rem] px-6 py-6 text-center shadow-[0_24px_55px_-34px_oklch(var(--foreground)/0.32)]',
        'animate-fade-up motion-reduce:animate-none',
        compact ? 'max-w-sm' : 'max-w-md',
        className
      )}
    >
      <div className="relative z-10 mx-auto flex w-fit items-center gap-3 rounded-full border border-primary/18 bg-background/78 px-4 py-2 text-primary shadow-[0_12px_30px_-24px_oklch(var(--primary)/0.75)]">
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/14">
          <span className="absolute inset-0 rounded-full border border-primary/15 animate-gentle-pulse motion-reduce:animate-none" />
          <ChefHat className="relative h-5 w-5" />
        </span>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-soft-bob motion-reduce:animate-none" />
          <span
            className="h-2 w-2 rounded-full bg-primary/45 animate-soft-bob motion-reduce:animate-none"
            style={{ animationDelay: '120ms' }}
          />
          <span
            className="h-2 w-2 rounded-full bg-primary/30 animate-soft-bob motion-reduce:animate-none"
            style={{ animationDelay: '240ms' }}
          />
        </div>
      </div>

      <p className="editorial-kicker relative z-10 mt-5 text-[0.66rem] font-semibold uppercase text-muted-foreground">In preparazione</p>
      <p className="relative z-10 mt-2 font-display text-2xl font-semibold italic text-foreground">{label}</p>
      {hint ? <p className="relative z-10 mt-2 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
