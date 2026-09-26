import { useEffect, useState, useSyncExternalStore } from 'react';

// ---- "Resend email" cooldown (60 s), shared by every screen that can send a
// verification email. Firebase also limits how often it sends; the cooldown
// keeps players from hitting that limit and getting an error.

export const RESEND_COOLDOWN_S = 60;

let lastSentAt = 0;

export function markVerificationSent(at = Date.now()) {
  lastSentAt = at;
}

// Seconds until the player may ask for another email (0 = now). `since` is a
// time the email is known to have been sent (e.g. the account creation time).
export function useResendCooldown(since?: number): number {
  const [now, setNow] = useState(() => Date.now());
  const last = Math.max(lastSentAt, since ?? 0);
  const left = Math.max(0, Math.ceil((last + RESEND_COOLDOWN_S * 1000 - now) / 1000));
  useEffect(() => {
    if (left <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [left]);
  return left;
}

// ---- A one-off message shown on the next screen (e.g. "Email verified" on
// Home after the link was opened).

let flash: string | null = null;
const listeners = new Set<() => void>();

export function setFlash(message: string) {
  flash = message;
  listeners.forEach((l) => l());
}

export function clearFlash() {
  flash = null;
  listeners.forEach((l) => l());
}

export function useFlash(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => flash,
    () => null,
  );
}
