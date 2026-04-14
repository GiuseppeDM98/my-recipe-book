import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseIdToken } from '@/lib/firebase/admin';

function getBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get('authorization');

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

/**
 * Verifies the Firebase ID token attached to the request.
 *
 * Returns the authenticated uid on success, otherwise a standard 401 response
 * that routes can forward directly to the client.
 */
export async function requireAuthenticatedUser(
  request: NextRequest
): Promise<{ uid: string; response: null } | { uid: null; response: NextResponse }> {
  const token = getBearerToken(request);

  if (!token) {
    return {
      uid: null,
      response: NextResponse.json(
        { error: 'Autenticazione richiesta' },
        { status: 401 }
      ),
    };
  }

  try {
    const decodedToken = await verifyFirebaseIdToken(token);
    return { uid: decodedToken.uid, response: null };
  } catch (error) {
    console.error('Firebase token verification failed', {
      details: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      uid: null,
      response: NextResponse.json(
        { error: 'Token di autenticazione non valido' },
        { status: 401 }
      ),
    };
  }
}
