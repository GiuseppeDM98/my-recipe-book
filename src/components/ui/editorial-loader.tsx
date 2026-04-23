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
        'rounded-[1.25rem] border border-border/70 bg-card/90 px-6 py-6 text-center shadow-[0_18px_45px_-32px_oklch(var(--foreground)/0.38)]',
        'animate-fade-up motion-reduce:animate-none',
        compact ? 'max-w-sm' : 'max-w-md',
        className
      )}
    >
      <div className="mx-auto flex w-fit items-center gap-3 rounded-full border border-primary/20 bg-primary/8 px-4 py-2 text-primary">
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

      <p className="mt-4 font-display text-2xl font-semibold italic text-foreground">{label}</p>
      {hint ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
