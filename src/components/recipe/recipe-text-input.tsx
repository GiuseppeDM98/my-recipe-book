'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

/**
 * RecipeTextInput - Free-form recipe text input for AI formatting
 *
 * PURPOSE: Accept a rough recipe typed or pasted by the user and submit it
 * for AI formatting into the app's structured recipe format.
 *
 * Mirrors the interface of RecipeExtractorUpload so the parent page can
 * treat both input modes uniformly.
 *
 * Validation: Minimum 50 characters before submit is enabled, to prevent
 * accidental empty or trivial submissions.
 */

const MIN_CHARS = 50;

const PLACEHOLDER = `Scrivi o incolla qui la tua ricetta in qualsiasi formato...

Esempio:
Pasta al pomodoro per 4 persone
- 400g spaghetti
- una lattina di pomodori pelati
- 2 spicchi d'aglio, olio evo, basilico, sale

Scaldare l'olio con l'aglio, aggiungere i pomodori e cuocere 15 minuti. Lessare la pasta e condirla con il sugo e basilico fresco.`;

interface RecipeTextInputProps {
  onTextSubmit: (text: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function RecipeTextInput({ onTextSubmit, isLoading, disabled }: RecipeTextInputProps) {
  const [text, setText] = useState('');

  const charCount = text.trim().length;
  const isValid = charCount >= MIN_CHARS;

  const handleSubmit = () => {
    if (isValid && !isLoading && !disabled) {
      onTextSubmit(text.trim());
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        disabled={isLoading || disabled}
        rows={10}
        className={`w-full rounded-lg border px-4 py-3 text-sm leading-relaxed resize-y
          placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isLoading || disabled ? 'bg-muted' : 'bg-background border-input'}`}
      />

      {/* Footer: character count + submit button */}
      <div className="flex items-center justify-between">
        {/* Character count hint */}
        <p className={`text-xs ${charCount === 0 ? 'text-muted-foreground' : isValid ? 'text-green-600' : 'text-orange-500'}`}>
          {charCount === 0
            ? `Minimo ${MIN_CHARS} caratteri`
            : isValid
            ? `${charCount} caratteri`
            : `${charCount}/${MIN_CHARS} caratteri`}
        </p>

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid || isLoading || disabled}
          size="lg"
          className="gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {isLoading ? 'Formattazione in corso...' : 'Formatta con AI'}
        </Button>
      </div>
    </div>
  );
}
