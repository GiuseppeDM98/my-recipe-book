'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export const CATEGORY_COLOR_PRESETS = [
  '#FF6B6B',
  '#F38181',
  '#FFA07A',
  '#F9A826',
  '#FFD166',
  '#95E1D3',
  '#4ECDC4',
  '#2A9D8F',
  '#4D96FF',
  '#6C63FF',
  '#9B5DE5',
  '#C77DFF',
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
