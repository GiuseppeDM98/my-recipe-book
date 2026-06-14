'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Sun, Moon, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type ThemeValue = 'system' | 'light' | 'dark';

const OPTIONS: { value: ThemeValue; label: string; Icon: LucideIcon }[] = [
  { value: 'system', label: 'Sistema', Icon: Monitor },
  { value: 'light', label: 'Chiaro', Icon: Sun },
  { value: 'dark', label: 'Scuro', Icon: Moon },
];

/**
 * Cambia tema con un "circle reveal" centrato sul punto cliccato, usando la
 * View Transitions API. Senza supporto browser ricade su un semplice setTheme.
 */
function applyThemeWithTransition(
  value: ThemeValue,
  e: React.MouseEvent<HTMLButtonElement>,
  setTheme: (t: string) => void
) {
  if (
    typeof document === 'undefined' ||
    !('startViewTransition' in document) ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    setTheme(value);
    return;
  }

  const { clientX: cx, clientY: cy } = e;
  const root = document.documentElement;
  const r = Math.hypot(
    Math.max(cx, window.innerWidth - cx),
    Math.max(cy, window.innerHeight - cy)
  );

  root.style.setProperty('--vt-cx', `${cx}px`);
  root.style.setProperty('--vt-cy', `${cy}px`);
  root.style.setProperty('--vt-r', `${r}px`);

  (
    document as Document & {
      startViewTransition: (cb: () => void) => void;
    }
  ).startViewTransition(() => setTheme(value));
}

export function ThemePicker({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Evita il mismatch di idratazione: il tema reale è noto solo lato client.
  useEffect(() => setMounted(true), []);

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-card p-1',
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={(e) => applyThemeWithTransition(value, e, setTheme)}
            className={cn(
              'inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
