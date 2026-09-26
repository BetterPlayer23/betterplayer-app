import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { registerSecret } from './safeLog';

// Sends email from Better.player.one@gmail.com through Gmail SMTP. The Gmail
// app password is the Firebase secret GMAIL_APP_PASSWORD (Secret Manager),
// never in code. In the emulator nothing is sent: the message is only built
// and saved in _emulator/mail_{to} so tests can read it.

export const MAIL_FROM = 'Better.player.one@gmail.com';
export const MAIL_FROM_NAME = 'Betterplayer';
// Value the deploy workflow stores when the real password hasn't been set yet.
export const SECRET_PLACEHOLDER = 'not-set';

export type Mail = { to: string; subject: string; text: string; html?: string };

const inEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

// True when mail can be sent (a real password, or the emulator).
export function mailConfigured(password: string | undefined | null): boolean {
  return inEmulator() || (!!password && password !== SECRET_PLACEHOLDER);
}

export async function sendMail(db: Firestore, mail: Mail, password: string): Promise<void> {
  registerSecret(password);
  // Loaded here, not at start-up, so the other functions don't pay for it.
  const nodemailer = (await import('nodemailer')).default;
  const transport = inEmulator()
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: { user: MAIL_FROM, pass: password },
        logger: false, // never log SMTP traffic (it includes the login)
        debug: false,
      });
  await transport.sendMail({ from: `${MAIL_FROM_NAME} <${MAIL_FROM}>`, ...mail });
  if (inEmulator()) {
    await db.doc(`_emulator/mail_${mail.to.toLowerCase()}`).set({ ...mail, at: FieldValue.serverTimestamp() });
  }
}
