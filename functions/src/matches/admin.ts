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
  matchMoney,
  round2,
} from '../shared/games';
import { fail, matchRef, requireString, type MatchDoc, type ReportDoc } from './common';

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
  const [reviewSnap, reportSnap, disputesSnap] = await Promise.all([
    tx.get(reviewRef),
    tx.get(ref.collection('reports').doc(match.reportedByUid || '_')),
    tx.get(ref.collection('disputes')),
  ]);
  if (reviewSnap.exists) throw fail('failed-precondition', 'This match has already been decided.');

  const rows = await Promise.all(
    match.playerUids.map(async (p) => {
      const refs = {
        wallet: db.collection('wallets').doc(p),
        lock: db.collection('ledger').doc(`lock_${matchId}_${p}`),
        settle: db.collection('ledger').doc(`settle_${matchId}_${p}`),
        reputation: db.collection('reputation').doc(p),
      };
      const [wallet, lock, settle, reputation] = await Promise.all([
        tx.get(refs.wallet),
        tx.get(refs.lock),
        tx.get(refs.settle),
        tx.get(refs.reputation),
      ]);
      return { uid: p, refs, wallet, lock, settle, reputation };
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
    rows,
  };
}

/**
 * Writes a settlement in the same transaction:
 * - every player's 2 locked credits are released (ledger settle_{matchId}_{uid});
 * - approve/override: the winner gets pot − 20% fee into available ("winnings"),
 *   each loser gets a "stake_lost" entry, the fee goes to platform_ledger/{matchId},
 *   reputation +1 per player, −5 for an overridden report or a rejected dispute;
 * - cancel_refund: each player's 2 credits go back to available ("refund").
 * Fixed document ids make it safe to run twice.
 */
export function writeSettlement(
  tx: Transaction,
  db: Firestore,
  s: Settlement,
  opts: {
    decision: Decision;
    winnerUid: string | null;
    decidedBy: 'admin' | 'vision';
    adminUid: string | null;
    note: string;
    now: Date;
    matchUpdate?: Record<string, unknown>; // extra fields for the match
  },
) {
  const { match, matchId, report } = s;
  const { decision, winnerUid } = opts;
  const money = matchMoney(match.players.length);
  const nowTs = Timestamp.fromDate(opts.now);
  const reporterUid = match.reportedByUid ?? '';
  const penalised = new Set<string>();
  if (decision === 'approve') s.disputerUids.forEach((d) => penalised.add(d)); // dispute rejected
  if (decision === 'override' && reporterUid) penalised.add(reporterUid); // report overridden

  for (const r of s.rows) {
    if (r.settle.exists) continue; // already settled for this player
    let entry: { type: string; amount: number; available: number; description: string };
    if (decision === 'cancel_refund') {
      entry = {
        type: 'refund',
        amount: ENTRY_CREDITS,
        available: ENTRY_CREDITS,
        description: `Refund: ${match.gameName} match cancelled`,
      };
    } else if (r.uid === winnerUid) {
      entry = {
        type: 'winnings',
        amount: money.winnerGets,
        available: money.winnerGets,
        description: `Winnings: ${match.gameName} match`,
      };
    } else {
      entry = {
        type: 'stake_lost',
        amount: ENTRY_CREDITS,
        available: 0,
        description: `Entry lost: ${match.gameName} match`,
      };
    }
    tx.create(r.refs.settle, {
      uid: r.uid,
      type: entry.type,
      amount: entry.amount,
      // Effect on the wallet, so balances can be rebuilt from the ledger.
      availableDelta: entry.available,
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
        available: round2(available + entry.available),
        locked: round2(locked - ENTRY_CREDITS),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    if (decision !== 'cancel_refund') {
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

  if (decision !== 'cancel_refund') {
    tx.set(db.collection('platform_ledger').doc(matchId), {
      matchId,
      game: match.game,
      players: match.players.length,
      pot: money.pot,
      fee: money.fee,
      winnerUid,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  tx.create(s.reviewRef, {
    matchId,
    game: match.game,
    gameName: match.gameName,
    decidedBy: opts.decidedBy,
    adminUid: opts.adminUid,
    decision,
    winner: winnerUid,
    winnerGamerTag: match.players.find((p) => p.uid === winnerUid)?.gamerTag ?? null,
    reportedWinner: report?.winnerUid ?? null,
    disputed: !!match.disputed,
    players: match.players.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag })),
    ...(match.verification && {
      verification: {
        status: match.verification.status,
        confidence: match.verification.confidence,
        reason: match.verification.reason,
      },
    }),
    note: opts.note,
    createdAt: nowTs,
  });

  tx.update(s.ref, {
    ...opts.matchUpdate,
    status: decision === 'cancel_refund' ? 'cancelled' : 'completed',
    decision,
    decidedBy: opts.decidedBy,
    winnerUid: winnerUid ?? FieldValue.delete(),
    ...(decision === 'cancel_refund' && { cancelReason: 'admin_refund', cancelledAt: nowTs }),
    settledAt: nowTs,
    updatedAt: nowTs,
  });
}

// ---------- adminDecide

/**
 * adminDecide: approve the reported winner, override it, or cancel and refund.
 * Settles the match in ONE transaction (see writeSettlement). Safe to call
 * twice: a decided match is no longer under_review, and every write uses a
 * fixed document id.
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

    let winnerUid: string | null = null;
    if (decision === 'approve') {
      if (!s.report)
        throw fail('failed-precondition', 'There’s no report to approve. Override instead.');
      winnerUid = s.report.winnerUid;
    } else if (decision === 'override') {
      const chosen = typeof data?.winnerUid === 'string' ? data.winnerUid : '';
      if (!match.playerUids.includes(chosen)) throw fail('invalid-argument', 'Choose the winner.');
      if (s.report && chosen === s.report.winnerUid) {
        throw fail('invalid-argument', 'That’s the reported winner: use Approve instead.');
      }
      winnerUid = chosen;
    }

    writeSettlement(tx, db, s, {
      decision,
      winnerUid,
      decidedBy: 'admin',
      adminUid: uid,
      note,
      now,
    });
    return { status: decision === 'cancel_refund' ? 'cancelled' : 'completed', winnerUid };
  });
}

// ---------- reverseAutoDecision

/**
 * Reverses a match approved automatically (decidedBy "vision"), within 24
 * hours: pick the correct winner ("override") or cancel & refund. Old ledger
 * entries are never changed; new "correction"/"refund" entries
 * (reverse_{matchId}_{uid}) move the credits, in ONE transaction with the
 * wallets. Recorded in admin_reviews/{matchId}_reversal. Can happen once.
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
    const [matchSnap, reviewSnap, reversalSnap] = await Promise.all([
      tx.get(ref),
      tx.get(reviewRef),
      tx.get(reversalRef),
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
      throw fail('deadline-exceeded', `Automatic decisions can only be reversed within ${REVERSAL_HOURS} hours.`);
    }
    const oldWinner = match.winnerUid ?? '';
    let newWinner: string | null = null;
    if (decision === 'override') {
      const chosen = typeof data?.winnerUid === 'string' ? data.winnerUid : '';
      if (!match.playerUids.includes(chosen)) throw fail('invalid-argument', 'Choose the winner.');
      if (chosen === oldWinner) throw fail('invalid-argument', 'That player already won this match.');
      newWinner = chosen;
    }

    const rows = await Promise.all(
      match.playerUids.map(async (p) => {
        const refs = {
          wallet: db.collection('wallets').doc(p),
          entry: db.collection('ledger').doc(`reverse_${matchId}_${p}`),
          reputation: db.collection('reputation').doc(p),
        };
        const [wallet, entry, reputation] = await Promise.all([
          tx.get(refs.wallet),
          tx.get(refs.entry),
          tx.get(refs.reputation),
        ]);
        return { uid: p, refs, wallet, entry, reputation };
      }),
    );

    // ---- writes
    const money = matchMoney(match.players.length);
    const nowTs = Timestamp.fromDate(now);
    const game = match.gameName;
    for (const r of rows) {
      let entry: { type: string; delta: number; description: string } | null = null;
      if (decision === 'override') {
        if (r.uid === oldWinner) {
          entry = {
            type: 'correction',
            delta: -money.winnerGets,
            description: `Correction: ${game} match winner changed`,
          };
        } else if (r.uid === newWinner) {
          entry = {
            type: 'correction',
            delta: money.winnerGets,
            description: `Correction: you won this ${game} match`,
          };
        }
      } else if (r.uid === oldWinner) {
        entry = {
          type: 'correction',
          delta: round2(ENTRY_CREDITS - money.winnerGets),
          description: `Correction: ${game} match cancelled, entry returned`,
        };
      } else {
        entry = {
          type: 'refund',
          delta: ENTRY_CREDITS,
          description: `Refund: ${game} match cancelled`,
        };
      }
      if (entry && !r.entry.exists) {
        tx.create(r.refs.entry, {
          uid: r.uid,
          type: entry.type,
          amount: entry.delta,
          availableDelta: entry.delta,
          lockedDelta: 0,
          matchId,
          game: match.game,
          description: entry.description,
          reverses: `settle_${matchId}_${r.uid}`,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(
          r.refs.wallet,
          {
            available: round2(Number(r.wallet.get('available') ?? 0) + entry.delta),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      const rep = r.reputation.data() ?? {};
      if (decision === 'cancel_refund') {
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

    if (decision === 'cancel_refund') {
      // The fee is given back: a new, negative platform entry.
      tx.set(db.collection('platform_ledger').doc(`${matchId}_reversal`), {
        matchId,
        game: match.game,
        players: match.players.length,
        pot: -money.pot,
        fee: -money.fee,
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
      previousWinner: oldWinner,
      winner: newWinner,
      winnerGamerTag: match.players.find((p) => p.uid === newWinner)?.gamerTag ?? null,
      reportedWinner: reviewSnap.get('reportedWinner') ?? null,
      disputed: false,
      players: match.players.map((p) => ({ uid: p.uid, gamerTag: p.gamerTag })),
      note,
      createdAt: nowTs,
    });

    tx.update(ref, {
      status: decision === 'cancel_refund' ? 'cancelled' : 'completed',
      decision,
      decidedBy: 'admin',
      winnerUid: newWinner ?? FieldValue.delete(),
      ...(decision === 'cancel_refund' && { cancelReason: 'admin_refund', cancelledAt: nowTs }),
      reversedAt: nowTs,
      updatedAt: nowTs,
    });

    return { status: decision === 'cancel_refund' ? 'cancelled' : 'completed', winnerUid: newWinner };
  });
}
