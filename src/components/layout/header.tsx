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
    <header className="flex items-center justify-between p-4 bg-background border-b">
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
          <span className="font-display text-2xl font-semibold italic">Il Mio Ricettario</span>
        </Link>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <>
            <span className="text-sm hidden sm:inline">
              Ciao, {user.displayName || user.email}
            </span>
            <Button onClick={signOut} size="sm">
              Logout
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
