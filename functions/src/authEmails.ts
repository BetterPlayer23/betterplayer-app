import { createHash } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { mailConfigured, sendMail } from './mailer';
import { fail } from './matches/common';

// Verification and password-reset emails sent by us instead of Firebase: the
// project can't change Firebase's own email template (its action URL), so the
// links in Firebase's emails always open Firebase's page. Ours link to the
// in-app page instead: {ACTION_URL}?mode=…&oobCode=… (src/app/auth/action.tsx).

export const ACTION_URL = 'https://betterplayer23.github.io/betterplayer-app/auth/action';

// Per player (verification) or per email address (password reset).
export const EMAIL_PER_MINUTE = 1;
export const EMAIL_PER_HOUR = 5;

type Kind = 'verifyEmail' | 'resetPassword';

// Our link from the one Firebase generates (only its one-time code is kept).
export function actionLink(firebaseLink: string, mode: Kind): string {
  const code = new URL(firebaseLink).searchParams.get('oobCode');
  if (!code) throw new Error('No code in the generated link');
  return `${ACTION_URL}?mode=${mode}&oobCode=${encodeURIComponent(code)}`;
}

/**
 * At most 1 email a minute and 5 an hour per key, counted in emailSends/{key}
 * (server-only). Throws a plain "wait" error when over the limit; otherwise
 * records this send.
 */
async function takeSlot(db: Firestore, key: string, now: Date) {
  const ref = db.collection('emailSends').doc(key);
  await db.runTransaction(async (tx) => {
    const times = ((await tx.get(ref)).get('times') ?? []) as Timestamp[];
    const hourAgo = now.getTime() - 3600_000;
    const recent = times.map((t) => t.toMillis()).filter((t) => t > hourAgo);
    const last = Math.max(0, ...recent);
    if (now.getTime() - last < 60_000 / EMAIL_PER_MINUTE) {
      throw fail('resource-exhausted', 'We just sent you an email. Wait a minute before asking for another.', {
        reason: 'email_rate_minute',
      });
    }
    if (recent.length >= EMAIL_PER_HOUR) {
      throw fail('resource-exhausted', 'Too many emails in the last hour. Try again later.', {
        reason: 'email_rate_hour',
      });
    }
    tx.set(ref, { times: [...recent, now.getTime()].map((t) => Timestamp.fromMillis(t)), updatedAt: Timestamp.fromDate(now) });
  });
}

// ---- the emails (short, branded, English)

const BUTTON = 'display:inline-block;background:#22D3EE;color:#04121A;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:12px;font-family:Arial,sans-serif';

function layout(title: string, intro: string, button: string, link: string, outro: string): string {
  return `<!doctype html><html><body style="margin:0;background:#07080F;padding:24px 12px;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;background:#0E1120;border:1px solid #1c2133;border-radius:16px" cellpadding="0" cellspacing="0">
<tr><td style="padding:24px 24px 8px;font-size:24px;font-weight:800;font-style:italic;color:#FFFFFF">Better<span style="color:#22D3EE">player</span>
<span style="font-size:11px;font-style:normal;font-weight:700;color:#22D3EE;border:1px solid #22D3EE;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle">CLOSED BETA</span></td></tr>
<tr><td style="padding:8px 24px;font-size:20px;font-weight:700;color:#E6E9F2">${title}</td></tr>
<tr><td style="padding:0 24px 16px;font-size:15px;line-height:22px;color:#E6E9F2">${intro}</td></tr>
<tr><td style="padding:0 24px 16px"><a href="${link}" style="${BUTTON}">${button}</a></td></tr>
<tr><td style="padding:0 24px 8px;font-size:13px;line-height:19px;color:#A3ABBE">If the button doesn’t work, copy this link into your browser:<br><a href="${link}" style="color:#22D3EE;word-break:break-all">${link}</a></td></tr>
<tr><td style="padding:8px 24px 24px;font-size:13px;line-height:19px;color:#8B93A7">${outro}</td></tr>
</table>
<p style="font-size:12px;color:#8B93A7">Betterplayer closed beta · 18+ · Spain only · credits only, no real money</p>
</td></tr></table></body></html>`;
}

export function verificationEmail(to: string, link: string) {
  return {
    to,
    subject: 'Confirm your email for Betterplayer',
    text: `Welcome to the Betterplayer closed beta!\n\nConfirm your email to start playing:\n${link}\n\nThe link works once and expires after a while. If you didn't sign up, ignore this email.\n\n— Betterplayer`,
    html: layout(
      'Confirm your email',
      'Welcome to the Betterplayer closed beta! Tap the button to confirm this is your email and start playing.',
      'Confirm my email',
      link,
      'The link works once and expires after a while. If you didn’t sign up for Betterplayer, you can ignore this email.',
    ),
  };
}

export function passwordResetEmail(to: string, link: string) {
  return {
    to,
    subject: 'Reset your Betterplayer password',
    text: `Someone (hopefully you) asked to reset your Betterplayer password.\n\nChoose a new password here:\n${link}\n\nThe link works once and expires in about an hour. If you didn't ask, ignore this email: your password stays the same.\n\n— Betterplayer`,
    html: layout(
      'Reset your password',
      'Someone (hopefully you) asked to reset your Betterplayer password. Tap the button to choose a new one.',
      'Choose a new password',
      link,
      'The link works once and expires in about an hour. If you didn’t ask for this, ignore this email: your password stays the same.',
    ),
  };
}

// The result the app acts on. `sent: false` = our email is switched off
// (no Gmail password yet): the app then asks Firebase to send its own email.
export type EmailResult = { sent: boolean; alreadyVerified?: boolean };

const notConfigured = (): EmailResult => {
  logger.warn('Our own account emails are off: set the GMAIL_APP_PASSWORD secret.');
  return { sent: false };
};

/** sendVerificationEmail(): to the signed-in player's own address. */
export async function sendVerificationEmail(
  db: Firestore,
  uid: string,
  password: string,
  now = new Date(),
): Promise<EmailResult> {
  const user = await getAuth().getUser(uid);
  if (!user.email) throw fail('failed-precondition', 'Your account has no email address.');
  if (user.emailVerified) return { sent: false, alreadyVerified: true };
  if (!mailConfigured(password)) return notConfigured();
  await takeSlot(db, `verify_${uid}`, now);
  const link = actionLink(await getAuth().generateEmailVerificationLink(user.email), 'verifyEmail');
  await sendMail(db, verificationEmail(user.email, link), password);
  return { sent: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * sendPasswordResetEmail({ email }): no sign-in needed ("Forgot password?").
 * Always answers the same way whether or not an account uses the address, so
 * it can't be used to find out who plays.
 */
export async function sendPasswordResetEmail(
  db: Firestore,
  data: Record<string, unknown> | undefined | null,
  password: string,
  now = new Date(),
): Promise<EmailResult> {
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 120) {
    throw fail('invalid-argument', 'That email doesn’t look right. Check for typos.');
  }
  if (!mailConfigured(password)) return notConfigured();
  // Counted per address (stored as a fingerprint, not the address itself).
  await takeSlot(db, `reset_${createHash('sha256').update(email).digest('hex')}`, now);
  let firebaseLink: string;
  try {
    firebaseLink = await getAuth().generatePasswordResetLink(email);
  } catch (e) {
    const code = (e as { code?: unknown })?.code;
    if (code === 'auth/user-not-found' || code === 'auth/email-not-found') return { sent: true };
    throw e;
  }
  await sendMail(db, passwordResetEmail(email, actionLink(firebaseLink, 'resetPassword')), password);
  return { sent: true };
}
