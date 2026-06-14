'use client';

import { Package, ShoppingCart, TrendingDown, AlertTriangle } from 'lucide-react';
import { PantryItem } from '@/types/pantry';
import { expiryStatus, stockLevel } from '@/lib/utils/pantry-utils';
import Link from 'next/link';

interface PantryDesktopSidebarProps {
  items: PantryItem[];
}

export function PantryDesktopSidebar({ items }: PantryDesktopSidebarProps) {
  const expiringCount = items.filter(item => {
    const { status } = expiryStatus(item.expires);
    return status === 'scaduto' || status === 'oggi' || status === 'urgente' || status === 'presto';
  }).length;

  const lowStockCount = items.filter(item => {
    const { level } = stockLevel(item);
    return level === 'basso';
  }).length;

  return (
    <aside className="hidden lg:flex flex-col gap-4 w-[320px] flex-shrink-0 sticky top-0 self-start">
      {/* In sintesi */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          In sintesi
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-2xl font-semibold text-foreground">{items.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Prodotti totali</p>
          </div>
          <div className={`rounded-xl p-3 ${expiringCount > 0 ? 'bg-destructive/8' : 'bg-muted'}`}>
            <p className={`text-2xl font-semibold ${expiringCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
              {expiringCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">In scadenza</p>
          </div>
          <div className={`rounded-xl p-3 ${lowStockCount > 0 ? '' : 'bg-muted'}`}
            style={lowStockCount > 0 ? { background: 'oklch(68% 0.15 75 / 0.08)' } : undefined}
          >
            <p className="text-2xl font-semibold text-foreground">{lowStockCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Scorte basse</p>
          </div>
          <div className="rounded-xl bg-muted p-3">
            <p className="text-2xl font-semibold text-muted-foreground">–</p>
            <p className="text-xs text-muted-foreground mt-0.5">Valore stimato</p>
          </div>
        </div>
      </div>

      {/* Dalla lista spesa */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Dalla lista spesa
          </h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Segna gli acquisti come completati nella lista della spesa per aggiungerli direttamente qui.
        </p>
        <Link
          href="/lista-spesa"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          Vai alla lista spesa →
        </Link>
      </div>

      {/* Lista spesa auto */}
      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-primary">
            Lista spesa auto
          </h3>
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">
          Quando una scorta scende sotto la soglia minima, ti suggeriremo di aggiungerla automaticamente alla prossima lista.
        </p>
        <span className="mt-3 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
          In arrivo
        </span>
      </div>
    </aside>
  );
}
