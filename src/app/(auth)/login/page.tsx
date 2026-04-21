'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { appConfig } from '@/lib/utils/config';

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
    <div className="flex flex-col items-center justify-center min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            Accedi al tuo ricettario
          </h2>
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
          <div className="mt-6 p-4 bg-secondary border border-border rounded-lg">
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Account di Test
            </h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><span className="font-medium">Email:</span> test@test.com</p>
              <p><span className="font-medium">Password:</span> admin1</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Nota: L&apos;account di test ha l&apos;estrazione AI disabilitata
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
