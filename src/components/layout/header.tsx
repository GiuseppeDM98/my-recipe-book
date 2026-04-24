'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface HeaderProps {
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}

export function Header({ sidebarOpen, onSidebarToggle }: HeaderProps) {
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-4 px-4 py-4 lg:px-6">
        <div className="flex items-center gap-3">
          {/* Hamburger - SOLO mobile landscape */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onSidebarToggle}
            className={cn(
              'lg:hidden',
              'max-lg:portrait:hidden',
              'max-lg:landscape:flex'
            )}
            aria-label="Apri menu"
          >
            <Menu className="h-6 w-6" />
          </Button>

          <Link href="/ricette" aria-label="Torna alle ricette">
            <span className="flex flex-col">
              <span className="editorial-kicker text-[0.65rem] font-semibold uppercase text-muted-foreground">
                Cucina privata
              </span>
              <span className="font-display text-2xl font-semibold italic text-primary">Il Mio Ricettario</span>
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user && (
            <>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Ciao, {user.displayName || user.email}
              </span>
              <Button onClick={signOut} size="sm" className="shadow-[0_14px_30px_-24px_oklch(var(--primary)/0.9)]">
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
