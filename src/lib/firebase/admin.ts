import 'server-only';

import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

interface FirebaseAdminCredentialShape {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface FirebaseAdminServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
}

let adminApp: App | null = null;
const FIREBASE_ADMIN_APP_NAME = 'my-recipe-book-admin';

function decodeBase64Credential(encoded: string): FirebaseAdminCredentialShape {
  const json = Buffer.from(encoded, 'base64').toString('utf-8');
  const decoded = JSON.parse(json) as FirebaseAdminServiceAccountJson;

  return {
    projectId: decoded.projectId ?? decoded.project_id ?? '',
    clientEmail: decoded.clientEmail ?? decoded.client_email ?? '',
    privateKey: decoded.privateKey ?? decoded.private_key ?? '',
  };
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

function getFirebaseAdminCredential(): FirebaseAdminCredentialShape {
  const encodedCredentials = process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64;

  if (encodedCredentials) {
    const decoded = decodeBase64Credential(encodedCredentials);

    if (!decoded.projectId || !decoded.clientEmail || !decoded.privateKey) {
      throw new Error(
        'FIREBASE_ADMIN_CREDENTIALS_BASE64 is missing one of: project_id, client_email, private_key.'
      );
    }

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

  if (getApps().some((app) => app.name === FIREBASE_ADMIN_APP_NAME)) {
    adminApp = getApp(FIREBASE_ADMIN_APP_NAME);
    return adminApp;
  }

  const credential = getFirebaseAdminCredential();
  adminApp = initializeApp({
    credential: cert(credential),
    projectId: credential.projectId,
  }, FIREBASE_ADMIN_APP_NAME);

  return adminApp;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedIdToken> {
  const app = getFirebaseAdminApp();
  return getAuth(app).verifyIdToken(idToken);
}
