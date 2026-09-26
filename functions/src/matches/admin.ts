import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  ADMIN_NOTE_MAX,
  ADMIN_NOTE_MIN,
  ENTRY_CREDITS,
  REPUTATION_COMPLETED,
  REPUTATION_PENALTY,
  REVERSAL_HOURS,
  feeRateOf,
  matchMoney,
  round2,
  splitWinnings,
  winnersOf,
} from '../shared/games';
import { removeResult, statsForMatch, type GameStats, type StatsEntry } from '../shared/stats';
import { antiCheatRef, readAntiCheat, type MatchReviewDoc } from '../antiCheat';
import { fail, matchRef, matchReviewRef, requireString, type MatchDoc, type ReportDoc } from './common';

// ---------- player stats (playerStats/{uid}, statsEntries/{matchId}; server-only writes)

const statsRef = (db: Firestore, uid: string) => db.collection('playerStats').doc(uid);
const statsEntryRef = (db: Firestore, matchId: string) =>
  db.collection('statsEntries').doc(matchId);

function writeStats(
  tx: Transaction,
  db: Firestore,
  match: MatchDoc,
  matchId: string,
  changes: Record<string, { stats: GameStats; entry?: StatsEntry }>,
) {
  for (const [uid, c] of Object.entries(changes)) {
    tx.set(
      statsRef(db, uid),
      {
        gamerTag: match.players.find((p) => p.uid === uid)?.gamerTag ?? 'Player',
        games: { [match.game]: c.stats },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  tx.set(statsEntryRef(db, matchId), {
    matchId,
    game: match.game,
    players: Object.fromEntries(
      Object.entries(changes).flatMap(([uid, c]) => (c.entry ? [[uid, c.entry]] : [])),
    ),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

const gameStatsOf = (snap: FirebaseFirestore.DocumentSnapshot, game: string) =>
  snap.get(`games.${game}`) as GameStats | undefined;

type Data = Record<string, unknown> | undefined | null;
export type Decision = 'approve' | 'override' | 'cancel_refund';
const DECISIONS: Decision[] = ['approve', 'override', 'cancel_refund'];

export async function requireAdmin(db: Firestore, uid: string) {
  const admin = await db.collection('admins').doc(uid).get();
  if (!admin.exists) throw fail('permission-denied', 'Only Betterplayer admins can do that.');
}

function readNote(data: Data): string {
  const note = typeof data?.note === 'string' ? data.note.trim() : '';
  if (note.length < ADMIN_NOTE_MIN || note.length > ADMIN_NOTE_MAX) {
    throw fail(
      'invalid-argument',
      `Add a note of ${ADMIN_NOTE_MIN} to ${ADMIN_NOTE_MAX} characters.`,
    );
  }
  return note;
}

// ---------- settlement (shared by adminDecide and automatic approval)

export type Settlement = Awaited<ReturnType<typeof prepareSettlement>>;

/** Reads everything a settlement needs. Call before any write in the transaction. */
export async function prepareSettlement(
  tx: Transaction,
  db: Firestore,
  matchId: string,
  match: MatchDoc,
) {
  const ref = matchRef(db, matchId);
  const reviewRef = db.collection('admin_reviews').doc(matchId);
  const [reviewSnap, reportSnap, disputesSnap, statsEntrySnap, checkSnap, antiSnap] = await Promise.all([
    tx.get(reviewRef),
    tx.get(ref.collection('reports').doc(match.reportedByUid || '_')),
    tx.get(ref.collection('disputes')),
    tx.get(statsEntryRef(db, matchId)),
    tx.get(matchReviewRef(db, matchId)),
    tx.get(antiCheatRef(db)),
  ]);
  if (reviewSnap.exists) throw fail('failed-precondition', 'This match has already been decided.');

  const rows = await Promise.all(
    match.playerUids.map(async (p) => {
      const refs = {
        wallet: db.collection('wallets').doc(p),
        lock: db.collection('ledger').doc(`lock_${matchId}_${p}`),
        settle: db.collection('ledger').doc(`settle_${matchId}_${p}`),
        reputation: db.collection('reputation').doc(p),
        stats: statsRef(db, p),
      };
      const [wallet, lock, settle, reputation, stats] = await Promise.all([
        tx.get(refs.wallet),
        tx.get(refs.lock),
        tx.get(refs.settle),
        tx.get(refs.reputation),
        tx.get(refs.stats),
      ]);
      return { uid: p, refs, wallet, lock, settle, reputation, stats };
    }),
  );
  for (const r of rows) {
    if (!r.lock.exists) {
      throw fail('failed-precondition', 'This match’s entries were never locked. Check it by hand.');
    }
    if (!r.settle.exists && Number(r.wallet.get('locked') ?? 0) < ENTRY_CREDITS) {
      throw fail('failed-precondition', 'A wallet is out of step with its entries. Check it by hand.');
    }
  }
  return {
    matchId,
    match,
    ref,
    reviewRef,
    report: reportSnap.data() as ReportDoc | undefined,
    disputerUids: disputesSnap.docs.map((d) => d.id),
    statsCounted: statsEntrySnap.exists,
    // The photo check (older matches kept it on the match itself).
    check: (checkSnap.data() as MatchReviewDoc | undefined) ?? { verification: match.verification },
    spotCheckRate: readAntiCheat(antiSnap.data()).spotCheckRate,
    rows,
  };
}

// What each player gets back into "available" from a settled match:
// a refund gives everyone their entry back; otherwise the winners share the
// rest of the pot and the others get nothing. Used to settle and to reverse.
type Outcome = { refund: true } | { refund: false; winners: string[] };

function creditsFor(match: MatchDoc, outcome: Outcome): Record<string, number> {
  const out: Record<string, number> = {};
  const shares = outcome.refund
    ? {}
    : splitWinnings(match.players.length, outcome.winners, feeRateOf(match));
  for (const p of match.playerUids) out[p] = outcome.refund ? ENTRY_CREDITS : (shares[p] ?? 0);
  return out;
}

const feeFor = (match: MatchDoc, outcome: Outcome) =>
  outcome.refund ? 0 : matchMoney(match.players.length, feeRateOf(match)).fee;

const tagsOf = (match: MatchDoc, uids: string[]) =>
  uids.map((u) => match.players.find((p) => p.uid === u)?.gamerTag ?? 'Player').join(' & ');

/**
 * Writes a settlement in the same transaction:
 * - every player's 2 locked credits are released (ledger settle_{matchId}_{uid});
 * - approve/override with winners: the winners share pot − fee equally (the
 *   match's own fee rate: 10% now, 20% for older matches)
 *   ("winnings"; one winner takes it all), everyone else gets "stake_lost",
 *   the fee goes to platform_ledger/{matchId}; reputation +1 per player, −5
 *   for an overridden report or a rejected dispute;
 * - approve with no winners (a Clash Royale draw): every entry is refunded,
 *   no fee, the match counts as completed;
 * - cancel_refund: each player's 2 credits go back to available ("refund").
 * Fixed document ids make it safe to run twice.
 */
export function writeSettlement(
  tx: Transaction,
  db: Firestore,
  s: Settlement,
  opts: {
    decision: Decision;
    winnerUids: string[];
    decidedBy: 'admin' | 'vision';
    adminUid: string | null;
    note: string;
    now: Date;
    matchUpdate?: Record<string, unknown>; // extra fields for the match
  },
) {
  const { match, matchId, report } = s;
  const { decision } = opts;
  const cancelled = decision === 'cancel_refund';
  const winners = cancelled ? [] : opts.winnerUids;
  const draw = !cancelled && winners.length === 0;
  const outcome: Outcome = cancelled || draw ? { refund: true } : { refund: false, winners };
  const credits = creditsFor(match, outcome);
  const money = matchMoney(match.players.length, feeRateOf(match));
  const nowTs = Timestamp.fromDate(opts.now);
  const reporterUid = match.reportedByUid ?? '';
  const penalised = new Set<string>();
  if (decision === 'approve') s.disputerUids.forEach((d) => penalised.add(d)); // dispute rejected
  if (decision === 'override' && reporterUid) penalised.add(reporterUid); // report overridden
  const split = winners.length > 1 ? ` (shared by ${winners.length})` : '';

  for (const r of s.rows) {
    if (r.settle.exists) continue; // already settled for this player
    let entry: { type: string; amount: number; description: string };
    if (outcome.refund) {
      entry = {
        type: 'refund',
        amount: ENTRY_CREDITS,
        description: draw
          ? `Refund: ${match.gameName} match was a draw`
          : `Refund: ${match.gameName} match cancelled`,
      };
    } else if (winners.includes(r.uid)) {
      entry = {
        type: 'winnings',
        amount: credits[r.uid],
        description: `Winnings: ${match.gameName} match${split}`,
      };
    } else {
      entry = {
        type: 'stake_lost',
        amount: ENTRY_CREDITS,
        description: `Entry lost: ${match.gameName} match`,
      };
    }
    tx.create(r.refs.settle, {
      uid: r.uid,
      type: entry.type,
      amount: entry.amount,
      // Effect on the wallet, so balances can be rebuilt from the ledger.
      availableDelta: credits[r.uid],
      lockedDelta: -ENTRY_CREDITS,
      matchId,
      game: match.game,
      description: entry.description,
      createdAt: FieldValue.serverTimestamp(),
    });
    const available = Number(r.wallet.get('available') ?? 0);
    const locked = Number(r.wallet.get('locked') ?? 0); // checked in prepareSettlement
    tx.set(
      r.refs.wallet,
      {
        available: round2(available + credits[r.uid]),
        locked: round2(locked - ENTRY_CREDITS),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (!cancelled) {
      const rep = r.reputation.data() ?? {};
      const lost = penalised.has(r.uid);
      tx.set(r.refs.reputation, {
        points: Number(rep.points ?? 0) + REPUTATION_COMPLETED + (lost ? REPUTATION_PENALTY : 0),
        matchesCompleted: Number(rep.matchesCompleted ?? 0) + 1,
        disputesLost: Number(rep.disputesLost ?? 0) + (lost ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  if (!outcome.refund) {
    tx.set(db.collection('platform_ledger').doc(matchId), {
      matchId,
      game: match.game,
      players: match.players.length,
      pot: money.pot,
      fee: money.fee,
      winnerUids: winners,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  // Stats: every settled match except a cancel & refund (a draw counts).
  if (!cancelled && !s.statsCounted) {
    const current = Object.fromEntries(s.rows.map((r) => [r.uid, gameStatsOf(r.stats, match.game)]));
    writeStats(tx, db, match, matchId, statsForMatch(matchId, match.playerUids, winners, credits, current));
  }

  tx.create(s.reviewRef, {
    matchId,
    game: match.game,
    gameName: match.gameName,
    decidedBy: opts.decidedBy,
    adminUid: opts.adminUid,
    decision,
    winner: winners.length === 1 ? winners[0] : null,
    winners,
    draw,
    winnerGamerTag: winners.length ? tagsOf(match, winners) : null,
    reportedWinner: report?.winnerUid ?? null,
    reportedWinners: report ? winnersOf(report) : null,
    disputed: !!match.disputed,
    players: match.players.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag })),
    ...(s.check.verification && {
      verification: {
        status: s.check.verification.status,
        confidence: s.check.verification.confidence,
        reason: s.check.verification.reason,
      },
    }),
    note: opts.note,
    createdAt: nowTs,
  });

  // Spot checks: a random share of settled matches goes to admins anyway.
  if (!cancelled && Math.random() < s.spotCheckRate) {
    tx.set(db.collection('spotChecks').doc(matchId), {
      matchId,
      game: match.game,
      gameName: match.gameName,
      players: match.players.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag })),
      reporterUid: match.reportedByUid ?? null,
      decidedBy: opts.decidedBy,
      status: 'open',
      createdAt: nowTs,
    });
  }

  tx.update(s.ref, {
    ...opts.matchUpdate,
    status: cancelled ? 'cancelled' : 'completed',
    decision,
    decidedBy: opts.decidedBy,
    winnerUid: winners.length === 1 ? winners[0] : FieldValue.delete(),
    winnerUids: winners,
    draw,
    ...(cancelled && { cancelReason: 'admin_refund', cancelledAt: nowTs }),
    settledAt: nowTs,
    updatedAt: nowTs,
  });
}

// ---------- adminDecide

/**
 * adminDecide: approve the reported result (a winner, a tie or a draw),
 * override it with one winner, or cancel and refund. Settles the match in
 * ONE transaction (see writeSettlement). Safe to call twice: a decided match
 * is no longer under_review, and every write uses a fixed document id.
 */
export async function adminDecide(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = requireString(data?.matchId, 'match');
  const decision = data?.decision as Decision;
  if (!DECISIONS.includes(decision)) throw fail('invalid-argument', 'Choose a decision.');
  const note = readNote(data);
  await requireAdmin(db, uid);

  const ref = matchRef(db, matchId);
  return db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    // An admin never judges their own match: another admin must review it.
    if (match.playerUids.includes(uid)) {
      throw fail('permission-denied', "You can't review a match you played in");
    }
    if (match.status !== 'under_review') {
      throw fail(
        'failed-precondition',
        match.status === 'completed' || match.status === 'cancelled'
          ? 'This match has already been decided.'
          : 'Only matches under review can be decided.',
      );
    }
    const s = await prepareSettlement(tx, db, matchId, match);

    let winnerUids: string[] = [];
    if (decision === 'approve') {
      if (!s.report)
        throw fail('failed-precondition', 'There’s no report to approve. Override instead.');
      winnerUids = winnersOf(s.report);
    } else if (decision === 'override') {
      const chosen = typeof data?.winnerUid === 'string' ? data.winnerUid : '';
      if (!match.playerUids.includes(chosen)) throw fail('invalid-argument', 'Choose the winner.');
      const reported = s.report ? winnersOf(s.report) : null;
      if (reported && reported.length === 1 && reported[0] === chosen) {
        throw fail('invalid-argument', 'That’s the reported winner: use Approve instead.');
      }
      winnerUids = [chosen];
    }

    writeSettlement(tx, db, s, { decision, winnerUids, decidedBy: 'admin', adminUid: uid, note, now });
    return {
      status: decision === 'cancel_refund' ? 'cancelled' : 'completed',
      winnerUids: decision === 'cancel_refund' ? [] : winnerUids,
    };
  });
}

// ---------- reverseAutoDecision

/**
 * Reverses a match settled automatically (decidedBy "vision"), within 24
 * hours: pick the correct single winner ("override") or cancel & refund.
 * Old ledger entries are never changed: for each player, a new entry
 * (reverse_{matchId}_{uid}) adds the difference between what they got and
 * what they should have got, in ONE transaction with the wallets. A fee
 * difference goes to platform_ledger/{matchId}_reversal. Recorded in
 * admin_reviews/{matchId}_reversal. Can happen once.
 */
export async function reverseAutoDecision(
  db: Firestore,
  uid: string,
  data: Data,
  now = new Date(),
) {
  const matchId = requireString(data?.matchId, 'match');
  const decision = data?.decision;
  if (decision !== 'override' && decision !== 'cancel_refund') {
    throw fail('invalid-argument', 'Choose the correct winner or cancel & refund.');
  }
  const note = readNote(data);
  await requireAdmin(db, uid);

  const ref = matchRef(db, matchId);
  const reviewRef = db.collection('admin_reviews').doc(matchId);
  const reversalRef = db.collection('admin_reviews').doc(`${matchId}_reversal`);
  return db.runTransaction(async (tx) => {
    const [matchSnap, reviewSnap, reversalSnap, statsEntrySnap] = await Promise.all([
      tx.get(ref),
      tx.get(reviewRef),
      tx.get(reversalRef),
      tx.get(statsEntryRef(db, matchId)),
    ]);
    const match = matchSnap.data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (match.playerUids.includes(uid)) {
      throw fail('permission-denied', "You can't review a match you played in");
    }
    if (reversalSnap.exists || match.reversedAt) {
      throw fail('failed-precondition', 'This decision has already been reversed.');
    }
    if (reviewSnap.get('decidedBy') !== 'vision' || match.status !== 'completed') {
      throw fail('failed-precondition', 'Only automatic decisions can be reversed.');
    }
    const settledAt = match.settledAt?.toMillis() ?? 0;
    if (now.getTime() - settledAt > REVERSAL_HOURS * 3600_000) {
      throw fail(
        'deadline-exceeded',
        `Automatic decisions can only be reversed within ${REVERSAL_HOURS} hours.`,
      );
    }

    const oldWinners = winnersOf(match);
    const before: Outcome = match.draw ? { refund: true } : { refund: false, winners: oldWinners };
    let after: Outcome;
    if (decision === 'override') {
      const chosen = typeof data?.winnerUid === 'string' ? data.winnerUid : '';
      if (!match.playerUids.includes(chosen)) throw fail('invalid-argument', 'Choose the winner.');
      if (!before.refund && oldWinners.length === 1 && oldWinners[0] === chosen) {
        throw fail('invalid-argument', 'That player already won this match.');
      }
      after = { refund: false, winners: [chosen] };
    } else {
      if (before.refund) throw fail('invalid-argument', 'Every entry was already refunded.');
      after = { refund: true };
    }
    const had = creditsFor(match, before);
    const should = creditsFor(match, after);

    const rows = await Promise.all(
      match.playerUids.map(async (p) => {
        const refs = {
          wallet: db.collection('wallets').doc(p),
          entry: db.collection('ledger').doc(`reverse_${matchId}_${p}`),
          reputation: db.collection('reputation').doc(p),
          stats: statsRef(db, p),
        };
        const [wallet, entry, reputation, stats] = await Promise.all([
          tx.get(refs.wallet),
          tx.get(refs.entry),
          tx.get(refs.reputation),
          tx.get(refs.stats),
        ]);
        return { uid: p, refs, wallet, entry, reputation, stats };
      }),
    );

    // ---- writes
    const money = matchMoney(match.players.length, feeRateOf(match));
    const nowTs = Timestamp.fromDate(now);
    const game = match.gameName;
    const newWinners = after.refund ? [] : after.winners;
    for (const r of rows) {
      const delta = round2(should[r.uid] - had[r.uid]);
      if (delta !== 0 && !r.entry.exists) {
        const plainRefund = after.refund && had[r.uid] === 0; // lost the entry, gets it back
        tx.create(r.refs.entry, {
          uid: r.uid,
          type: plainRefund ? 'refund' : 'correction',
          amount: delta,
          availableDelta: delta,
          lockedDelta: 0,
          matchId,
          game: match.game,
          description: after.refund
            ? plainRefund
              ? `Refund: ${game} match cancelled`
              : `Correction: ${game} match cancelled, entry returned`
            : newWinners.includes(r.uid)
              ? `Correction: you won this ${game} match`
              : `Correction: ${game} match winner changed`,
          reverses: `settle_${matchId}_${r.uid}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          r.refs.wallet,
          {
            available: round2(Number(r.wallet.get('available') ?? 0) + delta),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      const rep = r.reputation.data() ?? {};
      if (after.refund) {
        // The match no longer counts as completed.
        tx.set(r.refs.reputation, {
          points: Number(rep.points ?? 0) - REPUTATION_COMPLETED,
          matchesCompleted: Math.max(0, Number(rep.matchesCompleted ?? 0) - 1),
          disputesLost: Number(rep.disputesLost ?? 0),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (r.uid === match.reportedByUid) {
        // The report was wrong: same penalty as an overridden report.
        tx.set(r.refs.reputation, {
          points: Number(rep.points ?? 0) + REPUTATION_PENALTY,
          matchesCompleted: Number(rep.matchesCompleted ?? 0),
          disputesLost: Number(rep.disputesLost ?? 0) + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Stats: take the old result out, then count the corrected one (a cancel
    // & refund doesn't count at all).
    const oldEntries = (statsEntrySnap.get('players') ?? {}) as Record<string, StatsEntry>;
    const base = Object.fromEntries(
      rows.map((r) => {
        const cur = gameStatsOf(r.stats, match.game);
        const old = oldEntries[r.uid];
        return [r.uid, old ? removeResult(cur, matchId, old) : cur];
      }),
    );
    if (after.refund) {
      writeStats(
        tx,
        db,
        match,
        matchId,
        Object.fromEntries(Object.entries(base).flatMap(([u, st]) => (st ? [[u, { stats: st }]] : []))),
      );
    } else {
      writeStats(tx, db, match, matchId, statsForMatch(matchId, match.playerUids, newWinners, should, base));
    }

    // A fee difference is a new platform entry (the old one is never changed).
    const feeDelta = round2(feeFor(match, after) - feeFor(match, before));
    if (feeDelta !== 0) {
      tx.set(db.collection('platform_ledger').doc(`${matchId}_reversal`), {
        matchId,
        game: match.game,
        players: match.players.length,
        pot: feeDelta > 0 ? money.pot : -money.pot,
        fee: feeDelta,
        reverses: matchId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    tx.create(reversalRef, {
      matchId,
      game: match.game,
      gameName: match.gameName,
      decidedBy: 'admin',
      adminUid: uid,
      decision,
      reverses: matchId,
      previousWinners: before.refund ? [] : oldWinners,
      winner: newWinners[0] ?? null,
      winners: newWinners,
      winnerGamerTag: newWinners.length ? tagsOf(match, newWinners) : null,
      reportedWinner: reviewSnap.get('reportedWinner') ?? null,
      disputed: false,
      players: match.players.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag })),
      note,
      createdAt: nowTs,
    });

    tx.update(ref, {
      status: after.refund ? 'cancelled' : 'completed',
      decision,
      decidedBy: 'admin',
      winnerUid: newWinners.length === 1 ? newWinners[0] : FieldValue.delete(),
      winnerUids: newWinners,
      draw: false,
      ...(after.refund && { cancelReason: 'admin_refund', cancelledAt: nowTs }),
      reversedAt: nowTs,
      updatedAt: nowTs,
    });

    return { status: after.refund ? 'cancelled' : 'completed', winnerUids: newWinners };
  });
}
