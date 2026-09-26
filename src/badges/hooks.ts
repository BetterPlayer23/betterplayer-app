import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';

import {
  boardDocId,
  seasonStatsId,
  statValue,
  type BoardEntry,
  type PlayerBadges,
  type SeasonStats,
  type StatId,
} from '@shared/badges';

import { db, functions } from '@/firebase';

// Badges, leaderboards and notifications. All written only by Cloud
// Functions (functions/src/leaderboards.ts); the app reads them. The one
// exception: a player may mark their own notifications as read.

type Live<T> = { data: T; loading: boolean; error: boolean };

// badges/{uid}: Founder number, crowns, live tiers, season trophies.
export function useBadges(uid: string | null | undefined): Live<PlayerBadges | null> {
  const [state, setState] = useState<Live<PlayerBadges | null>>({ data: null, loading: true, error: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'badges', uid),
      (snap) => setState({ data: snap.exists() ? (snap.data() as PlayerBadges) : null, loading: false, error: false }),
      () => setState({ data: null, loading: false, error: true }),
    );
  }, [uid]);
  return state;
}

// leaderboards/{season}_{game}_{stat}: ONE precomputed document with the top
// players (sorted), so a leaderboard costs a single read.
export function useLeaderboard(season: string, game: string, stat: StatId): Live<BoardEntry[]> {
  const [state, setState] = useState<Live<BoardEntry[]>>({ data: [], loading: true, error: false });
  useEffect(() => {
    setState({ data: [], loading: true, error: false });
    return onSnapshot(
      doc(db, 'leaderboards', boardDocId(season, game, stat)),
      (snap) => setState({ data: (snap.get('entries') as BoardEntry[] | undefined) ?? [], loading: false, error: false }),
      () => setState({ data: [], loading: false, error: true }),
    );
  }, [season, game, stat]);
  return state;
}

export type MyPosition =
  | { kind: 'none' } // no matches in this game this season
  | { kind: 'needsMatches'; matches: number } // average needs 10 matches
  | { kind: 'ranked'; rank: number; value: number; matches: number };

/**
 * The player's own place. From the board when they are on it; otherwise from
 * their season totals plus one count query ("how many players are ahead").
 */
export function useMyPosition(
  season: string,
  game: string,
  stat: StatId,
  uid: string | null | undefined,
  entries: BoardEntry[],
  boardLoading: boolean,
): MyPosition | null {
  const [pos, setPos] = useState<MyPosition | null>(null);
  const index = uid ? entries.findIndex((e) => e.uid === uid) : -1;
  const onBoard = index >= 0 ? entries[index] : null;
  useEffect(() => {
    let alive = true;
    setPos(null);
    if (!uid || boardLoading || onBoard) return;
    (async () => {
      const snap = await getDoc(doc(db, 'seasonStats', seasonStatsId(season, game, uid)));
      if (!snap.exists()) return { kind: 'none' } as const;
      const s = snap.data() as SeasonStats;
      const value = statValue(s, stat);
      if (value === null) {
        return s.matches > 0 ? ({ kind: 'needsMatches', matches: s.matches } as const) : ({ kind: 'none' } as const);
      }
      const ahead = await getCountFromServer(
        query(collection(db, 'seasonStats'), where('season', '==', season), where('game', '==', game), where(stat, '>', value)),
      );
      return { kind: 'ranked', rank: ahead.data().count + 1, value, matches: s.matches } as const;
    })()
      .then((p) => alive && setPos(p))
      .catch(() => alive && setPos(null));
    return () => {
      alive = false;
    };
  }, [season, game, stat, uid, boardLoading, onBoard]);
  if (onBoard) return { kind: 'ranked', rank: index + 1, value: onBoard.value, matches: onBoard.matches };
  return pos;
}

export type Notification = {
  id: string;
  type: 'tier_lost' | 'crown_lost' | 'crown_won' | 'trophy' | 'founder' | string;
  text: string;
  read: boolean;
  createdAt?: Timestamp;
};

const NOTIFICATIONS_SHOWN = 30;

// notifications/{uid}/items: the latest 30, newest first.
export function useNotifications(uid: string | null | undefined): Live<Notification[]> {
  const [state, setState] = useState<Live<Notification[]>>({ data: [], loading: true, error: false });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'notifications', uid, 'items'), orderBy('createdAt', 'desc'), limit(NOTIFICATIONS_SHOWN)),
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Notification, 'id'>) })),
          loading: false,
          error: false,
        }),
      () => setState({ data: [], loading: false, error: true }),
    );
  }, [uid]);
  return state;
}

// How many unread notifications (up to 9, shown as "9+" beyond that).
export function useUnreadCount(uid: string | null | undefined): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(
        collection(db, 'notifications', uid, 'items'),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(10),
      ),
      (snap) => setCount(snap.size),
      () => setCount(0),
    );
  }, [uid]);
  return count;
}

// Marks the given notifications as read (the only thing the app may change).
export async function markRead(uid: string, ids: string[]) {
  if (!ids.length) return;
  const batch = writeBatch(db);
  for (const id of ids) batch.update(doc(db, 'notifications', uid, 'items', id), { read: true });
  await batch.commit();
}


// Admins: mark a suspicious-pattern flag as looked at.
export async function dismissFlag(flagId: string) {
  await httpsCallable(functions, 'dismissFlag')({ flagId });
}
