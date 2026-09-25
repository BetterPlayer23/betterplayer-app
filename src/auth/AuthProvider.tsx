import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { BETA_RULES_VERSION } from '@shared/betaRules';
import { httpsCallable } from 'firebase/functions';

import { auth, db, functions } from '@/firebase';

import type { GameIds, PlatformId, Profile } from './profile';

// loading:      still finding out who is signed in
// signedOut:    show Sign up / Log in
// needsProfile: signed in but users/{uid} is missing (sign-up was interrupted)
// signedIn:     show the tabs
// error:        couldn't read the profile (e.g. no connection)
// needsRules:   profile exists but hasn't accepted the current beta rules
export type AuthStatus =
  | 'loading'
  | 'signedOut'
  | 'needsProfile'
  | 'needsRules'
  | 'signedIn'
  | 'error';

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  profile: Profile | null;
  // True when admins/{uid} exists (created by hand in the Firebase console).
  isAdmin: boolean;
  signUp: (input: {
    email: string;
    password: string;
    gamerTag: string;
    platform: PlatformId;
  }) => Promise<void>;
  createProfile: (gamerTag: string, platform: PlatformId) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  // Accept the current beta rules (saved by a Cloud Function).
  acceptRules: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  updateGamerTag: (gamerTag: string) => Promise<void>;
  updateGameIds: (gameIds: GameIds) => Promise<void>;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ADMIN_RETRY_MS = 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = not known yet
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [profileError, setProfileError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  // Firebase keeps the session, so this fires with the saved user on launch.
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Live copy of users/{uid} while signed in.
  useEffect(() => {
    setProfile(undefined);
    setProfileError(false);
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        // Offline with nothing cached: wait for the server instead of
        // wrongly deciding the profile is missing.
        if (!snap.exists() && snap.metadata.fromCache) return;
        setProfile(snap.exists() ? (snap.data() as Profile) : null);
      },
      () => setProfileError(true),
    );
  }, [user, attempt]);

  // Is this player a Betterplayer admin? (Shows the Admin tab.)
  // If the read is refused (e.g. the live rules don't allow it yet), try again
  // every 30 s instead of giving up, so the tab appears once the rules are fixed.
  useEffect(() => {
    setIsAdmin(false);
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const listen = () => {
      unsubscribe = onSnapshot(
        doc(db, 'admins', user.uid),
        (snap) => setIsAdmin(snap.exists()),
        (error) => {
          console.warn('Admin check failed, retrying in 30 s:', error.code);
          setIsAdmin(false);
          retry = setTimeout(listen, ADMIN_RETRY_MS);
        },
      );
    };
    listen();
    return () => {
      unsubscribe?.();
      if (retry) clearTimeout(retry);
    };
  }, [user]);

  let status: AuthStatus;
  if (user === undefined) status = 'loading';
  else if (user === null) status = 'signedOut';
  // Keep the sign-up screen up until its profile write has finished.
  else if (creating) status = 'signedOut';
  else if (profileError) status = 'error';
  else if (profile === undefined) status = 'loading';
  else if (!profile) status = 'needsProfile';
  else if (profile.acceptedRulesVersion !== BETA_RULES_VERSION) status = 'needsRules';
  else status = 'signedIn';

  async function createProfile(gamerTag: string, platform: PlatformId) {
    const current = auth.currentUser;
    if (!current) throw new Error('Not signed in');
    await setDoc(doc(db, 'users', current.uid), {
      gamerTag: gamerTag.trim(),
      platform,
      ageConfirmed: true,
      ageConfirmedAt: serverTimestamp(),
      country: 'ES', // self-declared
      gameIds: {},
      createdAt: serverTimestamp(),
    });
  }

  const value: AuthContextValue = {
    status,
    user: user ?? null,
    profile: profile ?? null,
    isAdmin,
    async signUp({ email, password, gamerTag, platform }) {
      setCreating(true);
      try {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        await createProfile(gamerTag, platform);
      } finally {
        setCreating(false);
      }
    },
    createProfile,
    async acceptRules() {
      await httpsCallable(functions, 'acceptRules')({ version: BETA_RULES_VERSION });
    },
    async logIn(email, password) {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    async resetPassword(email) {
      await sendPasswordResetEmail(auth, email.trim());
    },
    async logOut() {
      await signOut(auth);
    },
    async updateGamerTag(gamerTag) {
      if (!user) return;
      await updateDoc(doc(db, 'users', user.uid), { gamerTag: gamerTag.trim() });
    },
    async updateGameIds(gameIds) {
      if (!user) return;
      await updateDoc(doc(db, 'users', user.uid), { gameIds });
    },
    retry: () => setAttempt((n) => n + 1),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
