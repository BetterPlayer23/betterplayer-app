import { createHash, randomBytes } from 'node:crypto';

import type { Firestore, Transaction } from 'firebase-admin/firestore';

import type { SeasonStats } from './shared/badges';
import type { Verification } from './shared/games';

// Anti-cheat settings and checks. SERVER ONLY: nothing here may be imported
// by the app (the app's code is public), and no threshold may ever appear in
// a message, notification or rules text shown to players.
//
// The settings live in serverConfig/antiCheat (clients can't read it, admins
// included; the Admin tab shows it through getAntiCheatSettings).

export type AntiCheatSettings = {
  trustMatches: number; // clean, photo-verified matches before Neon / Prism
  diversityOpponents: number; // different opponents this season before Neon / Prism
  jitter: number; // ± random offset per player on the two above
  outlierMultiplier: number; // a match above N × the player's own average is held
  outlierMinMatches: number; // ... once they have this many matches this season
  caps: Record<string, { eliminations: number; damage: number }>; // per player per match
  topConfidence: number; // photo-check confidence needed for Neon / Prism / crowns
  spotCheckRate: number; // share of settled matches sent to admins anyway
  watchAfter: number; // held + rejected results before the watch flag
  promotionDelayMinutes: { min: number; max: number }; // 0 = promote at once
  autoThreshold: number; // default confidence for automatic approval (config/review)
  salt: string; // for the per-player offsets
};

const SQUAD_CAP = { eliminations: 30, damage: 8000 };

export const ANTI_CHEAT_DEFAULTS: Omit<AntiCheatSettings, 'salt'> = {
  trustMatches: 10,
  diversityOpponents: 5,
  jitter: 2,
  outlierMultiplier: 3,
  outlierMinMatches: 5,
  caps: { 'warzone-rebirth': SQUAD_CAP, fortnite: SQUAD_CAP, 'bf-redsec': SQUAD_CAP },
  topConfidence: 0.9,
  spotCheckRate: 0.05,
  watchAfter: 2,
  promotionDelayMinutes: { min: 60, max: 600 },
  autoThreshold: 0.9,
};

export const DEFAULT_VISION_MODEL = 'claude-sonnet-5';

export const antiCheatRef = (db: Firestore) => db.collection('serverConfig').doc('antiCheat');

const num = (v: unknown, fallback: number, min = 0, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function readAntiCheat(data: Record<string, unknown> | undefined): AntiCheatSettings {
  const d = ANTI_CHEAT_DEFAULTS;
  const caps = { ...d.caps };
  const rawCaps = (data?.caps ?? {}) as Record<string, Record<string, unknown>>;
  for (const [game, c] of Object.entries(rawCaps)) {
    caps[game] = {
      eliminations: num(c?.eliminations, caps[game]?.eliminations ?? SQUAD_CAP.eliminations, 1),
      damage: num(c?.damage, caps[game]?.damage ?? SQUAD_CAP.damage, 1),
    };
  }
  const delay = (data?.promotionDelayMinutes ?? {}) as Record<string, unknown>;
  const min = num(delay.min, d.promotionDelayMinutes.min, 0);
  return {
    trustMatches: num(data?.trustMatches, d.trustMatches, 0),
    diversityOpponents: num(data?.diversityOpponents, d.diversityOpponents, 0),
    jitter: Math.round(num(data?.jitter, d.jitter, 0, 10)),
    outlierMultiplier: num(data?.outlierMultiplier, d.outlierMultiplier, 1),
    outlierMinMatches: num(data?.outlierMinMatches, d.outlierMinMatches, 1),
    caps,
    topConfidence: num(data?.topConfidence, d.topConfidence, 0, 1),
    spotCheckRate: num(data?.spotCheckRate, d.spotCheckRate, 0, 1),
    watchAfter: num(data?.watchAfter, d.watchAfter, 1),
    promotionDelayMinutes: { min, max: Math.max(min, num(delay.max, d.promotionDelayMinutes.max, 0)) },
    autoThreshold: num(data?.autoThreshold, d.autoThreshold, 0.01, 1),
    salt: typeof data?.salt === 'string' ? data.salt : '',
  };
}

/** Reads the settings; creates the per-player salt the first time. */
export async function loadAntiCheat(db: Firestore, tx?: Transaction): Promise<AntiCheatSettings> {
  const snap = tx ? await tx.get(antiCheatRef(db)) : await antiCheatRef(db).get();
  const s = readAntiCheat(snap.data());
  if (!s.salt && !tx) {
    s.salt = randomBytes(16).toString('hex');
    await antiCheatRef(db).set({ salt: s.salt }, { merge: true });
  }
  return s;
}

// A fixed offset in [-jitter, +jitter] for each player, from the secret salt,
// so no two players can compare notes and find the exact numbers.
export function playerOffset(s: AntiCheatSettings, uid: string): number {
  if (!s.jitter) return 0;
  const h = createHash('sha256').update(`${s.salt}:${uid}`).digest();
  return (h.readUInt32BE(0) % (2 * s.jitter + 1)) - s.jitter;
}

// ---------- per-player hidden record: playerChecks/{uid} (server-only)

export type PlayerChecks = {
  verifiedMatches: number; // clean, photo-verified matches (all time)
  season: string; // season of `opponents`
  opponents: string[]; // different opponents this season
  held: number; // results held from the leaderboards
  rejected: number; // results rejected as fake
  strikes: number; // proven fakes (1 = warning, 2 = deactivated)
  watch: boolean; // every result goes to an admin first
};

export const playerChecksRef = (db: Firestore, uid: string) => db.collection('playerChecks').doc(uid);

export function readChecks(d: Record<string, unknown> | undefined, season: string): PlayerChecks {
  const sameSeason = d?.season === season;
  return {
    verifiedMatches: Number(d?.verifiedMatches ?? 0),
    season,
    opponents: sameSeason && Array.isArray(d?.opponents) ? (d!.opponents as string[]) : [],
    held: Number(d?.held ?? 0),
    rejected: Number(d?.rejected ?? 0),
    strikes: Number(d?.strikes ?? 0),
    watch: d?.watch === true,
  };
}

export const shouldWatch = (s: AntiCheatSettings, c: PlayerChecks) => c.watch || c.held + c.rejected >= s.watchAfter;

/** May this player's clean results count for Neon, Prism and crowns? */
export function qualifiesForTop(s: AntiCheatSettings, uid: string, c: PlayerChecks): boolean {
  if (c.watch) return false;
  const off = playerOffset(s, uid);
  return (
    c.verifiedMatches >= Math.max(0, s.trustMatches + off) &&
    c.opponents.length >= Math.max(0, s.diversityOpponents + off)
  );
}

// ---------- a clean result: the photo check read it, nothing was edited

export type MatchReviewDoc = {
  verification?: Verification & { model?: string };
  edited?: string[];
  manual?: boolean;
  clean?: boolean;
};

export function isClean(s: AntiCheatSettings, r: MatchReviewDoc | undefined): boolean {
  const v = r?.verification;
  return (
    !!v &&
    v.status === 'match' &&
    v.confidence >= s.topConfidence &&
    !v.similarTo &&
    !r?.manual &&
    !(r?.edited ?? []).length
  );
}

// ---------- why a match goes to an admin (labels are for admins only)

export type ReviewReason =
  | 'dispute'
  | 'mismatch'
  | 'low_confidence'
  | 'unreadable'
  | 'duplicate'
  | 'not_checked'
  | 'auto_off'
  | 'edited'
  | 'manual'
  | 'watch';

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  dispute: 'Disputed by a player',
  mismatch: 'Screenshot doesn’t match the report',
  low_confidence: 'Low confidence',
  unreadable: 'Screenshot unreadable',
  duplicate: 'Looks like an earlier screenshot',
  not_checked: 'Not checked automatically',
  auto_off: 'Auto-approval is off',
  edited: 'Numbers changed after the photo check',
  manual: 'Entered by hand (photo not read)',
  watch: 'A player is on the watch list',
};

export function reviewReasons(
  config: { autoApprove: boolean; threshold: number },
  disputed: boolean,
  review: MatchReviewDoc | undefined,
  watched: boolean,
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const v = review?.verification;
  if (disputed) reasons.push('dispute');
  if (!v) reasons.push('not_checked');
  else if (v.status === 'mismatch') reasons.push('mismatch');
  else if (v.status === 'unreadable') reasons.push('unreadable');
  else if (!(v.confidence >= config.threshold)) reasons.push('low_confidence');
  if (v?.similarTo) reasons.push('duplicate');
  if (review?.manual) reasons.push('manual');
  if ((review?.edited ?? []).length) reasons.push('edited');
  if (watched) reasons.push('watch');
  if (!config.autoApprove) reasons.push('auto_off');
  return reasons;
}

export const reasonLabels = (reasons: string[]) =>
  reasons.map((r) => REVIEW_REASON_LABELS[r as ReviewReason] ?? r);

// ---------- results held from the leaderboards (payout still happens)

/** The real reasons (for admins) a squad result is held, or [] to count it. */
export function holdReasons(
  s: AntiCheatSettings,
  gameId: string,
  c: SeasonStats,
  before: SeasonStats,
): string[] {
  const out: string[] = [];
  const cap = s.caps[gameId];
  if (!cap) return out;
  if (c.elims > cap.eliminations) out.push(`${c.elims} eliminations in one match (limit ${cap.eliminations})`);
  if (c.damage > cap.damage) out.push(`${c.damage} damage in one match (limit ${cap.damage})`);
  if (before.matches >= s.outlierMinMatches) {
    const avgE = before.elims / before.matches;
    const avgD = before.damage / before.matches;
    if (avgE > 0 && c.elims > s.outlierMultiplier * avgE) {
      out.push(`${c.elims} eliminations, over ${s.outlierMultiplier}× the player’s average (${avgE.toFixed(1)})`);
    }
    if (avgD > 0 && c.damage > s.outlierMultiplier * avgD) {
      out.push(`${c.damage} damage, over ${s.outlierMultiplier}× the player’s average (${Math.round(avgD)})`);
    }
  }
  return out;
}

// ---------- promotions to Neon / Prism: later, at a random time

/** When a promotion should be applied, or null to apply it now. */
export function promotionTime(s: AntiCheatSettings, now: Date, random = Math.random): Date | null {
  const { min, max } = s.promotionDelayMinutes;
  if (max <= 0) return null;
  const minutes = min + random() * (max - min);
  return new Date(now.getTime() + minutes * 60_000);
}

// The Admin tab's settings form: labels live here (server only), so the
// app's public code only holds a generic editor.
const FORM: { key: string; label: string; get: (s: AntiCheatSettings) => number }[] = [
  { key: 'trustMatches', label: 'Clean matches before Neon / Prism', get: (s) => s.trustMatches },
  { key: 'diversityOpponents', label: 'Different opponents this season before Neon / Prism', get: (s) => s.diversityOpponents },
  { key: 'jitter', label: 'Random ± per player on the two above', get: (s) => s.jitter },
  { key: 'outlierMultiplier', label: 'Hold a result above N × the player’s average', get: (s) => s.outlierMultiplier },
  { key: 'outlierMinMatches', label: '… once they have this many matches this season', get: (s) => s.outlierMinMatches },
  { key: 'capEliminations', label: 'Squad limit: eliminations per player per match', get: (s) => Object.values(s.caps)[0]?.eliminations ?? 0 },
  { key: 'capDamage', label: 'Squad limit: damage per player per match', get: (s) => Object.values(s.caps)[0]?.damage ?? 0 },
  { key: 'topConfidence', label: 'Photo-check confidence for Neon / Prism / crowns (0–1)', get: (s) => s.topConfidence },
  { key: 'autoThreshold', label: 'Default confidence for automatic approval (0–1)', get: (s) => s.autoThreshold },
  { key: 'spotCheckRate', label: 'Share of matches spot-checked (0–1, e.g. 0.05 = 5%)', get: (s) => s.spotCheckRate },
  { key: 'watchAfter', label: 'Held + rejected results before the watch list', get: (s) => s.watchAfter },
  { key: 'promotionDelayMin', label: 'Promotion delay: shortest (minutes)', get: (s) => s.promotionDelayMinutes.min },
  { key: 'promotionDelayMax', label: 'Promotion delay: longest (minutes)', get: (s) => s.promotionDelayMinutes.max },
];

/** Admin view of the settings (never the salt). */
export function publicSettings(s: AntiCheatSettings) {
  return { fields: FORM.map((f) => ({ key: f.key, label: f.label, value: f.get(s) })) };
}
