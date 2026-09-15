'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { PantryItem } from '@/types/pantry';
import { PANTRY_CATEGORIES, PANTRY_UNITS, PANTRY_POSITIONS } from '@/lib/utils/pantry-utils';
import { usePantry } from '@/lib/hooks/usePantry';

interface PantryAddSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: PantryItem | null;
}

const DEFAULT_FORM = {
  name: '',
  qty: 1,
  unit: 'pz',
  categoryId: 'condimenti',
  position: 'dispensa' as PantryItem['position'],
  purchased: '',
  expires: '',
  min: 0,
  notes: '',
};

/**
 * Manual add/edit form for a pantry item.
 *
 * Adding from the shopping list lives in the shopping list itself
 * ("Aggiungi alla dispensa" on checked items, AddCheckedToPantrySheet): that is
 * where the user is at the end of shopping, so no duplicate entry point here.
 */
export function PantryAddSheet({ open, onOpenChange, editItem }: PantryAddSheetProps) {
  const { addItem, updateItem } = usePantry();

  const [form, setForm] = useState(DEFAULT_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset / populate form when sheet opens
  function handleOpenChange(isOpen: boolean) {
    if (isOpen) {
      if (editItem) {
        setForm({
          name: editItem.name,
          qty: editItem.qty,
          unit: editItem.unit,
          categoryId: editItem.categoryId,
          position: editItem.position,
          purchased: editItem.purchased ?? '',
          expires: editItem.expires ?? '',
          min: editItem.min,
          notes: editItem.notes ?? '',
        });
      } else {
        setForm(DEFAULT_FORM);
      }
    }
    onOpenChange(isOpen);
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        qty: Number(form.qty),
        unit: form.unit,
        categoryId: form.categoryId,
        position: form.position,
        purchased: form.purchased || null,
        expires: form.expires || null,
        min: Number(form.min),
        notes: form.notes.trim() || null,
      };

      if (editItem) {
        await updateItem.mutateAsync({ id: editItem.id, data: payload });
      } else {
        await addItem.mutateAsync(payload as Omit<PantryItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>);
      }
      handleOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className="max-h-[92dvh] rounded-t-[1.75rem] border-border/70 flex flex-col overflow-hidden lg:inset-x-auto lg:left-1/2 lg:-translate-x-1/2 lg:w-[540px] lg:rounded-2xl lg:bottom-auto lg:top-1/2 lg:-translate-y-1/2"
      >
        <SheetHeader className="px-1">
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90 lg:hidden" />
          <SheetTitle className="font-display text-2xl font-semibold italic">
            {editItem ? 'Modifica prodotto' : 'Aggiungi prodotto'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {editItem ? 'Modifica un prodotto nella tua dispensa' : 'Aggiungi un prodotto alla tua dispensa'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4">
          <form id="add-pantry-form" onSubmit={handleSubmit} className="space-y-4 pb-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Prodotto <span className="text-destructive">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="es. Mozzarella di bufala"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
            </div>

            {/* Qty + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Quantità</label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={form.qty}
                  onChange={e => update('qty', parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Unità</label>
                <select
                  value={form.unit}
                  onChange={e => update('unit', e.target.value)}
                  className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                >
                  {PANTRY_UNITS.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Categoria</label>
              <select
                value={form.categoryId}
                onChange={e => update('categoryId', e.target.value)}
                className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              >
                {PANTRY_CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">Posizione</label>
              <div className="flex gap-2">
                {PANTRY_POSITIONS.map(pos => (
                  <button
                    key={pos.id}
                    type="button"
                    onClick={() => update('position', pos.id as PantryItem['position'])}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium border transition-all duration-200',
                      form.position === pos.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-foreground border-border hover:border-primary/40'
                    )}
                  >
                    <span>{pos.icon}</span>
                    <span>{pos.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Acquistato il</label>
                <input
                  type="date"
                  value={form.purchased}
                  onChange={e => update('purchased', e.target.value)}
                  className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Scadenza</label>
                <input
                  type="date"
                  value={form.expires}
                  onChange={e => update('expires', e.target.value)}
                  className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                />
              </div>
            </div>

            {/* Min threshold */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Soglia minima <span className="text-muted-foreground font-normal">(0 = nessuna)</span>
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.min}
                onChange={e => update('min', parseInt(e.target.value) || 0)}
                className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Note</label>
              <textarea
                rows={2}
                placeholder="es. Bio, marca preferita…"
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                className="w-full rounded-xl border border-border bg-background text-foreground px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none"
              />
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-border/60 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => handleOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="submit"
            form="add-pantry-form"
            className="flex-1"
            disabled={isSubmitting || !form.name.trim()}
          >
            {isSubmitting ? 'Salvataggio…' : editItem ? 'Aggiorna' : 'Aggiungi'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
