// Form checks with plain-language messages. Each returns an error message,
// or null when the value is fine. The same limits are enforced in firestore.rules.
import type { GameIdKey } from './profile';

export function checkEmail(email: string): string | null {
  if (!email.trim()) return 'Enter your email.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
    return 'That email doesn’t look right. Check for typos.';
  }
  return null;
}

export function checkPassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  return null;
}

export function checkGamerTag(tag: string): string | null {
  const t = tag.trim();
  if (t.length < 3 || t.length > 20) return 'Gamer tag must be 3 to 20 characters.';
  if (!/^[A-Za-z0-9_]+$/.test(t)) return 'Use only letters, numbers and underscores (_).';
  return null;
}

export function checkPlatforms(platforms: string[]): string | null {
  return platforms.length ? null : 'Choose at least one platform.';
}

export function checkAge(confirmed: boolean): string | null {
  return confirmed ? null : 'You must confirm you are 18 or older and live in Spain.';
}

export const GAME_ID_MAX = 40;

// Cleans up a game ID before saving. Clash Royale tags are stored as "#ABC123".
export function normalizeGameId(key: GameIdKey, value: string): string {
  const v = value.trim();
  if (key === 'clashRoyaleTag' && v) return `#${v.replace(/^#/, '').toUpperCase()}`;
  return v;
}

export function checkGameId(key: GameIdKey, value: string): string | null {
  const v = normalizeGameId(key, value);
  if (!v) return null; // optional
  if (v.length > GAME_ID_MAX) return `Keep it under ${GAME_ID_MAX} characters.`;
  if (key === 'clashRoyaleTag' && !/^#[0289PYLQGRJCUV]{3,14}$/.test(v)) {
    return 'Clash Royale tags use only 0 2 8 9 P Y L Q G R J C U V, like #2PYLQ.';
  }
  return null;
}
