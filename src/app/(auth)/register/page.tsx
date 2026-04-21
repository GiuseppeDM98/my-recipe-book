'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/auth-form';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks/useAuth';
import { appConfig } from '@/lib/utils/config';

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-extrabold text-foreground">
              Registrazioni disabilitate
            </h2>
            <p className="text-muted-foreground">
              Le registrazioni sono attualmente disabilitate.
            </p>
            <Link
              href="/login"
              className="inline-block mt-6 font-medium text-primary-600 hover:text-primary-500"
            >
              Torna al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            Crea il tuo ricettario
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Hai già un account?{' '}
            <Link href="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Accedi
            </Link>
          </p>
        </div>
        <AuthForm mode="register" showGoogleButton={appConfig.registrationsEnabled} />
      </div>
    </div>
  );
}