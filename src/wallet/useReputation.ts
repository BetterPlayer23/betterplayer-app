import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { db } from '@/firebase';

export type Reputation = { points: number; matchesCompleted: number; disputesLost: number };

// reputation/{uid}: written only by Cloud Functions. Missing = a fresh start (0).
export function useReputation(): { data: Reputation; loading: boolean } {
  const { user } = useAuth();
  const uid = user?.uid;
  const [state, setState] = useState({
    data: { points: 0, matchesCompleted: 0, disputesLost: 0 },
    loading: true,
  });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'reputation', uid),
      (snap) => {
        const d = snap.data();
        setState({
          data: {
            points: Number(d?.points ?? 0),
            matchesCompleted: Number(d?.matchesCompleted ?? 0),
            disputesLost: Number(d?.disputesLost ?? 0),
          },
          loading: false,
        });
      },
      () => setState((s) => ({ ...s, loading: false })),
    );
  }, [uid]);
  return state;
}
