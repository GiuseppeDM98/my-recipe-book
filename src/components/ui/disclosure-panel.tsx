'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface DisclosurePanelProps {
  title: string;
  /**
   * One-line state of what is inside, shown under the title whether open or closed.
   * It is what makes "collapsed" different from "hidden": the user can see there is
   * something set (or to set) without opening the panel.
   */
  summary?: ReactNode;
  defaultOpen?: boolean;
  /** 'card' = a bordered surface of its own; 'plain' = a quiet row, for secondary help. */
  variant?: 'card' | 'plain';
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible section with a persistent summary.
 *
 * ANIMATION: `grid-template-rows` 0fr → 1fr, never `max-height` (which thrashes layout
 * on every frame — see AGENTS.md). The content stays mounted so its form state survives
 * a collapse.
 *
 * WHY `invisible` WHEN COLLAPSED: a 0fr row only clips the content, it stays focusable
 * and readable by screen readers. `visibility: hidden` takes it out of both; its
 * transition is delayed by the collapse duration so the closing animation still shows.
 */
export function DisclosurePanel({
  title,
  summary,
  defaultOpen = false,
  variant = 'card',
  children,
  className,
}: DisclosurePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section
      className={cn(variant === 'card' && 'rounded-xl border border-border bg-card', className)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(open => !open)}
        className={cn(
          'flex min-h-[56px] w-full items-center gap-3 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          variant === 'card'
            ? 'rounded-xl px-4 py-3 hover:bg-muted'
            : 'rounded-lg px-1 py-2 hover:text-foreground'
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm font-semibold',
              variant === 'card' ? 'text-foreground' : 'text-muted-foreground'
            )}
          >
            {title}
          </span>
          {summary ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <div
        id={contentId}
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div
          className={cn(
            'overflow-hidden',
            isOpen
              ? 'visible'
              : 'invisible [transition:visibility_0s_linear_300ms] motion-reduce:[transition:none]'
          )}
        >
          <div className={cn(variant === 'card' ? 'px-4 pb-4 pt-1' : 'px-1 pb-2 pt-1')}>{children}</div>
        </div>
      </div>
    </section>
  );
}
