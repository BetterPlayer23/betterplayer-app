import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import nodemailer from 'nodemailer';

import { REVIEW_REASON_LABELS, describeOutcome, describeResult, winnersOf } from '../shared/games';
import type { DisputeDoc, MatchDoc, ReportDoc } from './common';

export const ALERT_FROM = 'Better.player.one@gmail.com';
export const ALERT_TO = 'frantzbenois+admin@gmail.com';
export const APP_URL = 'https://betterplayer23.github.io/betterplayer-app/';
// Value the deploy workflow stores when the real password hasn't been set yet.
export const SECRET_PLACEHOLDER = 'not-set';

export type AlertEmail = { subject: string; text: string };

// The email an admin gets when a match needs review.
export function buildAlert(
  match: MatchDoc,
  report: ReportDoc | undefined,
  dispute: DisputeDoc | undefined,
): AlertEmail {
  const players = match.players.map((p) => p.gamerTag).join(', ');
  const lines = [
    'A match needs review.',
    '',
    `Why: ${
      (match.reviewReasons ?? []).map((r) => REVIEW_REASON_LABELS[r] ?? r).join(', ') ||
      REVIEW_REASON_LABELS.not_checked
    }`,
    `Game: ${match.gameName}`,
    `Players: ${players}`,
    `Reported result: ${report ? describeOutcome(winnersOf(report), match.players) : 'no report'}`,
    `Score: ${report ? describeResult(report.details, match.players) : '—'}`,
    `Disputed: ${match.disputed ? 'yes' : 'no'}`,
  ];
  const v = match.verification;
  lines.push(
    v
      ? `Automatic check: ${v.status} (confidence ${Number(v.confidence).toFixed(2)}) – ${v.reason}`
      : 'Automatic check: not run',
  );
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
  if (!password || password === SECRET_PLACEHOLDER) {
    logger.warn('Admin email alerts are off: set the GMAIL_APP_PASSWORD secret.', { matchId });
    return 'not-configured';
  }

  const ref = db.collection('matches').doc(matchId);
  const [reports, disputes] = await Promise.all([
    ref.collection('reports').get(),
    ref.collection('disputes').get(),
  ]);
  const report = (
    reports.docs.find((d) => d.id === match.reportedByUid) ?? reports.docs[0]
  )?.data() as ReportDoc | undefined;
  const dispute = disputes.docs[0]?.data() as DisputeDoc | undefined;
  const email = buildAlert(match, report, dispute);

  // In the emulator nothing is really sent: the message is only built.
  const transport =
    process.env.FUNCTIONS_EMULATOR === 'true'
      ? nodemailer.createTransport({ jsonTransport: true })
      : nodemailer.createTransport({
          service: 'gmail',
          auth: { user: ALERT_FROM, pass: password },
        });
  await transport.sendMail({ from: `Betterplayer <${ALERT_FROM}>`, to: ALERT_TO, ...email });

  await alertRef.set({
    matchId,
    to: ALERT_TO,
    subject: email.subject,
    sentAt: FieldValue.serverTimestamp(),
  });
  return 'sent';
}
