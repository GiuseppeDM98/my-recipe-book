import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase (singleton pattern)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

// Opt-in only: set NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true (e.g. via .env.local.emulator)
// to point the client SDK at `firebase emulators:start` instead of production Firebase.
// Guarded by a global flag so hot-reload/multiple imports don't reconnect twice.
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  const globalWithEmulatorFlag = globalThis as typeof globalThis & {
    __firebaseEmulatorsConnected?: boolean;
  };

  if (!globalWithEmulatorFlag.__firebaseEmulatorsConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    globalWithEmulatorFlag.__firebaseEmulatorsConnected = true;
  }
}

export default app;