'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Bell } from 'lucide-react';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, formatQty, stockLevel } from '@/lib/utils/pantry-utils';
import { ExpiryBadge } from './ExpiryBadge';
import { FoodInitials } from './FoodInitials';
import { cn } from '@/lib/utils/cn';

interface PantryNotificationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PantryItem[];
}

export function PantryNotificationsSheet({ open, onOpenChange, items }: PantryNotificationsSheetProps) {
  const expiringItems = items.filter(item => {
    const { status } = expiryStatus(item.expires);
    return status === 'scaduto' || status === 'oggi' || status === 'urgente' || status === 'presto';
  }).sort((a, b) => {
    const dA = expiryStatus(a.expires).daysLeft;
    const dB = expiryStatus(b.expires).daysLeft;
    return dA - dB;
  });

  const lowStockItems = items.filter(item => {
    const { level } = stockLevel(item);
    return level === 'basso' || level === 'parziale';
  });

  const total = expiringItems.length + lowStockItems.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showClose={false}
        className={cn(
          'max-h-[85dvh] rounded-t-[1.75rem] border-border/70 flex flex-col overflow-hidden',
          'lg:inset-x-auto lg:right-6 lg:left-auto lg:w-[360px] lg:rounded-2xl lg:bottom-6 lg:top-auto lg:max-h-[80dvh]'
        )}
      >
        <SheetHeader>
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-border/90 lg:hidden" />
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <SheetTitle className="font-display text-2xl font-semibold italic">Avvisi</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            {total === 0 ? 'Nessun avviso attivo.' : `${total} ${total === 1 ? 'avviso' : 'avvisi'} da controllare.`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4 space-y-5">
          {/* Expiring section */}
          {expiringItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-destructive mb-2">
                In scadenza
              </p>
              <div className="space-y-2">
                {expiringItems.map(item => {
                  const info = expiryStatus(item.expires);
                  const isUrgent = info.status === 'scaduto' || info.status === 'oggi' || info.status === 'urgente';
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl p-3',
                        isUrgent ? 'bg-destructive/8 border border-destructive/20' : 'bg-muted'
                      )}
                    >
                      <FoodInitials name={item.name} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatQty(item)}</p>
                      </div>
                      <ExpiryBadge info={info} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Low stock section */}
          {lowStockItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: 'oklch(45% 0.14 75)' }}>
                Scorte basse
              </p>
              <div className="space-y-2">
                {lowStockItems.map(item => {
                  const { level } = stockLevel(item);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{ background: 'oklch(68% 0.15 75 / 0.08)', border: '1px solid oklch(68% 0.15 75 / 0.2)' }}
                    >
                      <FoodInitials name={item.name} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{formatQty(item)}</p>
                      </div>
                      <span
                        className="text-[10px] font-semibold rounded-full px-2 py-0.5"
                        style={
                          level === 'basso'
                            ? { background: 'oklch(68% 0.15 75 / 0.15)', color: 'oklch(45% 0.14 75)' }
                            : { background: 'oklch(68% 0.15 75 / 0.08)', color: 'oklch(45% 0.14 75)' }
                        }
                      >
                        {level === 'basso' ? 'Basso' : 'Parziale'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {total === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Tutto in ordine. Nessun avviso attivo.</p>
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="mt-4 pt-3 border-t border-border/60">
          <p className="text-xs text-muted-foreground text-center">
            Ti avviso 3 giorni prima della scadenza.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
