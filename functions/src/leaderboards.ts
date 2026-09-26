import { getAuth } from 'firebase-admin/auth';
import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import * as B from './shared/badges';
import { getGame, winnersOf, type ResultDetails } from './shared/games';
import { requireAdmin } from './matches/admin';
import { OWNER_EMAIL, isExcludedTag, isTestEmail } from './exclusions';
import { fail, madridDay, type MatchDoc, type ReportDoc } from './matches/common';

// Leaderboards, live rank tiers, crowns, founders, season trophies,
// notifications and anti-farming flags. Everything here is server-only:
// players can read boards, badges and their own notifications, never write
// them (see firestore.rules). Rules and texts: ./shared/badges.ts.
//
// Collections (all written only here):
// - leaderboards/{season}_{game}_{stat}: the top 260 of a board (one read shows a board)
// - seasonStats/{season}_{game}_{uid}: a player's season totals (for "your position")
// - badges/{uid}: founder, crowns, live tiers, trophies and the chip shown by names
// - records/{game.kind}: all-time crowns (holder + a short history)
// - notifications/{uid}/items/{id}: tier / crown / trophy / founder messages
// - leaderboardEntries/{matchId}: what a match added (so a reversal can take it out)
// - leaderboardApplied/{reviewId}: marks a decision as counted (safe to run twice)
// - pairDays/{day}_{a}_{b}, pairs/{a}_{b}: anti-farming counters; flags/{matchId}: for admins
// - founderClaims/{uid}, meta/founders, seasons/{season}

type Players = Record<string, { tag: string; c: B.Contribution }>;
type StoredEntry = {
  matchId: string;
  season: string;
  game: string;
  counted: boolean;
  players: Players;
  records: string[];
};

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

const toSeasonStats = (d: Record<string, unknown> | undefined): B.SeasonStats => {
  const s = B.emptySeasonStats();
  for (const k of Object.keys(s) as (keyof B.SeasonStats)[]) s[k] = Number(d?.[k] ?? 0);
  return s;
};

function notify(tx: Transaction, db: Firestore, uid: string, type: string, text: string, now: Date) {
  tx.create(db.collection('notifications').doc(uid).collection('items').doc(), {
    type,
    text,
    read: false,
    createdAt: Timestamp.fromDate(now),
  });
}

/**
 * Counts one admin_reviews document (a settlement, or a reversal of an
 * automatic decision) in the season stats, leaderboards, tiers and crowns.
 * One transaction; a second run does nothing (leaderboardApplied/{reviewId}).
 */
export async function applyReview(db: Firestore, reviewId: string, now = new Date()): Promise<string> {
  return db.runTransaction(async (tx) => {
    const appliedRef = db.collection('leaderboardApplied').doc(reviewId);
    const [applied, reviewSnap] = await Promise.all([
      tx.get(appliedRef),
      tx.get(db.collection('admin_reviews').doc(reviewId)),
    ]);
    if (applied.exists) return 'already';
    const review = reviewSnap.data();
    if (!review) return 'missing';
    const done = (result: string) => {
      tx.create(appliedRef, { result, at: Timestamp.fromDate(now) });
      return result;
    };

    const reversal = typeof review.reverses === 'string';
    const matchId = String(review.matchId);
    const game = getGame(String(review.game));
    const stats = game ? B.BOARD_STATS[game.id] : undefined;
    if (!game || !stats) return done('no-board');

    const matchRef = db.collection('matches').doc(matchId) as DocumentReference<MatchDoc>;
    const entryRef = db.collection('leaderboardEntries').doc(matchId);
    const [matchSnap, entrySnap] = await Promise.all([tx.get(matchRef), tx.get(entryRef)]);
    const match = matchSnap.data();
    if (!match) return done('no-match');
    const old = reversal ? (entrySnap.data() as StoredEntry | undefined) : undefined;
    if (reversal && !old) return done('nothing-to-reverse');

    const uids = match.playerUids;
    // Admin / test accounts (users/{uid}.excludeFromRankings) never count;
    // their opponents' results still do.
    const userSnaps = await Promise.all(uids.map((u) => tx.get(db.collection('users').doc(u))));
    const excluded = new Set(uids.filter((_, i) => userSnaps[i].get('excludeFromRankings') === true));
    const ranked = uids.filter((u) => !excluded.has(u));
    const tagOf = (u: string) => match.players.find((p) => p.uid === u)?.gamerTag ?? 'Player';
    const cancelled = review.decision === 'cancel_refund';
    const winners: string[] = cancelled ? [] : Array.isArray(review.winners) ? review.winners : winnersOf(review);

    // The reported numbers count only when the final winners are the reported ones.
    let details: ResultDetails | null = null;
    if (!cancelled && match.reportedByUid) {
      const report = (await tx.get(matchRef.collection('reports').doc(match.reportedByUid))).data() as
        | ReportDoc
        | undefined;
      if (report && sameSet(winnersOf(report), winners)) details = report.details as ResultDetails;
    }

    const season = old?.season ?? B.seasonOf(now);
    const liveSeason = B.seasonOf(now);

    // ---- anti-farming (first settlement only): the same two players count at
    // most 3 times a day; unusual patterns are flagged for admins.
    const pairs = B.pairsOf([...uids].sort());
    const day = madridDay(now);
    const pairDayRefs = pairs.map(([a, b]) => db.collection('pairDays').doc(`${day}_${B.pairKey(a, b)}`));
    const pairRefs = pairs.map(([a, b]) => db.collection('pairs').doc(B.pairKey(a, b)));
    const [pairDaySnaps, pairSnaps] = reversal
      ? [[], []]
      : await Promise.all([Promise.all(pairDayRefs.map((r) => tx.get(r))), Promise.all(pairRefs.map((r) => tx.get(r)))]);
    const pairCounts = pairDaySnaps.map((s) => Number(s.get('count') ?? 0) + 1);
    const counted = reversal ? old!.counted : pairCounts.every((n) => n <= B.PAIR_DAILY_CAP);
    const flags: B.FlagReason[] = [];
    if (!reversal && pairCounts.some((n) => n > B.PAIR_DAILY_CAP)) flags.push('pair_daily_cap');
    const oneOnOne = game.minPlayers === 2 && game.maxPlayers === 2;
    const runs = pairSnaps.map((s) => {
      const w = winners.length === 1 ? winners[0] : null;
      const run = w && s.get('lastWinner') === w ? Number(s.get('run') ?? 0) + 1 : w ? 1 : 0;
      return { w, run };
    });
    if (!reversal && oneOnOne && !cancelled && runs.some((r) => r.run >= B.SAME_WINNER_FLAG)) {
      flags.push('same_winner_streak');
    }
    if (!reversal && game.id === 'eafc' && details?.goals && winners.length === 1) {
      const g = details.goals;
      const loser = uids.find((u) => u !== winners[0])!;
      if ((g[winners[0]] ?? 0) - (g[loser] ?? 0) >= B.LOPSIDED_EA_MARGIN) flags.push('lopsided');
    }

    // ---- contributions: what this match adds (and, on a reversal, what it added before)
    const addNow: Players | null =
      !cancelled && counted
        ? Object.fromEntries(
            Object.entries(B.contributionsFor(game.resultKind, uids, winners, details))
              .filter(([u]) => !excluded.has(u))
              .map(([u, c]) => [
              u,
              { tag: tagOf(u), c },
            ]),
          )
        : null;
    const takeOut: Players | null = old?.counted ? old.players : null;

    // ---- reads: season stats, boards, records, streaks
    const statsRef = (u: string) => db.collection('seasonStats').doc(B.seasonStatsId(season, game.id, u));
    const boardRef = (stat: B.StatId) => db.collection('leaderboards').doc(B.boardDocId(season, game.id, stat));
    const defs = B.recordsFor(game.id, game.name);
    const recordRef = (id: string) => db.collection('records').doc(id);
    const [statSnaps, boardSnaps, recordSnaps] = await Promise.all([
      Promise.all(uids.map((u) => tx.get(statsRef(u)))),
      Promise.all(stats.map((st) => tx.get(boardRef(st)))),
      Promise.all(defs.map((d) => tx.get(recordRef(d.id)))),
    ]);
    const streaks: Record<string, number> = {};
    if (!reversal && game.id === 'clash-royale' && winners.length === 1) {
      const ps = await tx.get(db.collection('playerStats').doc(winners[0]));
      streaks[winners[0]] = Number(ps.get(`games.${game.id}.streak`) ?? 0);
    }

    // ---- new season totals
    const newStats: Record<string, B.SeasonStats> = {};
    uids.forEach((u, i) => {
      let s = toSeasonStats(statSnaps[i].data());
      if (takeOut?.[u]) s = B.addContribution(s, takeOut[u].c, -1);
      if (addNow?.[u]) s = B.addContribution(s, addNow[u].c, 1);
      newStats[u] = s;
    });
    const changedStats = !!(addNow || takeOut);

    // ---- boards and tier changes
    const movers = new Set(ranked);
    const boardsAfter: { stat: B.StatId; entries: B.BoardEntry[] }[] = [];
    const tierMoves: { stat: B.StatId; change: B.TierChange }[] = [];
    if (changedStats) {
      stats.forEach((stat, i) => {
        const before = (boardSnaps[i].get('entries') ?? []) as B.BoardEntry[];
        const after = B.updateBoard(
          before,
          ranked.map((u) => ({
            uid: u,
            tag: tagOf(u),
            value: B.statValue(newStats[u], stat),
            matches: newStats[u].matches,
            at: now.getTime(),
          })),
        );
        const matchesOf = (u: string) =>
          newStats[u]?.matches ?? before.find((e) => e.uid === u)?.matches ?? 0;
        for (const change of B.tierChanges(before, after, movers, matchesOf)) tierMoves.push({ stat, change });
        boardsAfter.push({ stat, entries: after });
      });
    }

    // ---- crowns
    const recordWrites: { id: string; doc: B.RecordDoc }[] = [];
    const crownGain: { uid: string; id: string; label: string; value: number }[] = [];
    const crownLose: { uid: string; id: string; by: string | null; label: string }[] = [];
    let recordIds: string[] = [];
    const recordDoc = (id: string) => recordSnaps[defs.findIndex((d) => d.id === id)]?.data() as B.RecordDoc | undefined;
    if (reversal) {
      for (const id of old!.records ?? []) {
        const def = defs.find((d) => d.id === id);
        if (!def) continue;
        const before = recordDoc(id);
        const doc = B.removeMatchFromRecord(before, matchId);
        recordWrites.push({ id, doc });
        if (before?.holder?.uid !== doc.holder?.uid) {
          if (before?.holder) crownLose.push({ uid: before.holder.uid, id, by: null, label: def.label });
          if (doc.holder) crownGain.push({ uid: doc.holder.uid, id, label: def.label, value: doc.holder.value });
        }
      }
    } else if (addNow && details) {
      for (const cand of B.recordCandidates(defs, uids, winners, details, streaks, (u) => !excluded.has(u))) {
        const res = B.applyRecord(recordDoc(cand.def.id), {
          uid: cand.uid,
          tag: tagOf(cand.uid),
          value: cand.value,
          matchId,
          at: now.getTime(),
        });
        recordWrites.push({ id: cand.def.id, doc: res.doc });
        recordIds.push(cand.def.id);
        if (res.newHolder) {
          crownGain.push({ uid: cand.uid, id: cand.def.id, label: cand.def.label, value: cand.value });
          if (res.previous && res.previous.uid !== cand.uid) {
            crownLose.push({ uid: res.previous.uid, id: cand.def.id, by: tagOf(cand.uid), label: cand.def.label });
          }
        } else if (res.doc.holder?.uid === cand.uid) {
          // Same holder improved their own record.
          crownGain.push({ uid: cand.uid, id: cand.def.id, label: cand.def.label, value: res.doc.holder.value });
        }
      }
    }
    if (reversal) recordIds = [];

    // ---- badges of everyone touched (second round of reads, still before any write)
    const touched = new Set<string>([
      ...uids,
      ...tierMoves.map((t) => t.change.uid),
      ...crownGain.map((c) => c.uid),
      ...crownLose.map((c) => c.uid),
    ]);
    const badgeRefs = [...touched].map((u) => db.collection('badges').doc(u));
    const badgeSnaps = await Promise.all(badgeRefs.map((r) => tx.get(r)));

    // ================= writes =================
    ranked.forEach((u) => {
      const s = newStats[u];
      if (!changedStats) return;
      tx.set(statsRef(u), {
        season,
        game: game.id,
        uid: u,
        tag: tagOf(u),
        ...s,
        avgElims: B.statValue(s, 'avgElims'),
        updatedAt: Timestamp.fromDate(now),
      });
    });
    for (const b of boardsAfter) {
      tx.set(boardRef(b.stat), {
        season,
        game: game.id,
        stat: b.stat,
        entries: b.entries,
        updatedAt: Timestamp.fromDate(now),
      });
    }
    for (const r of recordWrites) {
      tx.set(recordRef(r.id), { ...r.doc, game: game.id, label: defs.find((d) => d.id === r.id)?.label ?? r.id });
    }

    badgeSnaps.forEach((snap, i) => {
      const uid = [...touched][i];
      const b = { ...((snap.data() as B.PlayerBadges | undefined) ?? {}) };
      const tiers = { ...B.currentTiers(b, liveSeason) };
      const inLiveSeason = season === liveSeason;
      if (inLiveSeason) {
        for (const t of tierMoves.filter((m) => m.change.uid === uid)) {
          const key = B.boardKey(game.id, t.stat);
          if (t.change.to) tiers[key] = t.change.to;
          else delete tiers[key];
        }
      }
      const crowns = { ...(b.crowns ?? {}) };
      for (const c of crownLose.filter((c) => c.uid === uid)) delete crowns[c.id];
      for (const c of crownGain.filter((c) => c.uid === uid)) crowns[c.id] = { label: c.label, value: c.value };
      const next: B.PlayerBadges = {
        ...b,
        gamerTag: uids.includes(uid) ? tagOf(uid) : (b.gamerTag ?? tierMoves.find((t) => t.change.uid === uid)?.change.tag),
        tiers,
        tiersSeason: liveSeason,
        crowns,
        trophies: b.trophies ?? [],
      };
      next.chip = B.chipFor(next, liveSeason);
      tx.set(badgeRefs[i], { ...next, updatedAt: Timestamp.fromDate(now) });
    });

    // Notifications: someone passed you out of a Prism / Neon / Gold spot, or beat your record.
    if (season === liveSeason) {
      for (const { stat, change } of tierMoves) {
        if (!change.takenBy || !change.from || B.tierValue(change.from) < B.tierValue('gold')) continue;
        notify(tx, db, change.uid, 'tier_lost', B.lostTierText(change.takenBy, change.from, game.name, stat), now);
      }
    }
    for (const c of crownLose) {
      if (c.by) notify(tx, db, c.uid, 'crown_lost', B.lostCrownText(c.by, c.label), now);
    }

    if (!reversal) {
      pairs.forEach(([a, b], i) => {
        tx.set(pairDayRefs[i], { day, a, b, count: pairCounts[i] });
        tx.set(pairRefs[i], {
          a,
          b,
          total: Number(pairSnaps[i].get('total') ?? 0) + 1,
          lastWinner: runs[i].w,
          run: runs[i].run,
        });
      });
      if (flags.length) {
        tx.set(db.collection('flags').doc(matchId), {
          matchId,
          game: game.id,
          gameName: game.name,
          players: uids.map((u) => ({ uid: u, gamerTag: tagOf(u) })),
          reasons: flags,
          counted,
          dismissed: false,
          createdAt: Timestamp.fromDate(now),
        });
      }
    }

    const stored: StoredEntry = {
      matchId,
      season,
      game: game.id,
      counted,
      players: addNow ?? {},
      records: reversal ? [] : recordIds,
    };
    tx.set(entryRef, { ...stored, reversed: reversal, updatedAt: Timestamp.fromDate(now) });
    return done(counted ? 'counted' : 'not-counted');
  });
}

// ---------- founders

/**
 * claimFounder(): called by the app once the player's email is verified.
 * Records when we first saw the verified email; once the one-off
 * "assign-founders" job has numbered the players who were already verified,
 * the next verified players get the next numbers, up to 100.
 */
export async function claimFounder(db: Firestore, uid: string, now = new Date()) {
  // Test accounts (frantzbenois+ addresses) never get a number.
  if (isTestEmail((await getAuth().getUser(uid)).email)) return { status: 'excluded' };
  return db.runTransaction(async (tx) => {
    const badgesRef = db.collection('badges').doc(uid);
    const metaRef = db.collection('meta').doc('founders');
    const claimRef = db.collection('founderClaims').doc(uid);
    const [badges, meta, claim, user] = await Promise.all([
      tx.get(badgesRef),
      tx.get(metaRef),
      tx.get(claimRef),
      tx.get(db.collection('users').doc(uid)),
    ]);
    if (user.get('excludeFromRankings') === true || isExcludedTag(user.get('gamerTag'))) return { status: 'excluded' };
    const b = (badges.data() as B.PlayerBadges | undefined) ?? {};
    if (b.founder) return { status: 'founder', number: b.founder.number };
    if (!claim.exists) tx.set(claimRef, { uid, verifiedAt: Timestamp.fromDate(now) });
    if (meta.get('backfillDone') !== true) return { status: 'pending' };
    const count = Number(meta.get('count') ?? 0);
    if (count >= B.FOUNDER_LIMIT) return { status: 'full' };
    const number = count + 1;
    tx.set(metaRef, { count: number, backfillDone: true }, { merge: true });
    writeFounder(tx, db, uid, b, number, now);
    return { status: 'founder', number };
  });
}

function writeFounder(tx: Transaction, db: Firestore, uid: string, b: B.PlayerBadges, number: number, now: Date) {
  const next: B.PlayerBadges = { ...b, founder: { number } };
  next.chip = B.chipFor(next, B.seasonOf(now));
  tx.set(db.collection('badges').doc(uid), { ...next, updatedAt: Timestamp.fromDate(now) });
  notify(tx, db, uid, 'founder', B.founderText(number), now);
}

/**
 * One-off (Maintenance → assign-founders): numbers the players whose email is
 * already verified, then lets new verified players claim the remaining
 * numbers. Founder #1 is reserved for the owner's account (Fire__4REAL,
 * frantzbenois@gmail.com). Then real players from #2, oldest first: when the
 * app first saw the verified email (founderClaims), or else the account's
 * sign-up date (Firebase doesn't record when an email was verified). Admin and
 * test accounts never get a number (the excludeFromRankings flag, a
 * frantzbenois+ address or the gamer tag GOD, even before the
 * exclude-test-accounts job has run). Safe to run again: existing founders
 * keep their numbers. The preview returns the planned order (gamer tags only).
 */
export async function assignFounders(db: Firestore, apply: boolean, now = new Date()) {
  const users: { uid: string; created: number; owner: boolean }[] = [];
  let skipped = 0;
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const owner = (u.email ?? '').toLowerCase() === OWNER_EMAIL;
      if (isTestEmail(u.email)) skipped++;
      else if (u.emailVerified || owner) users.push({ uid: u.uid, created: Date.parse(u.metadata.creationTime) || 0, owner });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  const claims = new Map(
    (await db.collection('founderClaims').get()).docs.map((d) => [d.id, (d.get('verifiedAt') as Timestamp).toMillis()]),
  );
  const profiles = users.length ? await db.getAll(...users.map((u) => db.collection('users').doc(u.uid))) : [];
  const profileOf = new Map(profiles.map((p) => [p.id, p]));
  const isExcluded = (uid: string, owner: boolean) => {
    if (owner) return false; // the owner always stays in
    const p = profileOf.get(uid);
    return p?.get('excludeFromRankings') === true || isExcludedTag(p?.get('gamerTag'));
  };
  const eligible = users.filter((u) => !isExcluded(u.uid, u.owner));
  skipped += users.length - eligible.length;
  const order = eligible
    .map((u) => ({ uid: u.uid, owner: u.owner, at: claims.get(u.uid) ?? u.created }))
    .sort((a, b) => Number(b.owner) - Number(a.owner) || a.at - b.at || (a.uid < b.uid ? -1 : 1));
  const tagOf = (uid: string) => String(profileOf.get(uid)?.get('gamerTag') ?? '(no profile yet)');

  if (!apply) {
    // Preview: the numbers as they would be given now (existing ones kept).
    const badgeSnaps = order.length ? await db.getAll(...order.map((u) => db.collection('badges').doc(u.uid))) : [];
    let count = Number((await db.collection('meta').doc('founders').get()).get('count') ?? 0);
    const planned: { number: number; gamerTag: string; already: boolean }[] = [];
    order.forEach((u, i) => {
      const have = (badgeSnaps[i].get('founder.number') as number | undefined) ?? 0;
      if (have) planned.push({ number: have, gamerTag: tagOf(u.uid), already: true });
      else if (count < B.FOUNDER_LIMIT) planned.push({ number: ++count, gamerTag: tagOf(u.uid), already: false });
    });
    planned.sort((a, b) => a.number - b.number);
    return {
      verified: users.length,
      excluded: skipped,
      assigned: planned.filter((p) => !p.already).length,
      already: planned.filter((p) => p.already).length,
      planned,
    };
  }
  let assigned = 0;
  let already = 0;
  for (const u of order) {
    const result = await db.runTransaction(async (tx) => {
      const metaRef = db.collection('meta').doc('founders');
      const [meta, badges] = await Promise.all([tx.get(metaRef), tx.get(db.collection('badges').doc(u.uid))]);
      const b = (badges.data() as B.PlayerBadges | undefined) ?? {};
      if (b.founder) return 'already';
      const count = Number(meta.get('count') ?? 0);
      if (count >= B.FOUNDER_LIMIT) return 'full';
      tx.set(metaRef, { count: count + 1 }, { merge: true });
      writeFounder(tx, db, u.uid, b, count + 1, now);
      return 'assigned';
    });
    if (result === 'already') already++;
    if (result === 'assigned') assigned++;
    if (result === 'full') break;
  }
  await db.collection('meta').doc('founders').set({ backfillDone: true }, { merge: true });
  return { verified: users.length, excluded: skipped, assigned, already, planned: [] };
}

// ---------- season end

/**
 * Closes a season (calendar month): every Prism holder (#1–10) of every
 * leaderboard gets a permanent trophy "Season N · Prism · game · stat".
 * The next season's leaderboards start empty (they use new documents).
 * Safe to run again (seasons/{season}.closed).
 */
export async function closeSeason(db: Firestore, season: string, now = new Date()): Promise<number> {
  const seasonRef = db.collection('seasons').doc(season);
  if ((await seasonRef.get()).get('closed') === true) return 0;
  let trophies = 0;
  for (const [gameId, stats] of Object.entries(B.BOARD_STATS)) {
    const game = getGame(gameId);
    if (!game) continue;
    for (const stat of stats) {
      const board = await db.collection('leaderboards').doc(B.boardDocId(season, gameId, stat)).get();
      const top = ((board.get('entries') ?? []) as B.BoardEntry[]).slice(0, B.PRISM_MAX_RANK);
      for (const e of top) {
        const trophy: B.Trophy = { season, game: gameId, stat, label: B.trophyLabel(season, game.name, stat) };
        await db.runTransaction(async (tx) => {
          const ref = db.collection('badges').doc(e.uid);
          const b = ((await tx.get(ref)).data() as B.PlayerBadges | undefined) ?? {};
          if ((b.trophies ?? []).some((t) => t.label === trophy.label)) return;
          tx.set(ref, { ...b, gamerTag: b.gamerTag ?? e.tag, trophies: [...(b.trophies ?? []), trophy], updatedAt: Timestamp.fromDate(now) });
          notify(tx, db, e.uid, 'trophy', B.trophyText(trophy.label), now);
        });
        trophies++;
      }
    }
  }
  await seasonRef.set({ closed: true, closedAt: Timestamp.fromDate(now), trophies });
  return trophies;
}

// ---------- admin: dismiss a flag

export async function dismissFlag(db: Firestore, uid: string, data: Record<string, unknown> | undefined | null) {
  const id = typeof data?.flagId === 'string' ? data.flagId : '';
  if (!id) throw fail('invalid-argument', 'Missing flag.');
  await requireAdmin(db, uid);
  const ref = db.collection('flags').doc(id);
  const snap: DocumentSnapshot = await ref.get();
  if (!snap.exists) throw fail('not-found', 'This flag doesn’t exist.');
  await ref.update({ dismissed: true, dismissedBy: uid, dismissedAt: FieldValue.serverTimestamp() });
  return { ok: true };
}
