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
import { fail, madridDay, matchReviewRef, type MatchDoc, type ReportDoc } from './matches/common';
import {
  holdReasons,
  isClean,
  loadAntiCheat,
  playerChecksRef,
  promotionTime,
  qualifiesForTop,
  readChecks,
  shouldWatch,
  type MatchReviewDoc,
  type PlayerChecks,
} from './antiCheat';
import {
  loadBoards,
  nextBadges,
  pendingPromotionRef,
  recompute,
  seasonPrivateRef,
  seasonStatsRef,
  toSeasonStats,
  writeBoards,
  type Change,
} from './boardEngine';

// Leaderboards, live rank tiers, crowns, founders, season trophies,
// notifications and anti-farming flags. Everything here is server-only:
// players can read boards, badges and their own notifications, never write
// them (see firestore.rules). Rules and texts: ./shared/badges.ts; hidden
// checks: ./antiCheat.ts; rows and tiers: ./boardEngine.ts.
//
// Collections (all written only here):
// - leaderboards/{season}_{game}_{stat}: the top 260 of a board (one read shows a board)
// - boardsPrivate/{id}: the hidden Neon / Prism ranking (server-only)
// - seasonStats/{season}_{game}_{uid}: a player's season totals (for "your position")
// - seasonPrivate/{id}: clean-only totals (server-only)
// - badges/{uid}: founder, crowns, live tiers, trophies and the chip shown by names
// - records/{game.kind}: all-time crowns (holder + a short history)
// - notifications/{uid}/items/{id}: tier / crown / trophy / founder messages
// - leaderboardEntries/{matchId}: what a match added (so a reversal can take it out)
// - leaderboardApplied/{reviewId}: marks a decision as counted (safe to run twice)
// - heldResults/{matchId}_{uid}: results held from the boards (admins)
// - playerChecks/{uid}, pendingPromotions/{id}, disqualified/{season}_{game}_{uid} (server-only)
// - pairDays/{day}_{a}_{b}, pairs/{a}_{b}: anti-farming counters; flags/{matchId}: for admins
// - founderClaims/{uid}, meta/founders, seasons/{season}

export type Players = Record<string, { tag: string; c: B.Contribution; clean?: boolean }>;
export type StoredEntry = {
  matchId: string;
  season: string;
  game: string;
  counted: boolean;
  players: Players;
  records: string[];
  held?: string[];
};

export type RecordCandidate = { id: string; label: string; value: number };

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export const disqualifiedRef = (db: Firestore, season: string, game: string, uid: string) =>
  db.collection('disqualified').doc(`${season}_${game}_${uid}`);

export function notify(tx: Transaction, db: Firestore, uid: string, type: string, text: string, now: Date) {
  tx.create(db.collection('notifications').doc(uid).collection('items').doc(), {
    type,
    text,
    read: false,
    createdAt: Timestamp.fromDate(now),
  });
}

/** Applies crown candidates to the record docs (pure); what changed hands. */
export function applyCrowns(
  defs: B.RecordDef[],
  docs: Record<string, B.RecordDoc | undefined>,
  cands: { uid: string; tag: string; id: string; value: number }[],
  matchId: string,
  now: number,
) {
  const writes: Record<string, B.RecordDoc> = {};
  const gain: { uid: string; id: string; label: string; value: number }[] = [];
  const lose: { uid: string; id: string; by: string | null; label: string }[] = [];
  for (const c of cands) {
    const def = defs.find((d) => d.id === c.id);
    if (!def) continue;
    const res = B.applyRecord(writes[c.id] ?? docs[c.id], { uid: c.uid, tag: c.tag, value: c.value, matchId, at: now });
    writes[c.id] = res.doc;
    if (res.newHolder) {
      gain.push({ uid: c.uid, id: c.id, label: def.label, value: c.value });
      if (res.previous && res.previous.uid !== c.uid) {
        lose.push({ uid: res.previous.uid, id: c.id, by: c.tag, label: def.label });
      }
    } else if (res.doc.holder?.uid === c.uid) {
      gain.push({ uid: c.uid, id: c.id, label: def.label, value: res.doc.holder.value });
    }
  }
  return { writes, gain, lose };
}

/**
 * Counts one admin_reviews document (a settlement, or a reversal of an
 * automatic decision) in the season stats, leaderboards, tiers and crowns.
 * One transaction; a second run does nothing (leaderboardApplied/{reviewId}).
 * - Admin / test accounts and disqualified players never count.
 * - Squad results above a limit or far above the player's own average are
 *   held (heldResults) until an admin releases them; the payout is not
 *   affected.
 * - Neon, Prism and crowns only use clean matches (photo read it, nothing
 *   edited) of players who pass the hidden checks (./antiCheat.ts).
 */
export async function applyReview(db: Firestore, reviewId: string, now = new Date()): Promise<string> {
  const anti = await loadAntiCheat(db); // (creates the secret salt the first time)
  const promoteAt = promotionTime(anti, now);
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
    const [matchSnap, entrySnap, checkSnap] = await Promise.all([
      tx.get(matchRef),
      tx.get(entryRef),
      tx.get(matchReviewRef(db, matchId)),
    ]);
    const match = matchSnap.data();
    if (!match) return done('no-match');
    const old = reversal ? (entrySnap.data() as StoredEntry | undefined) : undefined;
    if (reversal && !old) return done('nothing-to-reverse');

    const season = old?.season ?? B.seasonOf(now);
    const liveSeason = B.seasonOf(now);
    const uids = match.playerUids;
    const tagOf = (u: string) => match.players.find((p) => p.uid === u)?.gamerTag ?? 'Player';

    // Admin / test accounts and disqualified players never count; their
    // opponents' results still do.
    const [userSnaps, checkSnaps, dqSnaps] = await Promise.all([
      Promise.all(uids.map((u) => tx.get(db.collection('users').doc(u)))),
      Promise.all(uids.map((u) => tx.get(playerChecksRef(db, u)))),
      Promise.all(uids.map((u) => tx.get(disqualifiedRef(db, season, game.id, u)))),
    ]);
    const excluded = new Set(
      uids.filter((_, i) => userSnaps[i].get('excludeFromRankings') === true || dqSnaps[i].exists),
    );
    const ranked = uids.filter((u) => !excluded.has(u));
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
    // Clean: the photo check read these numbers itself and nothing was edited.
    const matchClean = !reversal && !!details && isClean(anti, checkSnap.data() as MatchReviewDoc | undefined);

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

    // ---- reads: season totals, boards, records, streaks, held results of a reversed match
    const defs = B.recordsFor(game.id, game.name);
    const recordRef = (id: string) => db.collection('records').doc(id);
    const heldRef = (u: string) => db.collection('heldResults').doc(`${matchId}_${u}`);
    const [statSnaps, privSnaps, recordSnaps, oldHeldSnaps] = await Promise.all([
      Promise.all(uids.map((u) => tx.get(seasonStatsRef(db, season, game.id, u)))),
      Promise.all(uids.map((u) => tx.get(seasonPrivateRef(db, season, game.id, u)))),
      Promise.all(defs.map((d) => tx.get(recordRef(d.id)))),
      Promise.all((old?.held ?? []).map((u) => tx.get(heldRef(u)))),
    ]);
    const boards = await loadBoards(tx, db, season, game.id);
    const streaks: Record<string, number> = {};
    if (!reversal && game.id === 'clash-royale' && winners.length === 1) {
      const ps = await tx.get(db.collection('playerStats').doc(winners[0]));
      streaks[winners[0]] = Number(ps.get(`games.${game.id}.streak`) ?? 0);
    }

    // ---- contributions: what this match adds (held ones wait for an admin),
    // and on a reversal what it added before
    const all = B.contributionsFor(game.resultKind, uids, winners, details);
    const idx = (u: string) => uids.indexOf(u);
    const before = (u: string) => toSeasonStats(statSnaps[idx(u)].data());
    const addNow: Players = {};
    const held: { uid: string; reasons: string[]; c: B.Contribution }[] = [];
    if (!cancelled && counted) {
      for (const u of ranked) {
        const reasons = !reversal && details ? holdReasons(anti, game.id, all[u], before(u)) : [];
        if (reasons.length) held.push({ uid: u, reasons, c: all[u] });
        else addNow[u] = { tag: tagOf(u), c: all[u], clean: matchClean };
      }
    }
    const takeOut: Players | null = old?.counted ? old.players : null;
    const heldIds = new Set(held.map((h) => h.uid));

    // ---- new totals and hidden checks
    const newStats: Record<string, B.SeasonStats> = {};
    const newClean: Record<string, B.SeasonStats> = {};
    const verifying: Record<string, number> = {};
    const checks: Record<string, PlayerChecks> = {};
    for (const u of uids) {
      const i = idx(u);
      let st = before(u);
      let cl = toSeasonStats(privSnaps[i].get('clean'));
      if (takeOut?.[u]) {
        st = B.addContribution(st, takeOut[u].c, -1);
        if (takeOut[u].clean) cl = B.addContribution(cl, takeOut[u].c, -1);
      }
      if (addNow[u]) {
        st = B.addContribution(st, addNow[u].c, 1);
        if (addNow[u].clean) cl = B.addContribution(cl, addNow[u].c, 1);
      }
      newStats[u] = st;
      newClean[u] = cl;
      const voided = oldHeldSnaps.filter((h) => h.get('uid') === u && h.get('status') === 'held').length;
      verifying[u] = Math.max(0, Number(statSnaps[i].get('verifying') ?? 0) + (heldIds.has(u) ? 1 : 0) - voided);

      const c = readChecks(checkSnaps[i].data(), season);
      if (!reversal && counted && !cancelled && !excluded.has(u)) {
        c.opponents = [...new Set([...c.opponents, ...uids.filter((x) => x !== u)])];
        if (addNow[u]?.clean) c.verifiedMatches += 1;
        if (heldIds.has(u)) c.held += 1;
      }
      if (reversal && takeOut?.[u]?.clean) c.verifiedMatches = Math.max(0, c.verifiedMatches - 1);
      c.watch = shouldWatch(anti, c);
      checks[u] = c;
    }
    const changes: Change[] = ranked.map((u) => ({
      uid: u,
      tag: tagOf(u),
      full: newStats[u],
      clean: newClean[u],
      qualified: qualifiesForTop(anti, u, checks[u]),
      verifying: verifying[u] > 0,
    }));
    const results = boards.map((b) => recompute(b, changes, { now: now.getTime(), delayPromotions: !!promoteAt }));
    const moves = results.flatMap((r) => r.moves);

    // ---- crowns: only clean results
    const recordDocs = Object.fromEntries(defs.map((d, i) => [d.id, recordSnaps[i].data() as B.RecordDoc | undefined]));
    let crownWrites: Record<string, B.RecordDoc> = {};
    let crownGain: { uid: string; id: string; label: string; value: number }[] = [];
    let crownLose: { uid: string; id: string; by: string | null; label: string }[] = [];
    let recordIds: string[] = [];
    if (reversal) {
      for (const id of old!.records ?? []) {
        const def = defs.find((d) => d.id === id);
        if (!def) continue;
        const doc = B.removeMatchFromRecord(recordDocs[id], matchId);
        crownWrites[id] = doc;
        if (recordDocs[id]?.holder?.uid !== doc.holder?.uid) {
          if (recordDocs[id]?.holder) crownLose.push({ uid: recordDocs[id]!.holder!.uid, id, by: null, label: def.label });
          if (doc.holder) crownGain.push({ uid: doc.holder.uid, id, label: def.label, value: doc.holder.value });
        }
      }
    } else if (details) {
      const cands = B.recordCandidates(defs, uids, winners, details, streaks, (u) => !!addNow[u]?.clean).map((c) => ({
        uid: c.uid,
        tag: tagOf(c.uid),
        id: c.def.id,
        value: c.value,
      }));
      const res = applyCrowns(defs, recordDocs, cands, matchId, now.getTime());
      crownWrites = res.writes;
      crownGain = res.gain;
      crownLose = res.lose;
      recordIds = Object.keys(res.writes);
    }
    // A held player's own crown candidates, applied if an admin releases the result.
    const heldCandidates = (u: string): RecordCandidate[] =>
      details && matchClean
        ? B.recordCandidates(defs, uids, winners, details, streaks, (x) => x === u).map((c) => ({
            id: c.def.id,
            label: c.def.label,
            value: c.value,
          }))
        : [];

    // ---- second round of reads (still before any write): badges, pending promotions
    const touched = [
      ...new Set([...uids, ...moves.map((m) => m.uid), ...crownGain.map((c) => c.uid), ...crownLose.map((c) => c.uid)]),
    ];
    const promos = results.flatMap((r) => r.promotions.map((uid) => ({ id: r.id, uid, stat: r.stat })));
    const [badgeSnaps, promoSnaps] = await Promise.all([
      Promise.all(touched.map((u) => tx.get(db.collection('badges').doc(u)))),
      Promise.all(promos.map((p) => tx.get(pendingPromotionRef(db, p.id, p.uid)))),
    ]);

    // ================= writes =================
    const nowTs = Timestamp.fromDate(now);
    for (const u of ranked) {
      const s = newStats[u];
      tx.set(seasonStatsRef(db, season, game.id, u), {
        season,
        game: game.id,
        uid: u,
        tag: tagOf(u),
        ...s,
        avgElims: B.statValue(s, 'avgElims'),
        verifying: verifying[u],
        updatedAt: nowTs,
      });
      tx.set(seasonPrivateRef(db, season, game.id, u), { season, game: game.id, uid: u, clean: newClean[u], updatedAt: nowTs });
    }
    writeBoards(tx, db, season, game.id, results, now);
    for (const [id, doc] of Object.entries(crownWrites)) {
      tx.set(recordRef(id), { ...doc, game: game.id, label: defs.find((d) => d.id === id)?.label ?? id });
    }
    touched.forEach((uid, i) => {
      const b = (badgeSnaps[i].data() as B.PlayerBadges | undefined) ?? {};
      const next = nextBadges(b, {
        game: game.id,
        liveSeason,
        season,
        moves: moves.filter((m) => m.uid === uid),
        crownsLost: crownLose.filter((c) => c.uid === uid).map((c) => c.id),
        crownsWon: crownGain.filter((c) => c.uid === uid),
        gamerTag: uids.includes(uid) ? tagOf(uid) : undefined,
      });
      tx.set(badgeSnaps[i].ref, { ...next, updatedAt: nowTs });
    });
    promos.forEach((p, i) => {
      if (promoSnaps[i].exists || !promoteAt) return;
      tx.set(promoSnaps[i].ref, {
        uid: p.uid,
        boardId: p.id,
        season,
        game: game.id,
        stat: p.stat,
        applyAt: Timestamp.fromDate(promoteAt),
        createdAt: nowTs,
      });
    });

    // Notifications: someone passed you out of a Prism / Neon / Gold spot, or beat your record.
    if (season === liveSeason) {
      for (const m of moves) {
        if (!m.takenBy || !m.from || B.tierValue(m.from) < B.tierValue('gold')) continue;
        notify(tx, db, m.uid, 'tier_lost', B.lostTierText(m.takenBy, m.from, game.name, m.stat), now);
      }
    }
    for (const c of crownLose) {
      if (c.by) notify(tx, db, c.uid, 'crown_lost', B.lostCrownText(c.by, c.label), now);
    }

    // Held results (admins release or reject them); a reversed match voids its held ones.
    for (const h of held) {
      tx.set(heldRef(h.uid), {
        matchId,
        uid: h.uid,
        gamerTag: tagOf(h.uid),
        game: game.id,
        gameName: game.name,
        season,
        contribution: h.c,
        clean: matchClean,
        candidates: heldCandidates(h.uid),
        reasons: h.reasons,
        status: 'held',
        createdAt: nowTs,
      });
    }
    for (const h of oldHeldSnaps) {
      if (h.get('status') === 'held') tx.update(h.ref, { status: 'void', updatedAt: nowTs });
    }
    uids.forEach((u) => tx.set(playerChecksRef(db, u), { ...checks[u], updatedAt: nowTs }, { merge: true }));

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
          createdAt: nowTs,
        });
      }
    }

    const stored: StoredEntry = {
      matchId,
      season,
      game: game.id,
      counted,
      players: addNow,
      records: reversal ? [] : recordIds,
      held: [...heldIds],
    };
    tx.set(entryRef, { ...stored, reversed: reversal, updatedAt: nowTs });
    return done(counted ? (held.length ? 'held' : 'counted') : 'not-counted');
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
      // Every row showing Prism (older rows without a stored tier: the top 10).
      const top = ((board.get('entries') ?? []) as B.BoardEntry[]).filter((e, i) =>
        e.tier !== undefined ? e.tier === 'prism' : i < B.PRISM_MAX_RANK,
      );
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
