'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, stockLevel } from '@/lib/utils/pantry-utils';

interface PantryHeroProps {
  items: PantryItem[];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function getDynamicMessage(items: PantryItem[]): string {
  const expiringCount = items.filter(item => {
    const { status } = expiryStatus(item.expires);
    return status === 'scaduto' || status === 'oggi' || status === 'urgente';
  }).length;

  const lowStockCount = items.filter(item => {
    const { level } = stockLevel(item);
    return level === 'basso';
  }).length;

  if (items.length === 0) {
    return 'Inizia aggiungendo i prodotti della tua cucina.';
  }

  if (expiringCount > 0 && lowStockCount > 0) {
    return `Hai ${expiringCount} ${expiringCount === 1 ? 'prodotto in scadenza' : 'prodotti in scadenza'} e ${lowStockCount} con scorte basse da reintegrare.`;
  }

  if (expiringCount > 0) {
    return expiringCount === 1
      ? 'Hai un prodotto che scade presto. Usalo prima che sia troppo tardi.'
      : `Hai ${expiringCount} prodotti in scadenza. Pianifica i pasti di conseguenza.`;
  }

  if (lowStockCount > 0) {
    return lowStockCount === 1
      ? 'Una scorta si sta esaurendo. Ricordati di rifornire.'
      : `${lowStockCount} scorte si stanno esaurendo. Aggiorna la lista della spesa.`;
  }

  return 'La tua dispensa è in ordine. Buona cucina!';
}

export function PantryHero({ items }: PantryHeroProps) {
  const { user } = useAuth();
  const greeting = getGreeting();
  const firstName = user?.displayName?.split(' ')[0] ?? null;
  const message = getDynamicMessage(items);

  return (
    <div className="py-2">
      <p className="font-display text-2xl font-semibold italic text-foreground">
        {greeting}{firstName ? `, ${firstName}` : ''}.
      </p>
      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
        {message}
      </p>
    </div>
  );
}
