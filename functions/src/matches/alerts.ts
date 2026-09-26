import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { REVIEW_REASON_LABELS } from '../antiCheat';
import { describeOutcome, describeResult, winnersOf, type Verification } from '../shared/games';
import { MAIL_FROM, SECRET_PLACEHOLDER, sendMail } from '../mailer';
import { registerSecret } from '../safeLog';
import { matchReviewRef, type DisputeDoc, type MatchDoc, type ReportDoc } from './common';

// What the alert needs from matchReview/{matchId} (older matches: the match).
export type ReviewInfo = { reasonLabels?: string[]; verification?: Verification; editLabels?: string[] };

export const ALERT_FROM = MAIL_FROM;
export const ALERT_TO = 'frantzbenois+admin@gmail.com';
export const APP_URL = 'https://betterplayer23.github.io/betterplayer-app/';
export { SECRET_PLACEHOLDER };

export type AlertEmail = { subject: string; text: string };

// The email an admin gets when a match needs review.
export function buildAlert(
  match: MatchDoc,
  report: ReportDoc | undefined,
  dispute: DisputeDoc | undefined,
  review: ReviewInfo = {},
): AlertEmail {
  const players = match.players.map((p) => p.gamerTag).join(', ');
  const lines = [
    'A match needs review.',
    '',
    `Why: ${
      (review.reasonLabels ?? (match.reviewReasons ?? []).map((r) => REVIEW_REASON_LABELS[r as keyof typeof REVIEW_REASON_LABELS] ?? r)).join(', ') ||
      REVIEW_REASON_LABELS.not_checked
    }`,
    `Game: ${match.gameName}`,
    `Players: ${players}`,
    `Reported result: ${report ? describeOutcome(winnersOf(report), match.players) : 'no report'}`,
    `Score: ${report ? describeResult(report.details, match.players) : '—'}`,
    `Disputed: ${match.disputed ? 'yes' : 'no'}`,
  ];
  const v = review.verification ?? match.verification;
  lines.push(
    v
      ? `Automatic check: ${v.status} (confidence ${Number(v.confidence).toFixed(2)}) – ${v.reason}`
      : 'Automatic check: not run',
  );
  for (const e of review.editLabels ?? []) lines.push(`Changed after the photo check: ${e}`);
  if (dispute) lines.push(`Dispute by ${dispute.gamerTag}: ${dispute.reason}`);
  lines.push('', `Review it in the Admin tab: ${APP_URL}`);
  return { subject: `Review needed: ${match.gameName} match`, text: lines.join('\n') };
}

/**
 * Sends the review alert for a match that just became under_review, once.
 * adminAlerts/{matchId} records that it was sent (server-only collection).
 */
export async function sendReviewAlert(
  db: Firestore,
  matchId: string,
  match: MatchDoc,
  password: string,
): Promise<'sent' | 'already-sent' | 'not-configured'> {
  const alertRef = db.collection('adminAlerts').doc(matchId);
  if ((await alertRef.get()).exists) return 'already-sent';
  registerSecret(password);
  if (!password || password === SECRET_PLACEHOLDER) {
    logger.warn('Admin email alerts are off: set the GMAIL_APP_PASSWORD secret.', { matchId });
    return 'not-configured';
  }

  const ref = db.collection('matches').doc(matchId);
  const [reports, disputes, reviewSnap] = await Promise.all([
    ref.collection('reports').get(),
    ref.collection('disputes').get(),
    matchReviewRef(db, matchId).get(),
  ]);
  const report = (
    reports.docs.find((d) => d.id === match.reportedByUid) ?? reports.docs[0]
  )?.data() as ReportDoc | undefined;
  const dispute = disputes.docs[0]?.data() as DisputeDoc | undefined;
  const email = buildAlert(match, report, dispute, (reviewSnap.data() ?? {}) as ReviewInfo);

  await sendMail(db, { to: ALERT_TO, ...email }, password);

  await alertRef.set({
    matchId,
    to: ALERT_TO,
    subject: email.subject,
    sentAt: FieldValue.serverTimestamp(),
  });
  return 'sent';
}
