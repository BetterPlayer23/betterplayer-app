import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  ADMIN_NOTE_MAX,
  ADMIN_NOTE_MIN,
  ENTRY_CREDITS,
  REPUTATION_COMPLETED,
  REPUTATION_PENALTY,
  matchMoney,
  round2,
} from '../shared/games';
import { fail, matchRef, requireString, type ReportDoc } from './common';

type Data = Record<string, unknown> | undefined | null;
export type Decision = 'approve' | 'override' | 'cancel_refund';
const DECISIONS: Decision[] = ['approve', 'override', 'cancel_refund'];

export async function requireAdmin(db: Firestore, uid: string) {
  const admin = await db.collection('admins').doc(uid).get();
  if (!admin.exists) throw fail('permission-denied', 'Only Betterplayer admins can do that.');
}

/**
 * adminDecide: approve the reported winner, override it, or cancel and refund.
 * Settles the match in ONE transaction:
 * - every player's 2 locked credits are released (ledger settle_{matchId}_{uid});
 * - approve/override: the winner gets pot − 20% fee into available ("winnings"),
 *   each loser gets a "stake_lost" entry, the fee goes to platform_ledger/{matchId},
 *   reputation +1 per player, −5 for an overridden report or a rejected dispute;
 * - cancel_refund: each player's 2 credits go back to available ("refund").
 * Safe to call twice: a decided match is no longer under_review, and every
 * write uses a fixed document id.
 */
export async function adminDecide(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = requireString(data?.matchId, 'match');
  const decision = data?.decision as Decision;
  if (!DECISIONS.includes(decision)) throw fail('invalid-argument', 'Choose a decision.');
  const note = typeof data?.note === 'string' ? data.note.trim() : '';
  if (note.length < ADMIN_NOTE_MIN || note.length > ADMIN_NOTE_MAX) {
    throw fail(
      'invalid-argument',
      `Add a note of ${ADMIN_NOTE_MIN} to ${ADMIN_NOTE_MAX} characters.`,
    );
  }
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
    const reviewRef = db.collection('admin_reviews').doc(matchId);
    const reporterUid = match.reportedByUid ?? '';

    // ---- reads (all before writes)
    const [reviewSnap, reportSnap, disputesSnap] = await Promise.all([
      tx.get(reviewRef),
      tx.get(ref.collection('reports').doc(reporterUid || '_')),
      tx.get(ref.collection('disputes')),
    ]);
    if (reviewSnap.exists)
      throw fail('failed-precondition', 'This match has already been decided.');
    const report = reportSnap.data() as ReportDoc | undefined;

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

    // ---- work out the winner
    let winnerUid: string | null = null;
    if (decision === 'approve') {
      if (!report)
        throw fail('failed-precondition', 'There’s no report to approve. Override instead.');
      winnerUid = report.winnerUid;
    } else if (decision === 'override') {
      const chosen = typeof data?.winnerUid === 'string' ? data.winnerUid : '';
      if (!match.playerUids.includes(chosen)) throw fail('invalid-argument', 'Choose the winner.');
      if (report && chosen === report.winnerUid) {
        throw fail('invalid-argument', 'That’s the reported winner: use Approve instead.');
      }
      winnerUid = chosen;
    }

    for (const r of rows) {
      if (!r.lock.exists) {
        throw fail(
          'failed-precondition',
          'This match’s entries were never locked. Check it by hand.',
        );
      }
    }

    const money = matchMoney(match.players.length);
    const nowTs = Timestamp.fromDate(now);
    const disputerUids = disputesSnap.docs.map((d) => d.id);
    const penalised = new Set<string>();
    if (decision === 'approve') disputerUids.forEach((d) => penalised.add(d)); // dispute rejected
    if (decision === 'override' && reporterUid) penalised.add(reporterUid); // report overridden

    // ---- writes
    for (const r of rows) {
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
      const locked = Number(r.wallet.get('locked') ?? 0);
      if (locked < ENTRY_CREDITS) {
        throw fail(
          'failed-precondition',
          'A wallet is out of step with its entries. Check it by hand.',
        );
      }
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

    tx.create(reviewRef, {
      matchId,
      game: match.game,
      gameName: match.gameName,
      adminUid: uid,
      decision,
      winner: winnerUid,
      winnerGamerTag: match.players.find((p) => p.uid === winnerUid)?.gamerTag ?? null,
      reportedWinner: report?.winnerUid ?? null,
      disputed: !!match.disputed,
      note,
      createdAt: nowTs,
    });

    tx.update(ref, {
      status: decision === 'cancel_refund' ? 'cancelled' : 'completed',
      decision,
      winnerUid: winnerUid ?? FieldValue.delete(),
      ...(decision === 'cancel_refund' && { cancelReason: 'admin_refund', cancelledAt: nowTs }),
      settledAt: nowTs,
      updatedAt: nowTs,
    });

    return { status: decision === 'cancel_refund' ? 'cancelled' : 'completed', winnerUid };
  });
}
