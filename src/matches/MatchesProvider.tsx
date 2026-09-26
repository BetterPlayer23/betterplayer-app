import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { db } from '@/firebase';

import { toMatch, type Live } from './live';
import type { Match } from './types';

// ONE live copy of "open matches" and "my matches" for the whole app. Home and
// Matches both show them (with different lengths), so sharing one listener per
// list halves what Firestore sends (and charges) while the app is open.
export const OPEN_MAX = 30;
export const MINE_MAX = 20;

type Lists = { open: Live<Match[]>; mine: Live<Match[]> };

const empty = (): Live<Match[]> => ({ data: [], loading: true, error: null });
const LOAD_ERROR = 'Matches can’t be shown right now. Check your connection and try again.';

const MatchesContext = createContext<Lists>({ open: empty(), mine: empty() });

export function MatchesProvider({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const uid = status === 'signedIn' ? user?.uid : undefined;
  const [open, setOpen] = useState<Live<Match[]>>(empty);
  const [mine, setMine] = useState<Live<Match[]>>(empty);

  useEffect(() => {
    if (!uid) {
      setOpen(empty());
      setMine(empty());
      return;
    }
    const openQ = query(
      collection(db, 'matches'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(OPEN_MAX),
    );
    const mineQ = query(
      collection(db, 'matches'),
      where('playerUids', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(MINE_MAX),
    );
    const stopOpen = onSnapshot(
      openQ,
      (snap) => setOpen({ data: snap.docs.map(toMatch), loading: false, error: null }),
      () => setOpen((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
    const stopMine = onSnapshot(
      mineQ,
      (snap) => setMine({ data: snap.docs.map(toMatch), loading: false, error: null }),
      () => setMine((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
    return () => {
      stopOpen();
      stopMine();
    };
  }, [uid]);

  return <MatchesContext.Provider value={{ open, mine }}>{children}</MatchesContext.Provider>;
}

export const useMatchLists = () => useContext(MatchesContext);
