// Safe logging: never write secrets, API keys, passwords or whole error
// objects to the logs (errors from libraries can carry request settings,
// headers or credentials). Log `safeError(e)` instead of `e` or String(e).

import { HttpsError } from 'firebase-functions/https';
import { logger } from 'firebase-functions';

// Secret values known at run time (API key, app password). Blanked out of
// anything we log, in case a library repeats them in an error message.
const known = new Set<string>();

export function registerSecret(value: string | undefined | null) {
  const v = (value ?? '').trim();
  if (v.length >= 8 && v !== 'not-set') {
    known.add(v);
    known.add(v.replace(/\s/g, '')); // app passwords are shown with spaces
  }
}

const PATTERNS: [RegExp, string][] = [
  [/sk-ant-[A-Za-z0-9_-]+/g, '[api-key]'],
  [/-----BEGIN [A-Z ]*-----[\s\S]*?(-----END [A-Z ]*-----|$)/g, '[private-key]'],
  [/ya29\.[A-Za-z0-9._-]+/g, '[token]'],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [token]'],
  [/((?:x-api-key|authorization|api[_-]?key|password|pass|secret|token)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1[hidden]'],
  [/\b[A-Za-z0-9+/_-]{40,}={0,2}/g, '[long-value]'], // long key-like strings
];

export function redact(text: string): string {
  let out = text;
  for (const s of known) if (s) out = out.split(s).join('[secret]');
  for (const [re, to] of PATTERNS) out = out.replace(re, to);
  return out;
}

// A short, clean description of an error: its type, code/status and the
// first 300 characters of its message with secrets blanked. Nothing else.
export function safeError(e: unknown): { type: string; code?: string; status?: number; message: string } {
  const err = (e ?? {}) as { name?: unknown; code?: unknown; status?: unknown; message?: unknown };
  const out: { type: string; code?: string; status?: number; message: string } = {
    type: typeof err.name === 'string' ? err.name : typeof e,
    message: redact(String(err.message ?? (typeof e === 'string' ? e : ''))
      .split('\n')[0]
      .slice(0, 300)),
  };
  if (typeof err.code === 'string' || typeof err.code === 'number') out.code = redact(String(err.code));
  if (typeof err.status === 'number') out.status = err.status;
  return out;
}

export function logError(message: string, e: unknown, extra: Record<string, unknown> = {}) {
  logger.error(message, { ...extra, error: safeError(e) });
}

// For callable functions: plain-language errors (HttpsError) go to the app as
// they are; anything unexpected is logged safely and replaced with a generic
// error, so the Firebase library never logs the raw error object.
export async function guardCallable<T>(name: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logError(`${name} failed`, e);
    throw new HttpsError('internal', 'Something went wrong. Please try again.');
  }
}

// For triggers and schedules: log safely. With `rethrow` (functions that
// retry), a clean error without the original object is thrown instead.
export async function guardBackground(name: string, run: () => Promise<void>, rethrow = false) {
  try {
    await run();
  } catch (e) {
    logError(`${name} failed`, e);
    if (rethrow) throw new Error(`${name} failed (see the log entry above)`);
  }
}
