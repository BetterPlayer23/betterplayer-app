import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { db } from '@/firebase';

import { ACTIVE_STATUSES, type Match } from './types';

type Live<T> = { data: T; loading: boolean; error: string | null };

const LOAD_ERROR = 'Matches can’t be shown right now. Check your connection and try again.';

function toMatch(snap: DocumentSnapshot): Match {
  return { id: snap.id, ...(snap.data() as Omit<Match, 'id'>) };
}

// Re-render every 30 s so matches whose 15 minutes ran out disappear.
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Live list of open matches, newest first.
export function useOpenMatches(max = 30): Live<Match[]> {
  const [state, setState] = useState<Live<Match[]>>({ data: [], loading: true, error: null });
  const now = useNow();

  useEffect(() => {
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map(toMatch), loading: false, error: null }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [max]);

  // Expired matches are cancelled every 5 minutes; hide them straight away.
  const data = state.data.filter((m) => !m.expiresAt || m.expiresAt.toMillis() > now);
  return { ...state, data };
}

// Live list of the signed-in player's recent matches, newest first.
export function useMyMatches(max = 20): Live<Match[]> & { active: Match | null } {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<Live<Match[]>>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'matches'),
      where('playerUids', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map(toMatch), loading: false, error: null }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [uid, max]);

  const active = state.data.find((m) => ACTIVE_STATUSES.includes(m.status)) ?? null;
  return { ...state, active };
}

// One match, live.
export function useMatch(id: string | undefined): Live<Match | null> {
  const [state, setState] = useState<Live<Match | null>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    return onSnapshot(
      doc(db, 'matches', id),
      (snap) =>
        setState({ data: snap.exists() ? toMatch(snap) : null, loading: false, error: null }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [id]);

  return state;
}
