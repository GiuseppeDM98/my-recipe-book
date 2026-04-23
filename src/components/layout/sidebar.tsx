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
            'max-lg:landscape:z-40 max-lg:landscape:bg-foreground/60',
            'animate-fade-in motion-reduce:animate-none'
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
        'lg:border-r lg:bg-transparent',

        // ========================================
        // Mobile portrait (<1440px, portrait): Completely hidden
        // ========================================
        'max-lg:portrait:hidden',

        // ========================================
        // Mobile landscape (<1440px, landscape): Sliding drawer
        // ========================================
        'max-lg:landscape:fixed max-lg:landscape:inset-y-0 max-lg:landscape:left-0',
        'max-lg:landscape:z-50 max-lg:landscape:w-64',
        'max-lg:landscape:border-r max-lg:landscape:border-border/85',
        'max-lg:landscape:bg-[linear-gradient(180deg,_oklch(99%_0.01_76)_0%,_oklch(var(--background))_100%)]',
        'max-lg:landscape:shadow-[0_26px_60px_-34px_oklch(var(--foreground)/0.35)]',
        'max-lg:landscape:transition-transform max-lg:landscape:duration-300',

        isOpen
          ? 'max-lg:landscape:translate-x-0'
          : 'max-lg:landscape:-translate-x-full'
      )}>
        <nav
          className="flex h-full flex-col gap-0 px-3 py-4 lg:border-r lg:border-border/55 lg:bg-[linear-gradient(180deg,_oklch(var(--background)/0.7),_transparent_18%,_oklch(var(--background)/0.42)_100%)] max-lg:landscape:bg-[linear-gradient(180deg,_oklch(99%_0.01_76)_0%,_oklch(var(--background))_100%)]"
          aria-label="Navigazione principale"
        >
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
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                      'transition-all duration-200 ease-out motion-reduce:transition-none',
                      isActive
                        ? 'bg-[linear-gradient(135deg,_oklch(var(--primary)/0.14),_oklch(var(--background)/0.86))] text-primary font-semibold shadow-[0_18px_34px_-28px_oklch(var(--primary)/0.85)]'
                        : 'text-foreground/70 hover:text-foreground hover:bg-background/80 hover:translate-x-0.5'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border',
                        isActive
                          ? 'border-primary/18 bg-primary/10 text-primary'
                          : 'border-border/70 bg-background/70 text-foreground/55 transition-colors group-hover:border-primary/15 group-hover:text-primary/80'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">{item.label}</span>
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
