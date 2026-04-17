import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { FamilyProfile, User } from '@/types';
import { normalizeFamilyProfile } from '@/lib/utils/family-context';

export async function getUserProfile(userId: string): Promise<User | null> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  return userSnap.data() as User;
}

export async function saveFamilyProfile(userId: string, familyProfile: FamilyProfile): Promise<void> {
  const normalizedProfile = normalizeFamilyProfile(familyProfile);

  if (!normalizedProfile) {
    throw new Error('Profilo famiglia non valido');
  }

  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    familyProfile: normalizedProfile,
    updatedAt: serverTimestamp(),
  });
}

export async function ensureUserProfileDocument(
  userId: string,
  data: Pick<User, 'uid' | 'displayName' | 'photoURL'> & { email: string | null }
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, {
    ...data,
    familyProfile: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
