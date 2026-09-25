// One-off data jobs, run by hand (GitHub Actions → "Maintenance"). Both are
// safe to run again: they only bring data into the current shape.
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { feeRateOf, splitWinnings, winnersOf } from './shared/games';
import { statsForMatch, type GameStats, type StatsEntry } from './shared/stats';
import type { MatchDoc } from './matches/common';

const PLATFORMS = ['pc', 'playstation', 'xbox', 'switch', 'mobile'];

/**
 * users/{uid}: the old single `platform` becomes the list `platforms`.
 * Returns how many profiles need (or got) the change.
 */
export async function migratePlatforms(db: Firestore, apply: boolean): Promise<number> {
  const users = await db.collection('users').select('platform', 'platforms').get();
  let count = 0;
  for (const u of users.docs) {
    const old = u.get('platform');
    if (u.get('platforms') !== undefined && old === undefined) continue; // already done
    count++;
    if (!apply) continue;
    const list = Array.isArray(u.get('platforms'))
      ? u.get('platforms')
      : typeof old === 'string' && PLATFORMS.includes(old)
        ? [old]
        : [];
    await u.ref.update({ platforms: list, platform: FieldValue.delete() });
  }
  return count;
}

/**
 * Rebuilds playerStats and statsEntries from every settled match, oldest
 * first (cancelled matches don't count; reversed matches count with their
 * final result). Returns how many matches and players were counted.
 */
export async function rebuildStats(
  db: Firestore,
  apply: boolean,
): Promise<{ matches: number; players: number }> {
  const snap = await db.collection('matches').where('status', '==', 'completed').get();
  const matches = snap.docs
    .map((d) => ({ id: d.id, m: d.data() as MatchDoc }))
    .filter(({ m }) => m.settledAt)
    .sort((a, b) => a.m.settledAt!.toMillis() - b.m.settledAt!.toMillis());

  const stats: Record<string, { gamerTag: string; games: Record<string, GameStats> }> = {};
  const entries: Record<string, { game: string; players: Record<string, StatsEntry> }> = {};
  for (const { id, m } of matches) {
    const winners = m.draw ? [] : winnersOf(m);
    const credits = splitWinnings(m.players.length, winners, feeRateOf(m));
    const current = Object.fromEntries(m.playerUids.map((u) => [u, stats[u]?.games[m.game]]));
    const changes = statsForMatch(id, m.playerUids, winners, credits, current);
    entries[id] = { game: m.game, players: {} };
    for (const [uid, c] of Object.entries(changes)) {
      const tag = m.players.find((p) => p.uid === uid)?.gamerTag ?? 'Player';
      stats[uid] = { gamerTag: tag, games: { ...stats[uid]?.games, [m.game]: c.stats } };
      entries[id].players[uid] = c.entry;
    }
  }

  if (apply) {
    const writes: [FirebaseFirestore.DocumentReference, Record<string, unknown>][] = [
      ...Object.entries(stats).map(([uid, s]) => [
        db.collection('playerStats').doc(uid),
        { ...s, updatedAt: FieldValue.serverTimestamp() },
      ] as [FirebaseFirestore.DocumentReference, Record<string, unknown>]),
      ...Object.entries(entries).map(([id, e]) => [
        db.collection('statsEntries').doc(id),
        { matchId: id, ...e, updatedAt: FieldValue.serverTimestamp() },
      ] as [FirebaseFirestore.DocumentReference, Record<string, unknown>]),
    ];
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
      await batch.commit();
    }
  }
  return { matches: matches.length, players: Object.keys(stats).length };
}
