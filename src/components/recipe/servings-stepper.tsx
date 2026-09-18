'use client';

import { useState, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * ServingsStepper - Numeric servings control shared by cooking setup, cooking mode and
 * the meal planner (where it counts people rather than recipe servings — see `labels`).
 *
 * Why a shared component: the setup screen and the active cooking screen previously
 * duplicated the same −/input/+ block with slightly different sizing, so a change to
 * one risked diverging from the other. Extracting it keeps the control consistent.
 *
 * Why an internal string buffer: a controlled `<input type="number">` bound directly
 * to a number forces a value on every keystroke, so clearing the field would snap to 1
 * mid-edit (a `parseInt('') || 1` trap). The buffer lets the field be momentarily empty
 * while typing; the committed numeric value only changes once the input is valid, and it
 * is clamped to [min, max] on blur.
 */

interface ServingsStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /** 'lg' for the setup screen (larger touch targets), 'md' for active cooking */
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Accessible names, for callers that count something other than servings. */
  labels?: { decrease: string; increase: string; input: string };
}

const DEFAULT_LABELS = {
  decrease: 'Riduci porzioni',
  increase: 'Aumenta porzioni',
  input: 'Numero di porzioni',
};

const SIZE_CLASSES = {
  md: { button: 'w-12 h-12', icon: 'w-5 h-5', input: 'w-20 h-12 text-2xl' },
  lg: { button: 'w-14 h-14', icon: 'w-6 h-6', input: 'w-24 h-14 text-3xl' },
} as const;

export function ServingsStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'md',
  disabled = false,
  labels = DEFAULT_LABELS,
}: ServingsStepperProps) {
  const classes = SIZE_CLASSES[size];

  // Mirror of `value` as text so the field can be cleared during editing.
  // Kept in sync when the committed value changes from outside (e.g. −/+ buttons).
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const commitDraft = (raw: string) => {
    setDraft(raw);

    // Defer committing while the field is empty so the user can retype freely.
    if (raw.trim() === '') return;

    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed));
  };

  // Restore a valid number on blur in case the user left the field empty or out of range.
  const normalizeOnBlur = () => {
    const parsed = parseInt(draft, 10);
    const next = Number.isNaN(parsed) ? value : clamp(parsed);
    onChange(next);
    setDraft(String(next));
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        className={`${classes.button} p-0`}
        aria-label={labels.decrease}
      >
        <Minus className={classes.icon} />
      </Button>
      <input
        type="number"
        value={draft}
        onChange={(e) => commitDraft(e.target.value)}
        onBlur={normalizeOnBlur}
        className={`${classes.input} text-center font-bold border-2 border-input rounded-md focus:border-primary focus:outline-none bg-background text-foreground disabled:cursor-not-allowed disabled:opacity-50`}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={labels.input}
      />
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        className={`${classes.button} p-0`}
        aria-label={labels.increase}
      >
        <Plus className={classes.icon} />
      </Button>
    </div>
  );
}
