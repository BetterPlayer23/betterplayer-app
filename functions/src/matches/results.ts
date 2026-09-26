import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  DISPUTE_REASON_MAX,
  DISPUTE_REASON_MIN,
  NOTES_MAX,
  RESPONSE_MINUTES,
  checkResult,
  winnersOf,
  getGame,
  type ResultDetails,
} from '../shared/games';
import {
  isClean,
  loadAntiCheat,
  playerChecksRef,
  reasonLabels,
  reviewReasons,
  type MatchReviewDoc,
} from '../antiCheat';
import { logError } from '../safeLog';
import { prepareSettlement, writeSettlement } from './admin';
import {
  fail,
  gameIdsOf,
  matchPrivateRef,
  matchRef,
  matchReviewRef,
  photoReadRef,
  requireString,
  type DisputeDoc,
  type MatchDoc,
  type ReportDoc,
} from './common';
import {
  checkDuplicate,
  editedFields,
  imageHashDoc,
  imageHashRef,
  loadImage,
  prefillFromReading,
  readPhoto,
  readReviewConfig,
  reviewConfigRef,
  verificationOf,
  type LoadedImage,
  type Prefill,
  type VisionReading,
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
 * check allows it (see reviewReasons in ../antiCheat): same settlement as an
 * admin's Approve, recorded with decidedBy "vision". The reasons are saved in
 * matchReview/{id} (admins only), never on the match players can read.
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
  const reviewRef = matchReviewRef(db, ref.id);
  const [configSnap, reviewSnap, ...checkSnaps] = await Promise.all([
    tx.get(reviewConfigRef(db)),
    tx.get(reviewRef),
    ...match.playerUids.map((u) => tx.get(playerChecksRef(db, u))),
  ]);
  const config = readReviewConfig(configSnap.data());
  const review = reviewSnap.data() as MatchReviewDoc | undefined;
  const watched = checkSnaps.some((c) => c.get('watch') === true);
  const reasons = reviewReasons(config, disputed, review, watched);
  const nowTs = Timestamp.fromDate(now);
  const saveReasons = (r: string[]) =>
    tx.set(reviewRef, { reviewReasons: r, reasonLabels: reasonLabels(r), updatedAt: nowTs }, { merge: true });
  if (!reasons.length) {
    // If anything looks wrong (e.g. a wallet out of step), an admin decides.
    const s = await prepareSettlement(tx, db, ref.id, { ...match, disputed }).catch((e) => {
      logError('Automatic approval not possible', e, { matchId: ref.id });
      return null;
    });
    if (s?.report) {
      const v = review!.verification!;
      return () => {
        saveReasons([]);
        writeSettlement(tx, db, s, {
          decision: 'approve',
          winnerUids: winnersOf(s.report!),
          decidedBy: 'vision',
          adminUid: null,
          note: `Approved automatically: ${v.reason} (confidence ${v.confidence.toFixed(2)})`,
          now,
          matchUpdate: { ...extra, disputed, reviewAt: nowTs },
        });
      };
    }
    reasons.push('not_checked');
  }
  return () => {
    saveReasons(reasons);
    tx.update(ref, {
      ...extra,
      status: 'under_review',
      disputed,
      reviewAt: nowTs,
      updatedAt: nowTs,
    });
  };
}

// Checks shared by readResultPhoto and submitResult.
function checkReporter(match: MatchDoc | undefined, uid: string, reported: boolean) {
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
  return { match, game };
}

// Photos read per player per match (each read calls the vision model).
const MAX_PHOTO_READS = 5;

// ---------- readResultPhoto (step 1 of the result form) ----------

/**
 * Reads the result photo before the player fills in the form, and returns
 * what it shows (winner and numbers, matched to the match's players) so the
 * form can be pre-filled. What was read is kept on the server and compared
 * with what the player finally submits.
 */
export async function readResultPhoto(
  db: Firestore,
  uid: string,
  data: Data,
  now = new Date(),
  apiKey = '',
) {
  const matchId = requireString(data?.matchId, 'match');
  const ref = matchRef(db, matchId);
  const readRef = photoReadRef(db, matchId, uid);
  const [matchSnap, reportSnap, privSnap, readSnap] = await Promise.all([
    ref.get(),
    ref.collection('reports').doc(uid).get(),
    matchPrivateRef(db, matchId).get(),
    readRef.get(),
  ]);
  const { match, game } = checkReporter(matchSnap.data(), uid, reportSnap.exists);
  const count = Number(readSnap.get('count') ?? 0);
  if (count >= MAX_PHOTO_READS) {
    throw fail('resource-exhausted', 'You’ve taken several photos already. Enter the result by hand.', {
      reason: 'too_many_reads',
    });
  }
  const upload = (await checkUpload(db, data?.screenshotPath, match, matchId, uid, 'photo', false))!;
  const read = await readPhoto(db, { apiKey, game, players: match.players.length, image: upload.image });
  const prefill = prefillFromReading(read.reading, game, match, gameIdsOf(match, privSnap.data()));
  await readRef.set({
    matchId,
    uid,
    path: upload.image.path,
    reading: read.reading,
    model: read.model,
    unavailable: read.unavailable,
    prefill,
    similarTo: upload.similarTo,
    count: count + 1,
    readAt: Timestamp.fromDate(now),
  });
  return prefill;
}

// ---------- submitResult (step 3 of the result form) ----------

const label = (match: MatchDoc, uid: string) => match.players.find((p) => p.uid === uid)?.gamerTag ?? 'Player';

// "Eliminations for Alpha: photo 7, entered 9" (for admins).
function describeEdits(match: MatchDoc, prefill: Prefill, report: { winnerUids: string[]; details: ResultDetails }, edited: string[]) {
  return edited.map((f) => {
    if (f === 'winner') {
      const names = (u: string[] | null) => (u && u.length ? u.map((x) => label(match, x)).join(' & ') : 'draw');
      return `Winner: photo ${names(prefill.winnerUids)}, entered ${names(report.winnerUids)}`;
    }
    const [key, uid] = f.split('.') as [keyof ResultDetails, string];
    const word = key[0].toUpperCase() + key.slice(1);
    return `${word} for ${label(match, uid)}: photo ${prefill.details[key]?.[uid]}, entered ${report.details[key]?.[uid]}`;
  });
}

export async function submitResult(
  db: Firestore,
  uid: string,
  data: Data,
  now = new Date(),
  apiKey = '',
) {
  const matchId = requireString(data?.matchId, 'match');
  if (data?.confirmReal !== true) {
    throw fail('invalid-argument', 'Tick “I confirm these numbers are real” first.');
  }
  const manual = data?.manual === true;
  // Needed for EA FC; Clash Royale and squads work it out from the numbers.
  const winnerUid = typeof data?.winnerUid === 'string' ? data.winnerUid : null;
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
    const { game } = checkReporter(match, uid, reported);
    const checked = checkResult(game, match!.playerUids, winnerUid, data?.details);
    if ('error' in checked) throw fail('invalid-argument', checked.error);
    return { match: match!, game, details: checked.details, winners: checked.winners };
  };
  const [matchSnap, reportSnap, privSnap, readSnap] = await Promise.all([
    ref.get(),
    reportRef.get(),
    matchPrivateRef(db, matchId).get(),
    photoReadRef(db, matchId, uid).get(),
  ]);
  const first = checkMatch(matchSnap.data(), reportSnap.exists);
  const gameIds = gameIdsOf(first.match, privSnap.data());
  const submitted = { winnerUids: first.winners, details: first.details };

  // Upload time, duplicates, then the automatic check (Claude vision). The
  // photo read in step 1 is reused (same file): no second read.
  const upload = (await checkUpload(db, data?.screenshotPath, first.match, matchId, uid, 'screenshot', false))!;
  const earlier = readSnap.exists && readSnap.get('path') === upload.image.path ? readSnap.data()! : null;
  const read = earlier
    ? {
        reading: (earlier.reading ?? null) as VisionReading | null,
        model: String(earlier.model ?? ''),
        unavailable: (earlier.unavailable ?? null) as string | null,
      }
    : await readPhoto(db, { apiKey, game: first.game, players: first.match.players.length, image: upload.image });
  const verification = verificationOf(read, first.game, first.match, submitted, gameIds);
  const prefill: Prefill = earlier
    ? (earlier.prefill as Prefill)
    : prefillFromReading(read.reading, first.game, first.match, gameIds);
  // Edited = changed after the player saw the pre-filled numbers (step 1).
  // Without that step a difference is simply a mismatch.
  const edited = manual || !earlier ? [] : editedFields(prefill, submitted);
  const anti = await loadAntiCheat(db);

  await db.runTransaction(async (tx) => {
    const [snap, existing] = await Promise.all([tx.get(ref), tx.get(reportRef)]);
    const { match, details, winners } = checkMatch(snap.data(), existing.exists);
    const nowTs = Timestamp.fromDate(now);
    const report: ReportDoc = {
      uid,
      gamerTag: label(match, uid),
      winnerUid: winners.length === 1 ? winners[0] : null,
      winnerUids: winners,
      winnerGamerTag: winners.length ? winners.map((w) => label(match, w)).join(' & ') : null,
      draw: !winners.length,
      details,
      notes,
      screenshotPath: upload.image.path,
      imageHash: upload.image.hash,
      createdAt: nowTs,
    };
    const review: MatchReviewDoc = {
      verification: { ...verification, similarTo: upload.similarTo },
      edited,
      manual,
    };
    tx.create(reportRef, report);
    tx.set(imageHashRef(db, `${matchId}_${uid}_report`), imageHashDoc(upload.image, matchId, uid, 'report'));
    tx.set(matchReviewRef(db, matchId), {
      matchId,
      reporterUid: uid,
      verification: { ...review.verification, checkedAt: nowTs },
      reading: read.reading,
      prefill,
      edited,
      editLabels: describeEdits(match, prefill, { winnerUids: winners, details }, edited),
      manual,
      clean: isClean(anti, review),
      createdAt: nowTs,
      updatedAt: nowTs,
    });
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
      logError('Couldn’t close the response window', e, { matchId: doc.id });
      return false;
    });
    if (done) moved++;
  }
  return moved;
}
