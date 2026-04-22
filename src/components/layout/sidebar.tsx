'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Book, Grid3x3, Flame, PlusCircle, Sparkles, CalendarDays, BarChart3, Users, ShoppingCart } from 'lucide-react';

/**
 * Sidebar - Orientation-based responsive navigation
 *
 * CRITICAL BREAKPOINT: 1440px (lg), not 1024px
 * SEE: AGENTS.md for gotchas, CLAUDE.md for navigation strategy
 *
 * RENDERING MODES:
 * - Desktop (≥1440px): Always visible, static
 * - Mobile Portrait (<1440px, portrait): Hidden (bottom nav shown instead)
 * - Mobile Landscape (<1440px, landscape): Sliding drawer + backdrop
 *
 * WHY max-lg:portrait NOT portrait:
 * - Prevents accidental activation on large portrait monitors
 * - Ensures desktop always shows sidebar
 */

const navGroups = [
  {
    label: null,
    items: [
      { href: '/ricette', label: 'Le mie ricette', icon: Book },
      { href: '/categorie', label: 'Categorie', icon: Grid3x3 },
      { href: '/cotture-in-corso', label: 'Cotture in corso', icon: Flame },
      { href: '/ricette/new', label: 'Nuova ricetta', icon: PlusCircle },
    ],
  },
  {
    label: 'Strumenti AI',
    items: [
      { href: '/assistente-ai', label: 'Assistente AI', icon: Sparkles },
      { href: '/pianificatore', label: 'Pianificatore', icon: CalendarDays },
      { href: '/lista-spesa', label: 'Lista della spesa', icon: ShoppingCart },
    ],
  },
  {
    label: null,
    items: [
      { href: '/profilo-famiglia', label: 'Profilo famiglia', icon: Users },
      { href: '/statistiche', label: 'Statistiche', icon: BarChart3 },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Backdrop - mobile landscape only */}
      {isOpen && (
        <div
          className={cn(
            'lg:hidden max-lg:portrait:hidden',
            'max-lg:landscape:fixed max-lg:landscape:inset-0',
            'max-lg:landscape:z-40 max-lg:landscape:bg-foreground/60'
          )}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        // ========================================
        // Desktop (≥1440px): Always visible sidebar
        // ========================================
        'lg:w-64 lg:flex-shrink-0 lg:block lg:relative',
        'lg:border-r lg:bg-background',

        // ========================================
        // Mobile portrait (<1440px, portrait): Completely hidden
        // ========================================
        'max-lg:portrait:hidden',

        // ========================================
        // Mobile landscape (<1440px, landscape): Sliding drawer
        // ========================================
        'max-lg:landscape:fixed max-lg:landscape:inset-y-0 max-lg:landscape:left-0',
        'max-lg:landscape:z-50 max-lg:landscape:w-64',
        'max-lg:landscape:bg-background max-lg:landscape:border-r max-lg:landscape:shadow-lg',
        'max-lg:landscape:transition-transform max-lg:landscape:duration-300',

        isOpen
          ? 'max-lg:landscape:translate-x-0'
          : 'max-lg:landscape:-translate-x-full'
      )}>
        <nav className="flex flex-col gap-0 py-4 px-3" aria-label="Navigazione principale">
          {navGroups.map((group, groupIndex) => (
            <div key={groupIndex}>
              {/* Optional section label */}
              {group.label && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-accent">
                  {group.label}
                </p>
              )}

              {/* Divider between groups (except before first) */}
              {groupIndex > 0 && !group.label && (
                <div className="my-2 mx-3 border-t border-border/60" />
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-foreground/70 hover:text-foreground hover:bg-muted/60'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 flex-shrink-0', isActive ? 'text-primary' : 'text-foreground/50')} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
