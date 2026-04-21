'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Book, Flame, PlusCircle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface BottomNavigationProps {
  onMoreClick: () => void;
}

export function BottomNavigation({ onMoreClick }: BottomNavigationProps) {
  const pathname = usePathname();

  const tabs = [
    { label: 'Ricette', icon: Book, href: '/ricette' },
    { label: 'Cotture', icon: Flame, href: '/cotture-in-corso' },
    { label: 'Nuova', icon: PlusCircle, href: '/ricette/new' },
    { label: 'Altro', icon: MoreHorizontal, onClick: onMoreClick },
  ];

  return (
    <nav
      aria-label="Navigazione principale"
      className={cn(
        // Only visible on mobile portrait
        'lg:hidden max-lg:landscape:hidden',
        'max-lg:portrait:flex max-lg:portrait:fixed',
        'max-lg:portrait:bottom-0 max-lg:portrait:left-0 max-lg:portrait:right-0',
        'max-lg:portrait:z-50 max-lg:portrait:border-t',
        'max-lg:portrait:bg-background max-lg:portrait:shadow-lg',
        // Safe area inset per iPhone con home indicator
        'max-lg:portrait:pb-safe'
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.href && pathname === tab.href;

        const className = cn(
          'flex flex-1 flex-col items-center justify-center gap-1 px-3 py-2',
          'text-xs font-medium transition-colors',
          isActive ? 'text-primary' : 'text-muted-foreground'
        );

        if (tab.href) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={className}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </Link>
          );
        }

        return (
          <button key={tab.label} onClick={tab.onClick} className={className}>
            <Icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
