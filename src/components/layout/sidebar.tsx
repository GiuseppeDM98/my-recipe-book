'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Book, Grid3x3, Flame, PlusCircle, Sparkles } from 'lucide-react';

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
 *
 * COMPONENT TREE:
 * - Desktop: Sidebar (static) + Content
 * - Mobile Portrait: BottomNavigation (tabs) + Content
 * - Mobile Landscape: Hamburger → Sidebar (drawer) + Backdrop
 */

const navItems = [
  { href: '/ricette', label: 'Le mie ricette', icon: Book },
  { href: '/categorie', label: 'Categorie', icon: Grid3x3 },
  { href: '/cotture-in-corso', label: 'Cotture in corso', icon: Flame },
  { href: '/ricette/new', label: 'Nuova ricetta', icon: PlusCircle },
  { href: '/assistente-ai', label: '✨ Assistente AI', icon: Sparkles },
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
            'max-lg:landscape:z-40 max-lg:landscape:bg-black/50'
          )}
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        // ========================================
        // Desktop (≥1440px): Always visible sidebar
        // ========================================
        // - Static positioning (part of layout flow)
        // - Fixed width (64 = 256px)
        'lg:w-64 lg:flex-shrink-0 lg:block lg:relative',
        'lg:border-r lg:bg-white',

        // ========================================
        // Mobile portrait (<1440px, portrait): Completely hidden
        // ========================================
        // - Hidden via display:none (takes no space)
        // - Bottom navigation shown instead (separate component)
        'max-lg:portrait:hidden',

        // ========================================
        // Mobile landscape (<1440px, landscape): Sliding drawer
        // ========================================
        // - Fixed positioning (overlay)
        // - Full height, slide from left
        // - Transform controls visibility (off-screen vs on-screen)
        'max-lg:landscape:fixed max-lg:landscape:inset-y-0 max-lg:landscape:left-0',
        'max-lg:landscape:z-50 max-lg:landscape:w-64',
        'max-lg:landscape:bg-white max-lg:landscape:border-r max-lg:landscape:shadow-lg',
        'max-lg:landscape:transition-transform max-lg:landscape:duration-300',

        // Sliding animation (landscape only)
        isOpen
          ? 'max-lg:landscape:translate-x-0'      // Visible: on screen
          : 'max-lg:landscape:-translate-x-full'  // Hidden: off screen (left)
      )}>
        <nav className="flex flex-col gap-2 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} passHref>
                <Button
                  variant={pathname === item.href ? 'secondary' : 'ghost'}
                  className={cn(
                    'w-full justify-start gap-2',
                    pathname === item.href && 'bg-primary-100 text-primary-700'
                  )}
                  onClick={onClose}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
