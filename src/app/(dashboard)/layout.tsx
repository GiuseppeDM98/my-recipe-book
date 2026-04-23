'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { Header } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNavigation } from '@/components/layout/bottom-navigation';
import { MoreSheet } from '@/components/layout/more-sheet';
import { Footer } from '@/components/layout/footer';
import { cn } from '@/lib/utils/cn';

/**
 * Dashboard Layout - Responsive Navigation with Orientation Detection
 *
 * Three navigation modes based on viewport:
 * 1. Desktop (≥1440px): Persistent sidebar always visible
 * 2. Portrait (mobile vertical): Bottom navigation for thumb reach
 * 3. Landscape (mobile horizontal): Hamburger menu for grip comfort
 *
 * Why orientation-based: Touch-optimized UIs differ between portrait (thumbs)
 * and landscape (grip). This provides optimal UX for each orientation.
 *
 * Breakpoint: 1440px chosen because below this, sidebar takes too much
 * horizontal space. Aligns with common laptop screen widths.
 *
 * See AGENTS.md for navigation breakpoint gotchas (max-lg:portrait: pattern).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Reset sidebar/sheet states when viewport changes to prevent:
  // - Stuck-open sidebar when rotating to portrait
  // - Stuck-open sheet when rotating to landscape
  // Each navigation mode is exclusive to its viewport range.
  useEffect(() => {
    const handleResize = () => {
      // Close sidebar on desktop (≥1440px) or portrait mode.
      // Tailwind orientation variants detect device physical orientation:
      // - portrait: device held vertically (bottom nav for thumb reach)
      // - landscape: device held horizontally (hamburger menu for grip)
      // Desktop (≥1440px) always shows sidebar regardless of orientation.
      if (window.innerWidth >= 1440 || window.matchMedia('(orientation: portrait)').matches) {
        setSidebarOpen(false);
      }
      if (window.innerWidth >= 1440 || window.matchMedia('(orientation: landscape)').matches) {
        setMoreSheetOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let frameId = 0;

    const updateShell = () => {
      frameId = 0;

      if (!shellRef.current) return;

      const scrollableHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / scrollableHeight, 1);

      shellRef.current.style.setProperty('--shell-focus', progress.toFixed(3));
      shellRef.current.style.setProperty('--shell-wash', (0.38 + progress * 0.18).toFixed(3));
    };

    const scheduleUpdate = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(updateShell);
    };

    updateShell();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return (
    <ProtectedRoute>
      <div
        ref={shellRef}
        className="min-h-screen bg-transparent px-0 pb-0 pt-0 lg:px-4 lg:pb-4 lg:pt-4"
      >
        <div className="shell-stage flex min-h-screen flex-col rounded-none lg:min-h-[calc(100vh-2rem)] lg:rounded-[2rem]">
          <Header
            sidebarOpen={sidebarOpen}
            onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
          />

          <div className="flex flex-1">
            <Sidebar
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />

            <main className={cn(
              'cinematic-scrollbar relative flex-1 min-w-0 overflow-hidden',
              'lg:px-10 lg:py-8',
              'max-lg:portrait:p-4 max-lg:portrait:pb-20',
              'max-lg:landscape:p-4'
            )}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,_oklch(var(--background)/0.92),_transparent)]" />
              <div className="relative z-10 animate-fade-up motion-reduce:animate-none">
                {children}
              </div>
            </main>
          </div>

          <BottomNavigation
            onMoreClick={() => setMoreSheetOpen(true)}
          />

          <MoreSheet
            open={moreSheetOpen}
            onOpenChange={setMoreSheetOpen}
          />

          <Footer />
        </div>
      </div>
    </ProtectedRoute>
  );
}
