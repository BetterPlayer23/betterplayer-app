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

// ---- Round B

export type Report = {
  uid: string;
  gamerTag: string;
  winnerUid: string;
  winnerGamerTag: string;
  details: import('@shared/games').ResultDetails;
  notes: string | null;
  screenshotPath: string;
};

export type Dispute = {
  uid: string;
  gamerTag: string;
  reason: string;
  evidencePath: string | null;
};

// Reports or disputes of a match (players of the match and admins can read).
function useSub<T>(matchId: string | undefined, sub: 'reports' | 'disputes', enabled: boolean) {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!matchId || !enabled) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    return onSnapshot(
      collection(db, 'matches', matchId, sub),
      (snap) =>
        setState({ data: snap.docs.map((d) => d.data() as T), loading: false, error: null }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [matchId, sub, enabled]);
  return state;
}

export const useReports = (matchId: string | undefined, enabled = true) =>
  useSub<Report>(matchId, 'reports', enabled);
export const useDisputes = (matchId: string | undefined, enabled = true) =>
  useSub<Dispute>(matchId, 'disputes', enabled);

// Admin queue: matches under review, newest first.
export function useReviewQueue(enabled: boolean): Live<Match[]> {
  const [state, setState] = useState<Live<Match[]>>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!enabled) return;
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'under_review'),
      orderBy('reviewAt', 'desc'),
      limit(50),
    );
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map(toMatch), loading: false, error: null }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [enabled]);
  return state;
}

export type AdminReview = {
  id: string;
  matchId: string;
  gameName: string;
  decision: 'approve' | 'override' | 'cancel_refund';
  decidedBy?: 'admin' | 'vision'; // missing on decisions made before auto-approval existed
  winner: string | null;
  winnerGamerTag: string | null;
  disputed: boolean;
  players?: { uid: string; gamerTag: string }[];
  verification?: import('@shared/games').Verification;
  reverses?: string; // set on a reversal: the match whose automatic decision it reverses
  note: string;
  createdAt: import('firebase/firestore').Timestamp | null;
};

export function usePastDecisions(enabled: boolean): Live<AdminReview[]> {
  const [state, setState] = useState<Live<AdminReview[]>>({
    data: [],
    loading: true,
    error: null,
  });
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, 'admin_reviews'), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminReview, 'id'>) })),
          loading: false,
          error: null,
        }),
      () => setState((s) => ({ ...s, loading: false, error: LOAD_ERROR })),
    );
  }, [enabled]);
  return state;
}
