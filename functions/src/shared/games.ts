// The ONE place for game and credit rules. Used by the Cloud Functions and by
// the app (imported as '@shared/games'). Keep this file free of imports so it
// works in both.

export type GameId = 'eafc' | 'clash-royale' | 'warzone-rebirth' | 'fortnite';
export type GameIdKey = 'eaId' | 'clashRoyaleTag' | 'activisionId' | 'epicName';
// How a result is reported: goals (+ penalties if level), crowns, or each
// player's eliminations and damage. ('placement' only exists in old reports.)
export type ResultKind = 'goals' | 'crowns' | 'eliminations';

export type GameConfig = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  tile: string; // short rules line on the game tile
  rules: string; // full rules, on the game and match pages
  gameIdKey: GameIdKey; // which profile game ID a player needs
  gameIdLabel: string;
  resultKind: ResultKind;
  // How players meet in the game: a lobby code from the host, or adding each
  // other as friends with their player tags (Clash Royale).
  lobby: 'code' | 'friend_tags';
  // Result proof: a camera photo of a console/PC screen, or (games played on
  // the phone) also a screenshot from the photo library.
  capture: 'camera' | 'camera_or_library';
  // The screen to photograph for the result (shown in the app, and given to
  // the automatic check as a hint).
  resultScreen: string;
};

const SQUAD_RULES =
  'Play together in the same squad. When the match ends, the player with the most eliminations wins the pot. Tie on eliminations: most damage wins. Still tied: the pot is split equally between the tied players.';
const SQUAD_SCREEN =
  'The end-of-match squad scoreboard: every Betterplayer player’s name with their eliminations and damage.';

export const GAMES: readonly GameConfig[] = [
  {
    id: 'eafc',
    name: 'EA FC',
    minPlayers: 2,
    maxPlayers: 2,
    tile: '1v1 · Draw decided on penalties',
    rules: 'Play an online friendly. A draw is decided on penalties.',
    gameIdKey: 'eaId',
    gameIdLabel: 'EA ID',
    resultKind: 'goals',
    lobby: 'code',
    capture: 'camera',
    resultScreen:
      'The full-time screen after the final whistle: the final score and both players’ names at the top.',
  },
  {
    id: 'clash-royale',
    name: 'Clash Royale',
    minPlayers: 2,
    maxPlayers: 2,
    tile: '1v1 · Friendly battle · Most crowns wins',
    rules:
      'Add each other as friends and play a Friendly Battle. Most crowns wins. A draw is refunded.',
    gameIdKey: 'clashRoyaleTag',
    gameIdLabel: 'Clash Royale player tag',
    resultKind: 'crowns',
    lobby: 'friend_tags',
    capture: 'camera_or_library',
    resultScreen:
      'The battle result screen (a screenshot is fine): both players’ names and the crowns each one won.',
  },
  {
    id: 'warzone-rebirth',
    name: 'Warzone Rebirth',
    minPlayers: 2,
    maxPlayers: 4,
    tile: 'Squad 2–4 · Most eliminations wins the pot',
    rules: SQUAD_RULES,
    gameIdKey: 'activisionId',
    gameIdLabel: 'Activision ID',
    resultKind: 'eliminations',
    lobby: 'code',
    capture: 'camera',
    resultScreen: SQUAD_SCREEN,
  },
  {
    id: 'fortnite',
    name: 'Fortnite',
    minPlayers: 2,
    maxPlayers: 4,
    tile: 'Squad 2–4 · Most eliminations wins the pot',
    rules: SQUAD_RULES,
    gameIdKey: 'epicName',
    gameIdLabel: 'Epic display name',
    resultKind: 'eliminations',
    lobby: 'code',
    capture: 'camera',
    resultScreen: SQUAD_SCREEN,
  },
];

export function getGame(id: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === id);
}

export const ENTRY_CREDITS = 2;
// Betterplayer's fee as a share of the whole pot. The live rate is read from
// Firestore config/fees.rate (server) and stored on each match when it's
// created, so a match always settles at the rate it was created with.
export const DEFAULT_FEE_RATE = 0.1; // used when config/fees is missing
export const LEGACY_FEE_RATE = 0.2; // matches created before the rate was stored

// A usable fee rate from config/fees, or the default.
export function readFeeRate(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 1 ? n : DEFAULT_FEE_RATE;
}

// The rate a match settles at: its own stored rate (older matches: 20%).
export const feeRateOf = (match: { feeRate?: number | null }) =>
  typeof match.feeRate === 'number' ? match.feeRate : LEGACY_FEE_RATE;

// "10%" for a rate of 0.1.
export const percent = (rate: number) => `${Math.round(rate * 1000) / 10}%`;
export const DAILY_MATCH_LIMIT = 10; // matches created or joined per day (Europe/Madrid)
export const OPEN_MATCH_MINUTES = 15; // open matches are cancelled after this
export const LOBBY_CODE_MAX = 20;
export const TITLE_MAX = 40;

export type MatchStatus =
  | 'open'
  | 'full'
  | 'started'
  | 'awaiting_result'
  | 'under_review'
  | 'completed'
  | 'cancelled';

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Pot = entry x players; the fee is a share of the pot; the winner gets the rest.
export function matchMoney(players: number, feeRate: number = DEFAULT_FEE_RATE) {
  const pot = round2(ENTRY_CREDITS * players);
  const fee = round2(pot * feeRate);
  return { entry: ENTRY_CREDITS, pot, fee, winnerGets: round2(pot - fee) };
}

/**
 * How the winners' 80% is shared: equally, in whole cents. Leftover cents
 * (e.g. 7.20 split 3 ways = 2.40 each; 3.60 split 3 ways = 1.20 each; 6.40 split 3 ways = 2.14 + 2.13 + 2.13) go to the first winners in
 * the order given (join order), so the total is always exact.
 */
export function splitWinnings(
  players: number,
  winnerUids: string[],
  feeRate: number = DEFAULT_FEE_RATE,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!winnerUids.length) return out;
  const cents = Math.round(matchMoney(players, feeRate).winnerGets * 100);
  const base = Math.floor(cents / winnerUids.length);
  const extra = cents - base * winnerUids.length;
  winnerUids.forEach((uid, i) => {
    out[uid] = (base + (i < extra ? 1 : 0)) / 100;
  });
  return out;
}

// Share codes: 6 characters, no 0/O/1/I so they're easy to read out loud.
export const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SHARE_CODE_LENGTH = 6;

// ---------- Results (round B) ----------

export const RESPONSE_MINUTES = 30; // time other players have to confirm or dispute
export const NOTES_MAX = 500;
export const DISPUTE_REASON_MIN = 10;
export const DISPUTE_REASON_MAX = 500;
export const ADMIN_NOTE_MIN = 3;
export const ADMIN_NOTE_MAX = 500;
export const SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
export const SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ---- Automatic result check (Claude vision) and auto-approval
export type VerificationStatus = 'match' | 'mismatch' | 'unreadable';
export type Verification = {
  status: VerificationStatus;
  confidence: number; // 0–1
  reason: string;
  similarTo?: string | null; // an earlier image this one looks very like
};
export const DEFAULT_VISION_MODEL = 'claude-sonnet-5';
export const DEFAULT_AUTO_THRESHOLD = 0.9;
export const REVERSAL_HOURS = 24; // admins can reverse an automatic decision this long

// Why a match went to an admin instead of being approved automatically.
export type ReviewReason =
  | 'dispute'
  | 'mismatch'
  | 'low_confidence'
  | 'unreadable'
  | 'duplicate'
  | 'not_checked'
  | 'auto_off';
export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  dispute: 'Disputed by a player',
  mismatch: 'Screenshot doesn’t match the report',
  low_confidence: 'Low confidence',
  unreadable: 'Screenshot unreadable',
  duplicate: 'Looks like an earlier screenshot',
  not_checked: 'Not checked automatically',
  auto_off: 'Auto-approval is off',
};

/**
 * The reasons a match can't be approved automatically (empty = approve it).
 * Auto-approval needs: auto-approval on, no dispute, a "match" verification
 * with confidence >= threshold, and no near-duplicate image.
 */
export function autoReviewReasons(
  config: { autoApprove: boolean; threshold: number },
  disputed: boolean,
  verification: Verification | null | undefined,
): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (disputed) reasons.push('dispute');
  if (!verification) reasons.push('not_checked');
  else if (verification.status === 'mismatch') reasons.push('mismatch');
  else if (verification.status === 'unreadable') reasons.push('unreadable');
  else if (!(verification.confidence >= config.threshold)) reasons.push('low_confidence');
  if (verification?.similarTo) reasons.push('duplicate');
  if (!config.autoApprove) reasons.push('auto_off');
  return reasons;
}

export const REPUTATION_COMPLETED = 1; // each player of a completed match
export const REPUTATION_PENALTY = -5; // report overridden, or dispute rejected

// Per-player numbers keyed by uid.
export type ScoreMap = Record<string, number>;
export type ResultDetails = {
  goals?: ScoreMap;
  penalties?: ScoreMap; // EA FC only, only when goals are level
  crowns?: ScoreMap;
  eliminations?: ScoreMap; // Fortnite / Warzone
  damage?: ScoreMap; // Fortnite / Warzone, breaks a tie on eliminations
  placements?: ScoreMap; // old reports only (1 = best)
};

const LIMITS = {
  goals: { min: 0, max: 99, label: 'Goals' },
  crowns: { min: 0, max: 3, label: 'Crowns' },
  eliminations: { min: 0, max: 199, label: 'Eliminations' },
  damage: { min: 0, max: 99_999, label: 'Damage' },
  penalties: { min: 0, max: 99, label: 'Penalties' },
};

function readScores(
  raw: unknown,
  uids: string[],
  { min, max, label }: { min: number; max: number; label: string },
): ScoreMap | string {
  if (!raw || typeof raw !== 'object') return `Enter the ${label.toLowerCase()} for every player.`;
  const out: ScoreMap = {};
  const keys = Object.keys(raw as object);
  if (keys.length !== uids.length || !uids.every((u) => keys.includes(u))) {
    return `Enter the ${label.toLowerCase()} for every player.`;
  }
  for (const uid of uids) {
    const n = (raw as Record<string, unknown>)[uid];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
      return `${label} must be whole numbers from ${min} to ${max}.`;
    }
    out[uid] = n;
  }
  return out;
}

// Players with the highest number (all of them when tied).
const leaders = (uids: string[], scores: ScoreMap) => {
  const best = Math.max(...uids.map((u) => scores[u]));
  return uids.filter((u) => scores[u] === best);
};

/**
 * Checks a reported result and works out the winners, or returns a plain
 * error message. `winners` is in join order; more than one = a tie (the 80%
 * is split), none = a Clash Royale draw (entries refunded).
 * - EA FC: more goals; if level, penalties decide (and must differ). The
 *   reporter must choose the winner, and it must match the score.
 * - Clash Royale: more crowns; level crowns = a draw.
 * - Fortnite / Warzone: most eliminations; then most damage; still tied =
 *   the tied players share.
 * For Clash Royale and squads, `winnerUid` is optional; if given it must match.
 */
export function checkResult(
  game: GameConfig,
  playerUids: string[],
  winnerUid: string | null | undefined,
  details: unknown,
): { details: ResultDetails; winners: string[] } | { error: string } {
  const d = (details ?? {}) as Record<string, unknown>;
  const given = typeof winnerUid === 'string' && winnerUid ? winnerUid : null;
  if (given && !playerUids.includes(given)) return { error: 'Choose the winner.' };
  const mustMatch = (winners: string[], word: string) =>
    given && (winners.length !== 1 || winners[0] !== given)
      ? { error: winners.length ? `The winner must be the player with ${word}.` : 'Level result: there’s no winner.' }
      : null;

  if (game.resultKind === 'goals') {
    if (!given) return { error: 'Choose the winner.' };
    const goals = readScores(d.goals, playerUids, LIMITS.goals);
    if (typeof goals === 'string') return { error: goals };
    const [a, b] = playerUids;
    if (goals[a] !== goals[b]) {
      if (d.penalties !== undefined && d.penalties !== null) {
        return { error: 'Only add penalties when the goals are level.' };
      }
      const winners = leaders(playerUids, goals);
      return mustMatch(winners, 'more goals') ?? { details: { goals }, winners };
    }
    const pens = readScores(d.penalties, playerUids, LIMITS.penalties);
    if (typeof pens === 'string') {
      return { error: 'Goals are level: add the penalty shoot-out score.' };
    }
    if (pens[a] === pens[b]) return { error: 'A penalty shoot-out always has a winner.' };
    const winners = leaders(playerUids, pens);
    if (winners[0] !== given) {
      return { error: 'The winner must be the player who won on penalties.' };
    }
    return { details: { goals, penalties: pens }, winners };
  }

  if (game.resultKind === 'crowns') {
    const crowns = readScores(d.crowns, playerUids, LIMITS.crowns);
    if (typeof crowns === 'string') return { error: crowns };
    const top = leaders(playerUids, crowns);
    const winners = top.length === 1 ? top : []; // level = draw, refunded
    return mustMatch(winners, 'more crowns') ?? { details: { crowns }, winners };
  }

  const eliminations = readScores(d.eliminations, playerUids, LIMITS.eliminations);
  if (typeof eliminations === 'string') return { error: eliminations };
  const damage = readScores(d.damage, playerUids, LIMITS.damage);
  if (typeof damage === 'string') return { error: damage };
  const winners = leaders(leaders(playerUids, eliminations), damage);
  if (given && !winners.includes(given)) {
    return { error: 'The winner must be the player with the most eliminations.' };
  }
  return { details: { eliminations, damage }, winners };
}

// "Alpha wins", "Tie: Alpha and Bravo share", "Draw: entries refunded".
export function describeOutcome(
  winnerUids: string[],
  players: { uid: string; gamerTag: string }[],
): string {
  const tag = (uid: string) => players.find((p) => p.uid === uid)?.gamerTag ?? 'Player';
  if (!winnerUids.length) return 'Draw: entries refunded';
  if (winnerUids.length === 1) return `${tag(winnerUids[0])} wins`;
  const names = winnerUids.map(tag);
  return `Tie: ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} share`;
}

// The winners of a report or match, also for data saved before ties existed.
export function winnersOf(r: {
  winnerUids?: string[] | null;
  winnerUid?: string | null;
  draw?: boolean;
}): string[] {
  if (Array.isArray(r.winnerUids)) return r.winnerUids;
  if (r.draw) return [];
  return r.winnerUid ? [r.winnerUid] : [];
}

// One readable line for a reported score, e.g.
// "Alpha 1 – 1 Bravo (penalties 5 – 4)", "Alpha 3 – 1 Bravo (crowns)",
// "Charlie 7 elim. (1450 dmg) · Alpha 5 elim. (900 dmg)". Used by the app and
// admin emails.
const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function describeResult(
  details: ResultDetails,
  players: { uid: string; gamerTag: string }[],
): string {
  const tag = (uid: string) => players.find((p) => p.uid === uid)?.gamerTag ?? 'Player';
  const [a, b] = players.map((p) => p.uid);
  if (details.goals && a && b) {
    const pens = details.penalties
      ? ` (penalties ${details.penalties[a]} – ${details.penalties[b]})`
      : '';
    return `${tag(a)} ${details.goals[a]} – ${details.goals[b]} ${tag(b)}${pens}`;
  }
  if (details.crowns && a && b) {
    return `${tag(a)} ${details.crowns[a]} – ${details.crowns[b]} ${tag(b)} (crowns)`;
  }
  if (details.eliminations) {
    const elim = details.eliminations;
    const dmg = details.damage ?? {};
    return Object.keys(elim)
      .sort((x, y) => elim[y] - elim[x] || (dmg[y] ?? 0) - (dmg[x] ?? 0))
      .map((uid) => `${tag(uid)} ${elim[uid]} elim. (${dmg[uid] ?? 0} dmg)`)
      .join(' · ');
  }
  if (details.placements) {
    return Object.entries(details.placements)
      .sort(([, x], [, y]) => x - y)
      .map(([uid, place]) => `${ordinal(place)} ${tag(uid)}`)
      .join(' · ');
  }
  return '';
}
