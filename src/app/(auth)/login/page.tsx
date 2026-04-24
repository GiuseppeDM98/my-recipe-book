'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { appConfig } from '@/lib/utils/config';
import { StatusBanner } from '@/components/ui/status-banner';
import { BookOpenText, KeyRound } from 'lucide-react';

const showTestCredentials = process.env.NEXT_PUBLIC_SHOW_TEST_CREDENTIALS === 'true';

export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/ricette');
    }
  }, [user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_oklch(var(--primary)/0.08),_transparent_35%),linear-gradient(180deg,_oklch(var(--background))_0%,_oklch(95%_0.015_75)_100%)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-4 text-center">
          <span className="mx-auto flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-background/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground shadow-sm">
            <BookOpenText className="h-4 w-4 text-primary" />
            Cucina privata
          </span>
          <div>
            <h2 className="mt-6 font-display text-4xl font-semibold italic text-foreground">
              Rientra nel tuo ricettario
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Ricette, piani e cotture rimangono dove li hai lasciati, con un accesso rapido e pulito anche in cucina.
            </p>
          </div>
          {appConfig.registrationsEnabled && (
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Non hai un account?{' '}
              <Link href="/register" className="font-medium text-primary hover:text-primary/80">
                Registrati
              </Link>
            </p>
          )}
        </div>
        <AuthForm mode="login" showGoogleButton={appConfig.registrationsEnabled} />

        {/* Credenziali di test — visibili solo se NEXT_PUBLIC_SHOW_TEST_CREDENTIALS=true */}
        {showTestCredentials && (
          <StatusBanner
            icon={<KeyRound className="h-4 w-4" />}
            title="Account di test"
            description={
              <>
                <span className="font-medium text-foreground">Email:</span> test@test.com
                <br />
                <span className="font-medium text-foreground">Password:</span> admin1
                <br />
                L&apos;estrazione AI resta disabilitata su questo account.
              </>
            }
            tone="info"
          />
        )}
      </div>
    </div>
  );
}
