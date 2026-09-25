import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  NOTES_MAX,
  RESPONSE_MINUTES,
  checkResult,
  getGame,
} from '../shared/games';
import {
  fail,
  matchRef,
  requireString,
  type DisputeDoc,
  type MatchDoc,
  type ReportDoc,
} from './common';

type Data = Record<string, unknown> | undefined | null;

// Uploaded images live at results/{matchId}/{uid}/{fileName} (see storage.rules).
// Returns the checked path, or null when optional and not given.
async function checkUpload(
  path: unknown,
  matchId: string,
  uid: string,
  what: string,
  optional: boolean,
): Promise<string | null> {
  if (path === undefined || path === null || path === '') {
    if (optional) return null;
    throw fail('invalid-argument', `Add a ${what}.`);
  }
  const prefix = `results/${matchId}/${uid}/`;
  if (
    typeof path !== 'string' ||
    !path.startsWith(prefix) ||
    path.length <= prefix.length ||
    path.slice(prefix.length).includes('/') ||
    path.includes('..')
  ) {
    throw fail('invalid-argument', `That ${what} wasn’t uploaded correctly. Please add it again.`);
  }
  const [exists] = await getStorage().bucket().file(path).exists();
  if (!exists) {
    throw fail('failed-precondition', `That ${what} wasn’t found. Please add it again.`);
  }
  return path;
}

// ---------- submitResult ----------

export async function submitResult(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = requireString(data?.matchId, 'match');
  const winnerUid = requireString(data?.winnerUid, 'winner');
  let notes: string | null = null;
  if (data?.notes !== undefined && data.notes !== null) {
    if (typeof data.notes !== 'string') throw fail('invalid-argument', 'Invalid notes.');
    notes = data.notes.trim() || null;
    if (notes && notes.length > NOTES_MAX) {
      throw fail('invalid-argument', `Keep notes under ${NOTES_MAX} characters.`);
    }
  }
  const screenshotPath = await checkUpload(data?.screenshotPath, matchId, uid, 'screenshot', false);

  const ref = matchRef(db, matchId);
  const reportRef = ref.collection('reports').doc(uid);
  await db.runTransaction(async (tx) => {
    const [snap, existing] = await Promise.all([tx.get(ref), tx.get(reportRef)]);
    const match = snap.data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (!match.playerUids.includes(uid)) {
      throw fail('permission-denied', 'Only players of this match can report the result.');
    }
    if (existing.exists) throw fail('already-exists', 'You’ve already reported this result.');
    if (match.status !== 'started') {
      throw fail(
        'failed-precondition',
        match.status === 'awaiting_result'
          ? 'A result has already been reported. Confirm or dispute it instead.'
          : 'Results can only be reported while the match is being played.',
      );
    }
    const game = getGame(match.game);
    if (!game) throw fail('failed-precondition', 'This game is no longer available.');
    const checked = checkResult(game, match.playerUids, winnerUid, data?.details);
    if ('error' in checked) throw fail('invalid-argument', checked.error);

    const nowTs = Timestamp.fromDate(now);
    const byTag = (id: string) => match.players.find((p) => p.uid === id)?.gamerTag ?? 'Player';
    const report: ReportDoc = {
      uid,
      gamerTag: byTag(uid),
      winnerUid,
      winnerGamerTag: byTag(winnerUid),
      details: checked.details,
      notes,
      screenshotPath: screenshotPath as string,
      createdAt: nowTs,
    };
    tx.create(reportRef, report);
    tx.update(ref, {
      status: 'awaiting_result',
      reportedByUid: uid,
      reportedAt: nowTs,
      responseDeadline: Timestamp.fromMillis(now.getTime() + RESPONSE_MINUTES * 60_000),
      confirmedUids: [],
      updatedAt: nowTs,
    });
  });
  return { ok: true };
}

// Shared checks for confirm and dispute: another player, before the deadline.
function checkResponder(match: MatchDoc | undefined, uid: string, now: Date): MatchDoc {
  if (!match) throw fail('not-found', 'This match doesn’t exist.');
  if (!match.playerUids.includes(uid)) {
    throw fail('permission-denied', 'Only players of this match can do that.');
  }
  if (match.status !== 'awaiting_result') {
    throw fail(
      'failed-precondition',
      match.status === 'under_review' || match.status === 'completed'
        ? 'This result is already with a Betterplayer admin.'
        : 'There’s no result to respond to yet.',
    );
  }
  if (match.reportedByUid === uid) {
    throw fail('failed-precondition', 'You reported this result, so the other players respond.');
  }
  if (!match.responseDeadline || match.responseDeadline.toMillis() <= now.getTime()) {
    throw fail('deadline-exceeded', 'The time to respond has run out. An admin will check it.');
  }
  return match;
}

// ---------- confirmResult ----------

export async function confirmResult(db: Firestore, uid: string, data: Data, now = new Date()) {
  const ref = matchRef(db, requireString(data?.matchId, 'match'));
  await db.runTransaction(async (tx) => {
    const match = checkResponder((await tx.get(ref)).data(), uid, now);
    const confirmed = new Set([...(match.confirmedUids ?? []), uid]);
    const others = match.playerUids.filter((p) => p !== match.reportedByUid);
    const everyone = others.every((p) => confirmed.has(p));
    const nowTs = Timestamp.fromDate(now);
    tx.update(ref, {
      confirmedUids: FieldValue.arrayUnion(uid),
      ...(everyone && { status: 'under_review', disputed: false, reviewAt: nowTs }),
      updatedAt: nowTs,
    });
  });
  return { ok: true };
}

// ---------- disputeResult ----------

export async function disputeResult(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = requireString(data?.matchId, 'match');
  const reason = typeof data?.reason === 'string' ? data.reason.trim() : '';
  if (reason.length < DISPUTE_REASON_MIN || reason.length > DISPUTE_REASON_MAX) {
    throw fail(
      'invalid-argument',
      `Explain what’s wrong in ${DISPUTE_REASON_MIN} to ${DISPUTE_REASON_MAX} characters.`,
    );
  }
  const evidencePath = await checkUpload(data?.evidencePath, matchId, uid, 'screenshot', true);

  const ref = matchRef(db, matchId);
  await db.runTransaction(async (tx) => {
    const match = checkResponder((await tx.get(ref)).data(), uid, now);
    const nowTs = Timestamp.fromDate(now);
    const dispute: DisputeDoc = {
      uid,
      gamerTag: match.players.find((p) => p.uid === uid)?.gamerTag ?? 'Player',
      reason,
      evidencePath,
      createdAt: nowTs,
    };
    tx.set(ref.collection('disputes').doc(uid), dispute);
    tx.update(ref, { status: 'under_review', disputed: true, reviewAt: nowTs, updatedAt: nowTs });
  });
  return { ok: true };
}

// ---------- deadline (scheduled) ----------

// Awaiting-result matches past the 30-minute deadline go to review: silence
// counts as confirmation. Returns how many were moved.
export async function closeResponseWindows(db: Firestore, now = new Date()): Promise<number> {
  const nowTs = Timestamp.fromDate(now);
  const due = await db
    .collection('matches')
    .where('status', '==', 'awaiting_result')
    .where('responseDeadline', '<=', nowTs)
    .limit(200)
    .get();

  let moved = 0;
  for (const doc of due.docs) {
    const done = await db.runTransaction(async (tx) => {
      const match = (await tx.get(doc.ref)).data() as MatchDoc | undefined;
      if (
        !match ||
        match.status !== 'awaiting_result' ||
        !match.responseDeadline ||
        match.responseDeadline.toMillis() > now.getTime()
      ) {
        return false;
      }
      tx.update(doc.ref, {
        status: 'under_review',
        disputed: false,
        reviewAt: nowTs,
        updatedAt: nowTs,
      });
      return true;
    });
    if (done) moved++;
  }
  return moved;
}
