import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { db } from '@/firebase';

// Read-only views of the player's credits. The app never writes wallets or
// the ledger: only Cloud Functions do (see CLAUDE.md).

export type Wallet = { available: number; locked: number };

export type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: Timestamp | null;
};

type Live<T> = { data: T; loading: boolean; error: string | null };

function readError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code === 'unavailable') return 'No connection. Check your internet and try again.';
  return 'Your credits can’t be shown right now. Please try again later.';
}

// wallets/{uid}. Until the Cloud Function has created it, credits show as 0.
export function useWallet(): Live<Wallet> & { exists: boolean } {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<Live<Wallet> & { exists: boolean }>({
    data: { available: 0, locked: 0 },
    loading: true,
    error: null,
    exists: false,
  });

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'wallets', uid),
      (snap) => {
        const d = snap.data();
        setState({
          data: { available: Number(d?.available ?? 0), locked: Number(d?.locked ?? 0) },
          loading: false,
          error: null,
          exists: snap.exists(),
        });
      },
      (e) => setState((s) => ({ ...s, loading: false, error: readError(e) })),
    );
  }, [uid]);

  return state;
}

// The player's ledger entries, newest first.
export function useLedger(max = 50): Live<LedgerEntry[]> {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState<Live<LedgerEntry[]>>({
    data: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'ledger'),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              type: String(v.type ?? ''),
              amount: Number(v.amount ?? 0),
              description: String(v.description ?? ''),
              createdAt: (v.createdAt as Timestamp | undefined) ?? null,
            };
          }),
          loading: false,
          error: null,
        }),
      (e) => setState((s) => ({ ...s, loading: false, error: readError(e) })),
    );
  }, [uid, max]);

  return state;
}
