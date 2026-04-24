'use client';

import Link from 'next/link';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Grid3x3, Sparkles, CalendarDays, BarChart3, Users, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface MoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MoreSheet({ open, onOpenChange }: MoreSheetProps) {
  const menuItems = [
    { label: 'Categorie', icon: Grid3x3, href: '/categorie' },
    { label: 'Assistente AI', icon: Sparkles, href: '/assistente-ai' },
    { label: 'Pianificatore', icon: CalendarDays, href: '/pianificatore' },
    { label: 'Lista della spesa', icon: ShoppingCart, href: '/lista-spesa' },
    { label: 'Profilo famiglia', icon: Users, href: '/profilo-famiglia' },
    { label: 'Statistiche', icon: BarChart3, href: '/statistiche' },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className={cn(
          'max-lg:portrait:rounded-t-[1.75rem] border-border/70 bg-[linear-gradient(180deg,_oklch(var(--background))_0%,_oklch(96%_0.012_74)_100%)]',
          'lg:hidden max-lg:landscape:hidden'
        )}
      >
        <SheetHeader>
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90" />
          <SheetTitle className="font-display text-3xl font-semibold italic">Altro</SheetTitle>
          <SheetDescription className="sr-only">
            Menu aggiuntivo con altre opzioni dell'app
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  'group flex items-center gap-3 rounded-[1.1rem] px-4 py-3.5',
                  'shell-panel text-sm font-medium transition-all duration-200 motion-reduce:transition-none hover:-translate-y-0.5'
                )}
              >
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-primary/14 bg-primary/8 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
