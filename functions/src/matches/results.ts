import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import {
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  NOTES_MAX,
  RESPONSE_MINUTES,
  autoReviewReasons,
  checkResult,
  getGame,
} from '../shared/games';
import { prepareSettlement, writeSettlement } from './admin';
import {
  fail,
  matchRef,
  requireString,
  type DisputeDoc,
  type MatchDoc,
  type ReportDoc,
} from './common';
import {
  checkDuplicate,
  imageHashDoc,
  imageHashRef,
  loadImage,
  readReviewConfig,
  reviewConfigRef,
  verifyResult,
  type LoadedImage,
} from './vision';

type Data = Record<string, unknown> | undefined | null;

// Uploaded images live at results/{matchId}/{uid}/{fileName} (see storage.rules).
// Checks the path, loads the image, and refuses it if it was uploaded outside
// the match (before it started, or after the response window) or if it is
// the same as, or nearly the same as, any earlier result image.
// Returns null when optional and not given.
async function checkUpload(
  db: Firestore,
  path: unknown,
  match: MatchDoc,
  matchId: string,
  uid: string,
  what: string,
  optional: boolean,
): Promise<{ image: LoadedImage; similarTo: string | null } | null> {
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
  let image: LoadedImage;
  try {
    image = await loadImage(path);
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as { code: unknown }).code === 404) {
      throw fail('failed-precondition', `That ${what} wasn’t found. Please add it again.`);
    }
    throw e;
  }
  const started = match.startedAt?.toMillis() ?? Infinity;
  if (image.uploadedAt.getTime() < started) {
    throw fail('failed-precondition', `That ${what} was uploaded before the match started. Take a new photo.`, {
      reason: 'too_early',
    });
  }
  const deadline = match.responseDeadline?.toMillis();
  if (deadline !== undefined && image.uploadedAt.getTime() > deadline) {
    throw fail('deadline-exceeded', `That ${what} was uploaded after the time to respond ran out.`, {
      reason: 'too_late',
    });
  }
  const similarTo = await checkDuplicate(db, image);
  return { image, similarTo };
}

/**
 * Moves a match to review, or settles it straight away when the automatic
 * check allows it (config/review.autoApprove on, no dispute, verification
 * "match" with enough confidence, no look-alike image): same settlement as an
 * admin's Approve, recorded with decidedBy "vision".
 * Does reads: call before any write in the transaction.
 */
async function moveToReview(
  tx: Transaction,
  db: Firestore,
  ref: DocumentReference<MatchDoc>,
  match: MatchDoc,
  disputed: boolean,
  now: Date,
  extra: Record<string, unknown> = {},
): Promise<() => void> {
  const config = readReviewConfig((await tx.get(reviewConfigRef(db))).data());
  const reasons = autoReviewReasons(config, disputed, match.verification);
  const nowTs = Timestamp.fromDate(now);
  if (!reasons.length) {
    // If anything looks wrong (e.g. a wallet out of step), an admin decides.
    const s = await prepareSettlement(tx, db, ref.id, { ...match, disputed }).catch((e) => {
      logger.error('Automatic approval not possible', { matchId: ref.id, error: String(e) });
      return null;
    });
    if (s?.report) {
      const v = match.verification!;
      return () =>
        writeSettlement(tx, db, s, {
          decision: 'approve',
          winnerUid: s.report!.winnerUid,
          decidedBy: 'vision',
          adminUid: null,
          note: `Approved automatically: ${v.reason} (confidence ${v.confidence.toFixed(2)})`,
          now,
          matchUpdate: { ...extra, disputed, reviewAt: nowTs, reviewReasons: [] },
        });
    }
    reasons.push('not_checked');
  }
  return () =>
    tx.update(ref, {
      ...extra,
      status: 'under_review',
      disputed,
      reviewAt: nowTs,
      reviewReasons: reasons,
      updatedAt: nowTs,
    });
}

// ---------- submitResult ----------

export async function submitResult(
  db: Firestore,
  uid: string,
  data: Data,
  now = new Date(),
  apiKey = '',
) {
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
  const ref = matchRef(db, matchId);
  const reportRef = ref.collection('reports').doc(uid);

  // Checks before the (slower) image checks, so a wrong form fails fast.
  const checkMatch = (match: MatchDoc | undefined, reported: boolean) => {
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (!match.playerUids.includes(uid)) {
      throw fail('permission-denied', 'Only players of this match can report the result.');
    }
    if (reported) throw fail('already-exists', 'You’ve already reported this result.');
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
    return { match, game, details: checked.details };
  };
  const [matchSnap, reportSnap] = await Promise.all([ref.get(), reportRef.get()]);
  const first = checkMatch(matchSnap.data(), reportSnap.exists);

  // Upload time, duplicates, then the automatic check (Claude vision).
  const upload = (await checkUpload(
    db,
    data?.screenshotPath,
    first.match,
    matchId,
    uid,
    'screenshot',
    false,
  ))!;
  const { verification, reading } = await verifyResult(db, {
    apiKey,
    game: first.game,
    match: first.match,
    report: { winnerUid, details: first.details },
    image: upload.image,
  });

  await db.runTransaction(async (tx) => {
    const [snap, existing] = await Promise.all([tx.get(ref), tx.get(reportRef)]);
    const { match, details } = checkMatch(snap.data(), existing.exists);
    const nowTs = Timestamp.fromDate(now);
    const byTag = (id: string) => match.players.find((p) => p.uid === id)?.gamerTag ?? 'Player';
    const report: ReportDoc = {
      uid,
      gamerTag: byTag(uid),
      winnerUid,
      winnerGamerTag: byTag(winnerUid),
      details,
      notes,
      screenshotPath: upload.image.path,
      imageHash: upload.image.hash,
      vision: reading,
      createdAt: nowTs,
    };
    tx.create(reportRef, report);
    tx.set(imageHashRef(db, `${matchId}_${uid}_report`), imageHashDoc(upload.image, matchId, uid, 'report'));
    tx.update(ref, {
      verification: {
        ...verification,
        similarTo: upload.similarTo,
        checkedAt: nowTs,
      },
      status: 'awaiting_result',
      reportedByUid: uid,
      reportedAt: nowTs,
      responseDeadline: Timestamp.fromMillis(now.getTime() + RESPONSE_MINUTES * 60_000),
      confirmedUids: [],
      updatedAt: nowTs,
    });
  });
  return { ok: true, verification: verification.status };
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
    const extra = { confirmedUids: FieldValue.arrayUnion(uid), updatedAt: nowTs };
    if (everyone) (await moveToReview(tx, db, ref, match, false, now, extra))();
    else tx.update(ref, extra);
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
  const ref = matchRef(db, matchId);
  const before = checkResponder((await ref.get()).data(), uid, now);
  const upload = await checkUpload(db, data?.evidencePath, before, matchId, uid, 'screenshot', true);
  const evidencePath = upload?.image.path ?? null;

  await db.runTransaction(async (tx) => {
    const match = checkResponder((await tx.get(ref)).data(), uid, now);
    const toReview = await moveToReview(tx, db, ref, match, true, now);
    const nowTs = Timestamp.fromDate(now);
    const dispute: DisputeDoc = {
      uid,
      gamerTag: match.players.find((p) => p.uid === uid)?.gamerTag ?? 'Player',
      reason,
      evidencePath,
      createdAt: nowTs,
    };
    tx.set(ref.collection('disputes').doc(uid), dispute);
    if (upload) {
      tx.set(imageHashRef(db, `${matchId}_${uid}_dispute`), imageHashDoc(upload.image, matchId, uid, 'dispute'));
    }
    toReview();
  });
  return { ok: true };
}

// ---------- deadline (scheduled) ----------

// Awaiting-result matches past the 30-minute deadline go to review (or are
// approved automatically): silence counts as confirmation. Returns how many
// were moved.
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
      (await moveToReview(tx, db, doc.ref as DocumentReference<MatchDoc>, match, false, now))();
      return true;
    }).catch((e) => {
      // One broken match must not hold up the others.
      logger.error('Couldn’t close the response window', { matchId: doc.id, error: String(e) });
      return false;
    });
    if (done) moved++;
  }
  return moved;
}
