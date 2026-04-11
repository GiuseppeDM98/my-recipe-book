import 'server-only';

import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

interface FirebaseAdminCredentialShape {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let adminApp: App | null = null;

function decodeBase64Credential(encoded: string): FirebaseAdminCredentialShape {
  const json = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(json) as FirebaseAdminCredentialShape;
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

function getFirebaseAdminCredential(): FirebaseAdminCredentialShape {
  const encodedCredentials = process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64;

  if (encodedCredentials) {
    const decoded = decodeBase64Credential(encodedCredentials);
    return {
      projectId: decoded.projectId,
      clientEmail: decoded.clientEmail,
      privateKey: normalizePrivateKey(decoded.privateKey),
    };
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are not configured. Set FIREBASE_ADMIN_CREDENTIALS_BASE64 or FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY.'
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  };
}

export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  if (getApps().length > 0) {
    adminApp = getApps()[0]!;
    return adminApp;
  }

  const credential = getFirebaseAdminCredential();
  adminApp = initializeApp({
    credential: cert(credential),
  });

  return adminApp;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  return getAuth(app).verifyIdToken(idToken);
}
