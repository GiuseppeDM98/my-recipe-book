/**
 * Guided-testing helper: loads the dump made by e2e/mirror-dump.mjs into the EMULATORS.
 *
 * Step 2 of "Mirroring the real account" (WORKFLOW.md). The user is recreated with THE
 * SAME uid, so ownership rules and `userId` filters match without rewriting any document,
 * and documents keep their ids. The real password is never copied: the emulator user gets
 * a throwaway local one, same email (the guided tour logs in with email/password even if
 * production sign-in is via Google).
 *
 * SAFETY: this script WRITES, so it refuses to run unless both emulator hosts are set —
 * without them the Admin SDK would be talking to production.
 *
 * Run from the repo root, with `npm run emulators` up:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node e2e/mirror-load.mjs
 */
import fs from 'node:fs';
import nextEnv from '@next/env';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to run without both emulator hosts: this script writes data.');
}

// Only for MIRROR_SOURCE_EMAIL and the project id; shell env (the emulator hosts) wins.
nextEnv.loadEnvConfig(process.cwd());

const email = process.env.MIRROR_SOURCE_EMAIL;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!email || !projectId) {
  throw new Error('MIRROR_SOURCE_EMAIL or NEXT_PUBLIC_FIREBASE_PROJECT_ID missing in .env.local');
}

/** Local-only password of the mirrored user; printed at the end for the guided tour. */
const LOCAL_PASSWORD = 'specchio-locale-123';
const INPUT_DIR = 'e2e/scratch/mirror';

/** Inverse of encode() in mirror-dump.mjs: rebuilds Firestore Timestamps. */
function decode(value) {
  if (value && typeof value === 'object' && Array.isArray(value.__ts)) {
    return new Timestamp(value.__ts[0], value.__ts[1]);
  }
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, decode(inner)]));
  }
  return value;
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

const { uid, data: userData } = JSON.parse(fs.readFileSync(`${INPUT_DIR}/user.json`, 'utf8'));

// Idempotent: a rerun replaces the emulator user instead of failing on the duplicate uid.
await auth.deleteUser(uid).catch(() => {});
await auth.createUser({ uid, email, password: LOCAL_PASSWORD, emailVerified: true });

if (userData) {
  await db.doc(`users/${uid}`).set(decode(userData));
}

const counts = {};
for (const file of fs.readdirSync(INPUT_DIR)) {
  if (!file.endsWith('.json') || file === 'user.json') continue;

  const collectionName = file.replace(/\.json$/, '');
  const docs = JSON.parse(fs.readFileSync(`${INPUT_DIR}/${file}`, 'utf8'));
  for (const { id, data } of docs) {
    await db.doc(`${collectionName}/${id}`).set(decode(data));
  }
  counts[collectionName] = docs.length;
}

console.log('Mirror loaded into the emulators — document counts:', JSON.stringify(counts));
console.log(`Log in with MIRROR_SOURCE_EMAIL and the local password: ${LOCAL_PASSWORD}`);
