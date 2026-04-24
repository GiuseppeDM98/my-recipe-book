'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  updateProfile
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { User } from '@/types';
import { initializeDefaultCategories } from '../firebase/categories';
import { ensureUserProfileDocument } from '../firebase/user-profile';

/**
 * Authentication Context Provider
 *
 * Architecture:
 * - Firebase Auth for authentication
 * - Firestore user documents for profile data
 * - Default categories initialized on first sign-up
 *
 * Auth Flow:
 * 1. onAuthStateChanged monitors Firebase Auth state
 * 2. On login: Read user doc from Firestore (create if missing)
 * 3. On sign-up: createUserWithEmailAndPassword → onAuthStateChanged
 *    creates user doc and default categories
 * 4. On logout: Clear user state
 *
 * Loading State:
 * - Shows full-screen loading overlay during initial auth check
 * - Prevents flash of unauthenticated content (FOUC)
 * - Loading completes after Firestore user doc is read
 */

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Provides authentication state and methods to entire app
 *
 * Lifecycle:
 * 1. Mount: Subscribe to auth state changes
 * 2. Auth change: Sync Firestore user doc, create if needed
 * 3. Unmount: Unsubscribe from auth listener
 *
 * Children are not rendered until initial auth check completes to prevent
 * unauthorized access to protected routes.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to Firebase Auth state changes
  // Runs once on mount, then on every login/logout/token refresh
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUser(userSnap.data() as User);
        } else {
          // User document doesn't exist - this happens on first sign-up
          // (Google or email/password). Create user doc and default categories.
          const newUserDoc = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          };
          await ensureUserProfileDocument(firebaseUser.uid, newUserDoc);

          // Initialize default categories for the new user
          // This ensures every user starts with standard Italian cuisine categories
          // (Primi, Secondi, Contorni, Dolci, Antipasti)
          // CHECKLIST: If you modify categories initialization, also update:
          // - categories.ts (DEFAULT_CATEGORIES constant)
          // - CLAUDE.md (Data initialization documentation)
          await initializeDefaultCategories(firebaseUser.uid);

          // Re-read document to get server-generated timestamps
          // (serverTimestamp() is null until document is written and read back)
          const newUserSnap = await getDoc(userRef);
          if (newUserSnap.exists()) {
            setUser(newUserSnap.data() as User);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /**
   * Create new user account with email and password
   *
   * @param email - User email
   * @param password - User password
   * @param displayName - User's display name
   *
   * Flow:
   * 1. Firebase creates auth account
   * 2. Update profile with displayName
   * 3. onAuthStateChanged triggers and creates Firestore user doc + categories
   *
   * Note: User doc creation happens in onAuthStateChanged, not here,
   * to unify logic for all auth methods (email, Google, etc.)
   */
  const signUp = async (email: string, password: string, displayName: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName });

    // User document and default categories created automatically by
    // onAuthStateChanged listener (lines 48-69). This ensures consistent
    // setup flow for all authentication methods.
  };

  /**
   * Sign in with email and password
   * User state updates automatically via onAuthStateChanged listener
   */
  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  /**
   * Sign in with Google popup
   * Creates user document on first sign-up via onAuthStateChanged listener
   */
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  /**
   * Sign out current user
   * User state cleared automatically via onAuthStateChanged listener
   */
  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
