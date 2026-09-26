import { Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';

import * as B from './shared/badges';

// Leaderboard rows and the tier shown on each (server only).
//
// Every board is ranked by all validated matches (value). The tier shown:
// - Gold, Cobalt, Carbon come straight from the rank (Neon / Prism ranks are
//   capped at Gold);
// - Neon and Prism come from a second, hidden ranking in boardsPrivate/{id}:
//   only players who pass the hidden checks, counting only clean
//   (photo-verified, unedited) matches;
// - a promotion to Neon or Prism can be delayed (pendingPromotions), a
//   demotion is always immediate.

export type Entry = B.BoardEntry;

export const boardRef = (db: Firestore, season: string, game: string, stat: B.StatId) =>
  db.collection('leaderboards').doc(B.boardDocId(season, game, stat));
export const boardPrivateRef = (db: Firestore, season: string, game: string, stat: B.StatId) =>
  db.collection('boardsPrivate').doc(B.boardDocId(season, game, stat));
export const seasonStatsRef = (db: Firestore, season: string, game: string, uid: string) =>
  db.collection('seasonStats').doc(B.seasonStatsId(season, game, uid));
// Clean-only season totals (server-only).
export const seasonPrivateRef = (db: Firestore, season: string, game: string, uid: string) =>
  db.collection('seasonPrivate').doc(B.seasonStatsId(season, game, uid));
export const pendingPromotionRef = (db: Firestore, boardId: string, uid: string) =>
  db.collection('pendingPromotions').doc(`${boardId}_${uid}`);

const capAtGold = (t: B.Tier | null): B.Tier | null => (t === 'prism' || t === 'neon' ? 'gold' : t);

/** The tier a row should show: rank tier capped at Gold, or Neon/Prism from the hidden ranking. */
export function targetTier(rank: number | null, matches: number, topRank: number | null): B.Tier | null {
  const base = capAtGold(B.tierForRank(rank, matches));
  const top = topRank !== null && topRank <= B.NEON_MAX_RANK ? B.tierForRank(topRank, 1) : null;
  return B.tierValue(top) > B.tierValue(base) ? top : base;
}

// The tier of a player not on the stored board (Cobalt / Carbon / none).
export const offBoardTier = (matches: number) => capAtGold(B.tierForRank(null, matches));

// Rows saved before tiers were stored: the tier came from the rank.
const shownTier = (e: Entry, rank: number) => (e.tier !== undefined ? e.tier : B.tierForRank(rank, e.matches));

export const toSeasonStats = (d: Record<string, unknown> | undefined): B.SeasonStats => {
  const s = B.emptySeasonStats();
  for (const k of Object.keys(s) as (keyof B.SeasonStats)[]) s[k] = Number(d?.[k] ?? 0);
  return s;
};

export type Change = {
  uid: string;
  tag: string;
  full: B.SeasonStats | null; // null = take the player off the board
  clean: B.SeasonStats | null; // clean-only totals
  qualified: boolean; // passes the hidden checks
  verifying: boolean; // a result is being verified
};

export type BoardState = { stat: B.StatId; id: string; entries: Entry[]; top: Entry[] };

export async function loadBoards(tx: Transaction, db: Firestore, season: string, game: string): Promise<BoardState[]> {
  const stats = B.BOARD_STATS[game] ?? [];
  const snaps = await Promise.all(
    stats.flatMap((st) => [tx.get(boardRef(db, season, game, st)), tx.get(boardPrivateRef(db, season, game, st))]),
  );
  return stats.map((stat, i) => ({
    stat,
    id: B.boardDocId(season, game, stat),
    entries: (snaps[2 * i].get('entries') ?? []) as Entry[],
    top: (snaps[2 * i + 1].get('top') ?? []) as Entry[],
  }));
}

export type TierMove = { stat: B.StatId; uid: string; tag: string; from: B.Tier | null; to: B.Tier | null; takenBy: string | null };
export type BoardResult = BoardState & { moves: TierMove[]; promotions: string[] };

/** A board after some players' totals changed (pure). */
export function recompute(
  board: BoardState,
  changes: Change[],
  opts: { now: number; delayPromotions: boolean },
): BoardResult {
  const { stat } = board;
  const before = board.entries;
  const beforeTier = new Map(before.map((e, i) => [e.uid, shownTier(e, i + 1)]));
  const after = B.updateBoard(
    before,
    changes.map((c) => ({
      uid: c.uid,
      tag: c.tag,
      value: c.full ? B.statValue(c.full, stat) : null,
      matches: c.full?.matches ?? 0,
      at: opts.now,
    })),
  );
  for (const c of changes) {
    const e = after.find((x) => x.uid === c.uid);
    if (!e) continue;
    if (c.verifying) e.verifying = true;
    else delete e.verifying;
  }
  const top = B.updateBoard(
    board.top,
    changes.map((c) => ({
      uid: c.uid,
      tag: c.tag,
      value: c.qualified && c.clean ? B.statValue(c.clean, stat) : null,
      matches: c.clean?.matches ?? 0,
      at: opts.now,
    })),
  );

  const promotions: string[] = [];
  after.forEach((e, i) => {
    const target = targetTier(i + 1, e.matches, B.rankOf(top, e.uid));
    const current = beforeTier.get(e.uid) ?? null;
    let shown = target;
    if (opts.delayPromotions && (target === 'neon' || target === 'prism') && B.tierValue(target) > B.tierValue(current)) {
      shown = B.tierValue(current) > B.tierValue('gold') ? current : 'gold';
      promotions.push(e.uid);
    }
    e.tier = shown;
  });

  // Who changed tier, and (for a drop) which mover passed them.
  const movers = new Set(changes.map((c) => c.uid));
  const changeOf = new Map(changes.map((c) => [c.uid, c]));
  const uids = new Set([...before.map((e) => e.uid), ...after.map((e) => e.uid), ...movers]);
  const moves: TierMove[] = [];
  for (const uid of uids) {
    const rb = B.rankOf(before, uid);
    const ra = B.rankOf(after, uid);
    const eb = rb ? before[rb - 1] : undefined;
    const ea = ra ? after[ra - 1] : undefined;
    const from = eb ? (beforeTier.get(uid) ?? null) : movers.has(uid) ? null : offBoardTier(0);
    const matches = changeOf.get(uid)?.full?.matches ?? eb?.matches ?? 0;
    const to = ea ? (ea.tier ?? null) : offBoardTier(matches);
    if (from === to) continue;
    let takenBy: string | null = null;
    if (!movers.has(uid) && B.tierValue(to) < B.tierValue(from)) {
      const passer = after.find((e) => {
        if (!movers.has(e.uid)) return false;
        const moverBefore = B.rankOf(before, e.uid);
        return B.rankOf(after, e.uid)! < (ra ?? Infinity) && (moverBefore === null || rb === null || moverBefore > rb);
      });
      takenBy = passer?.tag ?? null;
    }
    moves.push({ stat, uid, tag: ea?.tag ?? eb?.tag ?? changeOf.get(uid)?.tag ?? 'Player', from, to, takenBy });
  }
  return { ...board, entries: after, top, moves, promotions };
}

export function writeBoards(tx: Transaction, db: Firestore, season: string, game: string, results: BoardResult[], now: Date) {
  for (const r of results) {
    const at = Timestamp.fromDate(now);
    tx.set(boardRef(db, season, game, r.stat), { season, game, stat: r.stat, entries: r.entries, updatedAt: at });
    tx.set(boardPrivateRef(db, season, game, r.stat), { season, game, stat: r.stat, top: r.top, updatedAt: at });
  }
}

/** A player's badges with their tier moves and crown changes applied. */
export function nextBadges(
  b: B.PlayerBadges,
  opts: {
    game: string;
    liveSeason: string;
    season: string;
    moves: TierMove[];
    crownsLost?: string[];
    crownsWon?: { id: string; label: string; value: number }[];
    gamerTag?: string;
  },
): B.PlayerBadges {
  const tiers = { ...B.currentTiers(b, opts.liveSeason) };
  if (opts.season === opts.liveSeason) {
    for (const m of opts.moves) {
      const key = B.boardKey(opts.game, m.stat);
      if (m.to) tiers[key] = m.to;
      else delete tiers[key];
    }
  }
  const crowns = { ...(b.crowns ?? {}) };
  for (const id of opts.crownsLost ?? []) delete crowns[id];
  for (const c of opts.crownsWon ?? []) crowns[c.id] = { label: c.label, value: c.value };
  const next: B.PlayerBadges = {
    ...b,
    gamerTag: opts.gamerTag ?? b.gamerTag ?? opts.moves[0]?.tag,
    tiers,
    tiersSeason: opts.liveSeason,
    crowns,
    trophies: b.trophies ?? [],
  };
  next.chip = B.chipFor(next, opts.liveSeason);
  return next;
}

/**
 * Recomputes one game's boards after some players' totals changed and saves
 * boards, badges (tier moves, no notifications) and pending promotions.
 * Does all its reads first: call it after the caller's own reads and run the
 * returned function where the caller writes.
 */
export async function prepareBoardUpdate(
  tx: Transaction,
  db: Firestore,
  opts: { season: string; game: string; changes: Change[]; now: Date; promoteAt: Date | null },
): Promise<{ results: BoardResult[]; write: () => void }> {
  const liveSeason = B.seasonOf(opts.now);
  const boards = await loadBoards(tx, db, opts.season, opts.game);
  const results = boards.map((b) =>
    recompute(b, opts.changes, { now: opts.now.getTime(), delayPromotions: !!opts.promoteAt }),
  );
  const moved = [...new Set(results.flatMap((r) => r.moves.map((m) => m.uid)))];
  const promos = results.flatMap((r) => r.promotions.map((uid) => ({ id: r.id, uid, stat: r.stat })));
  const [badgeSnaps, promoSnaps] = await Promise.all([
    Promise.all(moved.map((u) => tx.get(db.collection('badges').doc(u)))),
    Promise.all(promos.map((p) => tx.get(pendingPromotionRef(db, p.id, p.uid)))),
  ]);
  const write = () => {
    writeBoards(tx, db, opts.season, opts.game, results, opts.now);
    moved.forEach((u, i) => {
      const b = (badgeSnaps[i].data() as B.PlayerBadges | undefined) ?? {};
      const next = nextBadges(b, {
        game: opts.game,
        liveSeason,
        season: opts.season,
        moves: results.flatMap((r) => r.moves.filter((m) => m.uid === u)),
      });
      tx.set(badgeSnaps[i].ref, { ...next, updatedAt: Timestamp.fromDate(opts.now) });
    });
    promos.forEach((p, i) => {
      if (promoSnaps[i].exists || !opts.promoteAt) return;
      tx.set(promoSnaps[i].ref, {
        uid: p.uid,
        boardId: p.id,
        season: opts.season,
        game: opts.game,
        stat: p.stat,
        applyAt: Timestamp.fromDate(opts.promoteAt),
        createdAt: Timestamp.fromDate(opts.now),
      });
    });
  };
  return { results, write };
}

/**
 * Applies promotions whose time has come (scheduled): the player gets the
 * tier they qualify for now, if it is higher than the one shown. Returns how
 * many rows moved up.
 */
export async function applyPromotions(db: Firestore, now = new Date()): Promise<number> {
  const due = await db
    .collection('pendingPromotions')
    .where('applyAt', '<=', Timestamp.fromDate(now))
    .limit(200)
    .get();
  let promoted = 0;
  const liveSeason = B.seasonOf(now);
  for (const d of due.docs) {
    const { uid, season, game, stat } = d.data() as { uid: string; season: string; game: string; stat: B.StatId };
    const up = await db.runTransaction(async (tx) => {
      const [board, priv, badges] = await Promise.all([
        tx.get(boardRef(db, season, game, stat)),
        tx.get(boardPrivateRef(db, season, game, stat)),
        tx.get(db.collection('badges').doc(uid)),
      ]);
      tx.delete(d.ref);
      if (season !== liveSeason) return false;
      const entries = (board.get('entries') ?? []) as Entry[];
      const i = entries.findIndex((e) => e.uid === uid);
      if (i < 0) return false;
      const e = entries[i];
      const target = targetTier(i + 1, e.matches, B.rankOf((priv.get('top') ?? []) as Entry[], uid));
      if (B.tierValue(target) <= B.tierValue(shownTier(e, i + 1))) return false;
      const from = shownTier(e, i + 1);
      e.tier = target;
      tx.update(board.ref, { entries, updatedAt: Timestamp.fromDate(now) });
      const next = nextBadges((badges.data() as B.PlayerBadges | undefined) ?? {}, {
        game,
        liveSeason,
        season,
        moves: [{ stat, uid, tag: e.tag, from, to: target, takenBy: null }],
      });
      tx.set(badges.ref, { ...next, updatedAt: Timestamp.fromDate(now) });
      return true;
    });
    if (up) promoted++;
  }
  return promoted;
}

/**
 * Takes a player off one season's boards of the given games (others move up;
 * promotions to Neon / Prism wait for `promoteAt` when given) and deletes
 * their season totals there.
 */
export async function removeFromBoards(
  db: Firestore,
  uid: string,
  opts: { season: string; games: string[]; now: Date; promoteAt: Date | null },
) {
  for (const game of opts.games) {
    await db.runTransaction(async (tx) => {
      const upd = await prepareBoardUpdate(tx, db, {
        season: opts.season,
        game,
        changes: [{ uid, tag: 'Player', full: null, clean: null, qualified: false, verifying: false }],
        now: opts.now,
        promoteAt: opts.promoteAt,
      });
      upd.write();
      tx.delete(seasonStatsRef(db, opts.season, game, uid));
      tx.delete(seasonPrivateRef(db, opts.season, game, uid));
    });
  }
}

/**
 * Takes a player's results out of the crowns (all, or one game's, or only
 * those set in one season): the next best in the history takes over.
 */
export async function removeCrowns(
  db: Firestore,
  uid: string,
  opts: { now: Date; game?: string; season?: string },
) {
  const liveSeason = B.seasonOf(opts.now);
  const records = await db.collection('records').get();
  const mine = (h: B.RecordHolder) =>
    h.uid === uid && (!opts.season || B.seasonOf(new Date(h.at)) === opts.season);
  for (const r of records.docs) {
    if (opts.game && r.get('game') !== opts.game) continue;
    await db.runTransaction(async (tx) => {
      const doc = (await tx.get(r.ref)).data() as B.RecordDoc | undefined;
      if (!doc || !(doc.history ?? []).some(mine)) return;
      const history = (doc.history ?? []).filter((h) => !mine(h));
      const holder = history[0] ?? null;
      const changed = doc.holder?.uid !== holder?.uid;
      const label = String(r.get('label') ?? r.id);
      const [oldB, newB] = await Promise.all([
        changed && doc.holder ? tx.get(db.collection('badges').doc(doc.holder.uid)) : null,
        changed && holder ? tx.get(db.collection('badges').doc(holder.uid)) : null,
      ]);
      tx.update(r.ref, { holder, history });
      if (oldB) {
        const b = (oldB.data() as B.PlayerBadges | undefined) ?? {};
        const next = nextBadges(b, { game: '', liveSeason, season: liveSeason, moves: [], crownsLost: [r.id] });
        tx.set(oldB.ref, { ...next, updatedAt: Timestamp.fromDate(opts.now) });
      }
      if (newB && holder) {
        const b = (newB.data() as B.PlayerBadges | undefined) ?? {};
        const next = nextBadges(b, {
          game: '',
          liveSeason,
          season: liveSeason,
          moves: [],
          crownsWon: [{ id: r.id, label, value: holder.value }],
        });
        tx.set(newB.ref, { ...next, updatedAt: Timestamp.fromDate(opts.now) });
      }
    });
  }
}
