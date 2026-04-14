import { auth } from '@/lib/firebase/config';

interface FirebaseAuthHeaderOptions {
  forceRefresh?: boolean;
}

/**
 * Returns the current Firebase ID token formatted for Authorization headers.
 *
 * WHY A SHARED HELPER:
 * Every AI route now requires the same bearer token. Centralizing token lookup
 * keeps fetch call sites small and guarantees consistent error behavior when
 * the user is no longer authenticated client-side.
 */
export async function getFirebaseAuthHeader(
  options: FirebaseAuthHeaderOptions = {}
): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Autenticazione richiesta');
  }

  // AI routes are verified server-side through Firebase Admin. After the
  // security hardening, forcing a refresh for those requests avoids sending
  // a cached token that the server now rejects as stale.
  const idToken = await currentUser.getIdToken(options.forceRefresh ?? false);

  if (!idToken) {
    throw new Error('Token di autenticazione non disponibile');
  }

  return {
    Authorization: `Bearer ${idToken}`,
  };
}
