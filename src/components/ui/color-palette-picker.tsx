'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Earthy, brand-aligned category swatches.
 *
 * WHY: the previous palette leaned on neon coral/teal/violet/blue, hues the
 * "Carta e Terracotta" brand explicitly rejects (no cold blue/purple). These
 * twelve stay in the warm, natural band (terracotta, ochre, olive, sage,
 * clay, cocoa) so a category dot still reads as part of the cookbook, while
 * remaining distinct enough to tell categories apart at a glance.
 */
export const CATEGORY_COLOR_PRESETS = [
  '#C25A3C', // terracotta
  '#A8442A', // mattone / rust
  '#D08A2E', // ocra calda
  '#E0B04A', // miele / senape
  '#8A8B3D', // oliva
  '#6E9A6B', // salvia
  '#3F6B52', // pino / verde bosco
  '#2F7D6E', // petrolio erbaceo
  '#B6705F', // argilla rosata
  '#7D4A5C', // prugna calda
  '#6F4E37', // cacao / terra
  '#A98467', // tortora caldo
] as const;

interface ColorPalettePickerProps {
  label?: string;
  value: string;
  onChange: (color: string) => void;
}

export function ColorPalettePicker({
  label = 'Colore',
  value,
  onChange,
}: ColorPalettePickerProps) {
  return (
    <div>
      <label className="block text-sm font-medium mb-2">{label}</label>
      <div className="grid grid-cols-6 gap-2">
        {CATEGORY_COLOR_PRESETS.map(color => {
          const isSelected = value.toLowerCase() === color.toLowerCase();

          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform',
                'hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/30',
                isSelected ? 'border-foreground shadow-sm' : 'border-transparent'
              )}
              style={{ backgroundColor: color }}
              aria-label={`Seleziona colore ${color}`}
              aria-pressed={isSelected}
              title={color}
            >
              {isSelected ? <Check className="w-4 h-4 text-white" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
