'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GoogleIcon } from '@/components/ui/google-icon';
import { StatusBanner } from '@/components/ui/status-banner';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * AuthForm - Unified login/register form
 *
 * PURPOSE: Single component handles both auth flows
 *
 * MODES:
 * - 'login': Email + Password
 * - 'register': Email + Password + Display Name
 *
 * FEATURES:
 * - Optional Google sign-in button (showGoogleButton prop)
 * - Error display for Firebase auth errors
 * - Loading states during async operations
 */

interface AuthFormProps {
  mode: 'login' | 'register';
  showGoogleButton?: boolean;
}

export function AuthForm({ mode, showGoogleButton = true }: AuthFormProps) {
  const router = useRouter();
  const { signIn, signUp, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        await signUp(email, password, displayName);
      } else {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Si è verificato un errore');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Si è verificato un errore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-[0_24px_65px_-40px_oklch(var(--foreground)/0.38)] backdrop-blur-sm sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Display name field only shown in register mode */}
        {/* WHY: Login doesn't need display name (already set during registration) */}
        {mode === 'register' && (
          <Input
            type="text"
            placeholder="Nome completo"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        )}

        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && (
          <StatusBanner
            icon={<AlertCircle className="h-4 w-4" />}
            title="Accesso non riuscito"
            description={error}
            tone="danger"
            className="px-3 py-3"
          />
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-[spin_1.5s_linear_infinite]" />
              Un momento...
            </>
          ) : mode === 'register' ? 'Registrati' : 'Accedi'}
        </Button>
      </form>

      {showGoogleButton && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-input" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-background px-2 text-muted-foreground">oppure</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <GoogleIcon />
            {loading ? 'Connessione in corso...' : 'Continua con Google'}
          </Button>
        </>
      )}
    </div>
  );
}
