/**
 * Guided-testing helper: READ-ONLY dump of ONE account from PRODUCTION Firestore.
 *
 * Step 1 of "Mirroring the real account" (WORKFLOW.md). Step 2 is e2e/mirror-load.mjs,
 * a separate process: the Admin SDK routes to the emulator for the whole process as soon
 * as FIRESTORE_EMULATOR_HOST is set, so one script cannot read production and write the
 * emulator.
 *
 * SAFETY CONTRACT — keep it true, a permanent permission rule allows this exact command:
 * - only `get()` and queries against production: no set/update/delete, no Auth or
 *   Storage writes. A mistake here would hit the user's real data, not a fixture;
 * - refuses to run when the emulator env is set (it would silently dump the emulator);
 * - the account is never written in this file (the repo is public): it comes from
 *   MIRROR_SOURCE_EMAIL in .env.local. Only document COUNTS are printed;
 * - the output lands in e2e/scratch/mirror/ (gitignored) and is deleted at teardown.
 *
 * Run from the repo root:  node e2e/mirror-dump.mjs
 */
import fs from 'node:fs';
import nextEnv from '@next/env';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Same loader Next uses, so .env.local is read without exporting it by hand.
nextEnv.loadEnvConfig(process.cwd());

if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Emulator env is set: this process would read the emulator, not production.');
}

const email = process.env.MIRROR_SOURCE_EMAIL;
if (!email) {
  throw new Error('MIRROR_SOURCE_EMAIL is missing in .env.local');
}

// The service-account JSON uses snake_case keys (see AGENTS.md "Firebase Admin base64").
const credentials = process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64
  ? JSON.parse(Buffer.from(process.env.FIREBASE_ADMIN_CREDENTIALS_BASE64, 'base64').toString('utf8'))
  : {
      project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
      client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      private_key: (process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    };
initializeApp({ credential: cert(credentials) });

// WARNING: keep aligned with the collections in firebase/firestore.rules.
const USER_OWNED_COLLECTIONS = [
  'recipes',
  'categories',
  'techniques',
  'cooking_sessions',
  'cooking_history',
  'meal_plans',
  'pantry_items',
];

const OUTPUT_DIR = 'e2e/scratch/mirror';

/**
 * Serializes Timestamps reversibly. JSON.stringify alone flattens them into plain
 * objects, and sorting by createdAt/completedAt breaks once they are loaded back.
 */
function encode(value) {
  if (value instanceof Timestamp) return { __ts: [value.seconds, value.nanoseconds] };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, encode(inner)]));
  }
  return value;
}

const db = getFirestore();
const { uid } = await getAuth().getUserByEmail(email);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const userSnap = await db.doc(`users/${uid}`).get();
fs.writeFileSync(
  `${OUTPUT_DIR}/user.json`,
  JSON.stringify({ uid, data: encode(userSnap.data() ?? null) })
);

const counts = {};
for (const name of USER_OWNED_COLLECTIONS) {
  const snap = await db.collection(name).where('userId', '==', uid).get();
  counts[name] = snap.size;
  fs.writeFileSync(
    `${OUTPUT_DIR}/${name}.json`,
    JSON.stringify(snap.docs.map(doc => ({ id: doc.id, data: encode(doc.data()) })))
  );
}

console.log(`Mirror dumped to ${OUTPUT_DIR}/ — document counts:`, JSON.stringify(counts));
