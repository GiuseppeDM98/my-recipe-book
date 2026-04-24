'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster as HotToaster } from 'react-hot-toast';
import { AuthProvider } from '@/lib/context/auth-context';
import { Toaster as RadixToaster } from '@/components/ui/toaster';

const ReactQueryDevtools = dynamic(
  () => import('@tanstack/react-query-devtools').then((mod) => mod.ReactQueryDevtools),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  // useState garantisce una sola istanza di QueryClient per tab browser
  // (evita condivisione di cache tra richieste SSR sul server).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 2 minuti: i dati Firestore cambiano raramente tra navigazioni.
            staleTime: 2 * 60 * 1000,
            // Disabilitato: gli errori Firestore sono tipicamente auth/permission
            // e non si risolvono da soli senza azione utente.
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {children}
        <RadixToaster />
        <HotToaster
          position="top-center"
          toastOptions={{
            duration: 3600,
            style: {
              background: 'oklch(var(--card))',
              color: 'oklch(var(--foreground))',
              border: '1px solid oklch(var(--border))',
              borderRadius: '18px',
              boxShadow: '0 20px 45px -32px oklch(var(--foreground) / 0.32)',
              padding: '14px 16px',
            },
            success: {
              iconTheme: {
                primary: 'oklch(var(--accent))',
                secondary: 'oklch(var(--card))',
              },
            },
            error: {
              iconTheme: {
                primary: 'oklch(var(--destructive))',
                secondary: 'oklch(var(--card))',
              },
            },
          }}
        />
      </AuthProvider>
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
