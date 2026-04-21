'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider } from '@/lib/context/auth-context';
import { Toaster } from '@/components/ui/toaster';

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
        <Toaster />
      </AuthProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
