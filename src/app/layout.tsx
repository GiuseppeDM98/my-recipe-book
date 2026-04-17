'use client';

import './globals.css';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from '@/lib/context/auth-context';
import { Toaster } from '@/components/ui/toaster';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // useState ensures a single QueryClient instance per browser tab
  // (avoids sharing cache across SSR requests on the server).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 2 minutes: Firestore data changes infrequently between navigations.
            // Keeps navigating between pages instant without re-fetching on every visit.
            staleTime: 2 * 60 * 1000,
            // Disable automatic retry — Firestore errors are usually auth/permission
            // issues that won't resolve on their own without user action.
            retry: false,
          },
        },
      })
  );

  return (
    <html lang="it">
      <head>
        <title>Il Mio Ricettario - Gestisci le tue ricette</title>
        <meta name="description" content="Un ricettario digitale privato per organizzare e cucinare le tue ricette preferite con intelligenza artificiale." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
          {/* DevTools: only bundled in development, tree-shaken in production builds */}
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </body>
    </html>
  );
}