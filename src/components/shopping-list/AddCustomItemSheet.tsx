'use client';

import { useState } from 'react';
import { PlusCircle } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface AddCustomItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (name: string, quantity: string, section?: string) => void;
}

export function AddCustomItemSheet({ open, onOpenChange, onAdd }: AddCustomItemSheetProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [section, setSection] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    onAdd(name, quantity, section || undefined);
    setName('');
    setQuantity('');
    setSection('');
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-lg:portrait:rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Aggiungi articolo</SheetTitle>
          <SheetDescription>
            Aggiungi manualmente un articolo alla lista della spesa.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="custom-item-name">
              Articolo <span className="text-red-500">*</span>
            </label>
            <input
              id="custom-item-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="es. Parmigiano Reggiano"
              autoFocus
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="custom-item-qty">
              Quantità
            </label>
            <input
              id="custom-item-qty"
              type="text"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              placeholder="es. 200 g"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="custom-item-section">
              Sezione (opzionale)
            </label>
            <input
              id="custom-item-section"
              type="text"
              value={section}
              onChange={e => setSection(e.target.value)}
              placeholder="es. Latticini"
              className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <SheetFooter className="flex-row gap-2 pt-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                Annulla
              </Button>
            </SheetClose>
            <Button type="submit" className="flex-1" disabled={!name.trim()}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Aggiungi
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
