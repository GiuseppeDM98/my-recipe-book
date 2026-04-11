import { auth } from '@/lib/firebase/config';

/**
 * Returns the current Firebase ID token formatted for Authorization headers.
 *
 * WHY A SHARED HELPER:
 * Every AI route now requires the same bearer token. Centralizing token lookup
 * keeps fetch call sites small and guarantees consistent error behavior when
 * the user is no longer authenticated client-side.
 */
export async function getFirebaseAuthHeader(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('Autenticazione richiesta');
  }

  const idToken = await currentUser.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`,
  };
}
