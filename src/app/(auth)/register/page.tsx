'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { appConfig } from '@/lib/utils/config';
import { BookHeart } from 'lucide-react';

export default function RegisterPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/ricette');
    }
  }, [user, router]);

  // Show disabled message if registrations are disabled
  if (!appConfig.registrationsEnabled) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_oklch(var(--primary)/0.08),_transparent_35%),linear-gradient(180deg,_oklch(var(--background))_0%,_oklch(95%_0.015_75)_100%)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-4">
            <h2 className="font-display text-4xl font-semibold italic text-foreground">
              Registrazioni disabilitate
            </h2>
            <p className="text-muted-foreground">
              Le registrazioni sono attualmente disabilitate.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 font-medium text-primary hover:text-primary/80"
            >
              Torna al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_oklch(var(--accent)/0.08),_transparent_35%),linear-gradient(180deg,_oklch(var(--background))_0%,_oklch(95%_0.015_75)_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <span className="mx-auto flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-background/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground shadow-sm">
            <BookHeart className="h-4 w-4 text-accent" />
            Nuova raccolta
          </span>
          <h2 className="mt-6 font-display text-4xl font-semibold italic text-foreground">
            Crea il tuo ricettario
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Imposta uno spazio personale per ricette, cotture e pianificazione settimanale.
          </p>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Hai già un account?{' '}
            <Link href="/login" className="font-medium text-primary hover:text-primary/80">
              Accedi
            </Link>
          </p>
        </div>
        <AuthForm mode="register" showGoogleButton={appConfig.registrationsEnabled} />
      </div>
    </div>
  );
}
