'use client';

import { useState } from 'react';
import { Button } from './button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

/**
 * Emoji category structure for category icon selection
 *
 * STRUCTURE:
 * - Each category: label, icon (tab indicator), emojis (selectable options)
 * - Categories: Food-focused (Italian recipe app)
 * - Expandable: Add new categories by extending this object
 *
 * USAGE: Category management page (select icons for recipe categories)
 */
const EMOJI_CATEGORIES = {
  cibo: {
    label: 'Cibo',
    icon: '🍕',
    emojis: [
      '🍝', '🍕', '🍔', '🍟', '🌭', '🥪', '🌮', '🌯', '🥙', '🥗',
      '🍖', '🍗', '🥩', '🥓', '🍤', '🍣', '🍱', '🥟', '🍜', '🍲',
      '🍛', '🍰', '🎂', '🧁', '🥧', '🍮', '🍩', '🍪', '🍫', '🍬',
      '🍭', '🧀', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🍳'
    ]
  },
  bevande: {
    label: 'Bevande',
    icon: '🥤',
    emojis: [
      '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷',
      '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'
    ]
  },
  frutta: {
    label: 'Frutta & Verdura',
    icon: '🍎',
    emojis: [
      '🍎', '🍏', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈',
      '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🥕', '🌽', '🌶️',
      '🥒', '🥬', '🥦', '🧄', '🧅', '🥔', '🍠', '🫑', '🥑', '🍆'
    ]
  },
  utensili: {
    label: 'Utensili',
    icon: '🍴',
    emojis: [
      '🍴', '🥄', '🔪', '🥢', '🍽️', '🥡', '🧂', '🫖', '🥘', '🍳',
      '🥣', '🥗', '🍱'
    ]
  },
  altro: {
    label: 'Altro',
    icon: '⭐',
    emojis: [
      '⭐', '✨', '🔥', '💧', '❤️', '🧡', '💛', '💚', '💙', '💜',
      '🤍', '🖤', '🤎', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫',
      '⚪', '🟤', '📦', '🎁', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉'
    ]
  }
};

interface EmojiPickerProps {
  value: string;
  onSelect: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ value, onSelect, className }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>('cibo');

  const handleEmojiSelect = (emoji: string) => {
    onSelect(emoji);
    setOpen(false); // Auto-close dialog after selection
    // WHY: Selecting emoji completes the action → no need to keep dialog open
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={className}
        >
          <span className="text-2xl">{value || '➕'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Seleziona un'icona</DialogTitle>
          <DialogDescription>
            Scegli un'emoji per rappresentare la categoria
          </DialogDescription>
        </DialogHeader>

        {/* Category Tabs */}
        <div className="flex gap-2 border-b pb-2 overflow-x-auto">
          {Object.entries(EMOJI_CATEGORIES).map(([key, category]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveCategory(key as keyof typeof EMOJI_CATEGORIES)}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeCategory === key
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <span className="mr-1">{category.icon}</span>
              {category.label}
            </button>
          ))}
        </div>

        {/* Emoji Grid */}
        <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto py-2">
          {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleEmojiSelect(emoji)}
              className="w-10 h-10 flex items-center justify-center text-2xl hover:bg-muted rounded-md transition-colors"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Clear button */}
        {value && (
          <div className="border-t pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onSelect('');
                setOpen(false);
              }}
              className="w-full"
            >
              Rimuovi icona
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
