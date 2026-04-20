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
          'max-lg:portrait:rounded-t-xl',
          'lg:hidden max-lg:landscape:hidden'
        )}
      >
        <SheetHeader>
          <SheetTitle>Altro</SheetTitle>
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
                  'flex items-center gap-3 rounded-lg px-4 py-3',
                  'text-sm font-medium hover:bg-accent transition-colors'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
