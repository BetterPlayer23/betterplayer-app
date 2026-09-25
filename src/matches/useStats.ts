import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import type { GameStats } from '@shared/stats';

import { db } from '@/firebase';

// playerStats/{uid}: stats per game, kept up to date by Cloud Functions when a
// match is settled. Readable by any signed-in player.
export type PlayerStats = { gamerTag: string; games: Partial<Record<string, GameStats>> };

export function usePlayerStats(uid: string | null | undefined) {
  const [state, setState] = useState<{ data: PlayerStats | null; loading: boolean; error: boolean }>(
    { data: null, loading: true, error: false },
  );
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'playerStats', uid),
      (snap) =>
        setState({
          data: snap.exists() ? (snap.data() as PlayerStats) : null,
          loading: false,
          error: false,
        }),
      () => setState({ data: null, loading: false, error: true }),
    );
  }, [uid]);
  return state;
}

// All games added together, for the Profile card.
export function totals(stats: PlayerStats | null) {
  const t = { played: 0, wins: 0, losses: 0, draws: 0, creditsWon: 0 };
  for (const g of Object.values(stats?.games ?? {})) {
    if (!g) continue;
    t.played += g.played;
    t.wins += g.wins;
    t.losses += g.losses;
    t.draws += g.draws;
    t.creditsWon = Math.round((t.creditsWon + g.creditsWon) * 100) / 100;
  }
  return t;
}
