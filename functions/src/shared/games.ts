// The ONE place for game and credit rules. Used by the Cloud Functions and by
// the app (imported as '@shared/games'). Keep this file free of imports so it
// works in both.

export type GameId = 'eafc' | 'clash-royale' | 'warzone-rebirth' | 'fortnite';
export type GameIdKey = 'eaId' | 'clashRoyaleTag' | 'activisionId' | 'epicName';
// How a result is reported: goals (+ penalties if level), crowns, or placement.
export type ResultKind = 'goals' | 'crowns' | 'placement';

export type GameConfig = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  format: string; // short line, e.g. "1v1 online friendly"
  rules: string; // how the winner is decided
  gameIdKey: GameIdKey; // which profile game ID a player needs
  gameIdLabel: string;
  resultKind: ResultKind;
};

export const GAMES: readonly GameConfig[] = [
  {
    id: 'eafc',
    name: 'EA FC',
    minPlayers: 2,
    maxPlayers: 2,
    format: '1v1 online friendly',
    rules: 'Play an online friendly. A draw is decided on penalties.',
    gameIdKey: 'eaId',
    gameIdLabel: 'EA ID',
    resultKind: 'goals',
  },
  {
    id: 'clash-royale',
    name: 'Clash Royale',
    minPlayers: 2,
    maxPlayers: 2,
    format: '1v1 friendly battle',
    rules: 'Play a 1v1 friendly battle.',
    gameIdKey: 'clashRoyaleTag',
    gameIdLabel: 'Clash Royale player tag',
    resultKind: 'crowns',
  },
  {
    id: 'warzone-rebirth',
    name: 'Warzone Rebirth',
    minPlayers: 2,
    maxPlayers: 4,
    format: 'Private match, 2–4 players',
    rules: 'Play a private match. Best placement among Betterplayer players wins.',
    gameIdKey: 'activisionId',
    gameIdLabel: 'Activision ID',
    resultKind: 'placement',
  },
  {
    id: 'fortnite',
    name: 'Fortnite',
    minPlayers: 2,
    maxPlayers: 4,
    format: 'Private match, 2–4 players',
    rules: 'Play a private match. Best placement among Betterplayer players wins.',
    gameIdKey: 'epicName',
    gameIdLabel: 'Epic display name',
    resultKind: 'placement',
  },
];

export function getGame(id: string): GameConfig | undefined {
  return GAMES.find((g) => g.id === id);
}

export const ENTRY_CREDITS = 2;
export const FEE_RATE = 0.2;
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

// Pot = entry x players; fee 20% of the pot; the winner gets the rest.
export function matchMoney(players: number) {
  const pot = round2(ENTRY_CREDITS * players);
  const fee = round2(pot * FEE_RATE);
  return { entry: ENTRY_CREDITS, pot, fee, winnerGets: round2(pot - fee) };
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
export const SCREENSHOT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export const REPUTATION_COMPLETED = 1; // each player of a completed match
export const REPUTATION_PENALTY = -5; // report overridden, or dispute rejected

// Per-player numbers keyed by uid.
export type ScoreMap = Record<string, number>;
export type ResultDetails = {
  goals?: ScoreMap;
  penalties?: ScoreMap; // EA FC only, only when goals are level
  crowns?: ScoreMap;
  placements?: ScoreMap; // 1 = best
};

const LIMITS: Record<ResultKind, { min: number; max: number; label: string }> = {
  goals: { min: 0, max: 99, label: 'Goals' },
  crowns: { min: 0, max: 3, label: 'Crowns' },
  placement: { min: 1, max: 150, label: 'Placement' },
};

function readScores(
  raw: unknown,
  uids: string[],
  min: number,
  max: number,
  label: string,
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

/**
 * Checks a reported result and returns clean details, or a plain error
 * message. The winner must match the score:
 * - EA FC: more goals; if goals are level, penalties decide (and must differ).
 * - Clash Royale: more crowns (a level result can't be reported).
 * - Warzone / Fortnite: best (lowest) placement; placements must all differ.
 */
export function checkResult(
  game: GameConfig,
  playerUids: string[],
  winnerUid: string,
  details: unknown,
): { details: ResultDetails } | { error: string } {
  if (!playerUids.includes(winnerUid)) return { error: 'Choose the winner.' };
  const d = (details ?? {}) as Record<string, unknown>;
  const { min, max, label } = LIMITS[game.resultKind];

  if (game.resultKind === 'goals') {
    const goals = readScores(d.goals, playerUids, min, max, label);
    if (typeof goals === 'string') return { error: goals };
    const [a, b] = playerUids;
    if (goals[a] !== goals[b]) {
      if (d.penalties !== undefined && d.penalties !== null) {
        return { error: 'Only add penalties when the goals are level.' };
      }
      const leader = goals[a] > goals[b] ? a : b;
      if (leader !== winnerUid) return { error: 'The winner must be the player with more goals.' };
      return { details: { goals } };
    }
    const pens = readScores(d.penalties, playerUids, 0, 99, 'Penalties');
    if (typeof pens === 'string') {
      return { error: 'Goals are level: add the penalty shoot-out score.' };
    }
    if (pens[a] === pens[b]) return { error: 'A penalty shoot-out always has a winner.' };
    const leader = pens[a] > pens[b] ? a : b;
    if (leader !== winnerUid) {
      return { error: 'The winner must be the player who won on penalties.' };
    }
    return { details: { goals, penalties: pens } };
  }

  if (game.resultKind === 'crowns') {
    const crowns = readScores(d.crowns, playerUids, min, max, label);
    if (typeof crowns === 'string') return { error: crowns };
    const best = Math.max(...playerUids.map((u) => crowns[u]));
    const leaders = playerUids.filter((u) => crowns[u] === best);
    if (leaders.length > 1) return { error: 'Level on crowns: play again to get a winner.' };
    if (leaders[0] !== winnerUid) {
      return { error: 'The winner must be the player with more crowns.' };
    }
    return { details: { crowns } };
  }

  const placements = readScores(d.placements, playerUids, min, max, label);
  if (typeof placements === 'string') return { error: placements };
  const values = playerUids.map((u) => placements[u]);
  if (new Set(values).size !== values.length) {
    return { error: 'Each player must have a different placement.' };
  }
  const best = Math.min(...values);
  if (placements[winnerUid] !== best) {
    return { error: 'The winner must be the player with the best placement.' };
  }
  return { details: { placements } };
}

// One readable line for a reported score, e.g.
// "Alpha 1 – 1 Bravo (penalties 5 – 4)", "Alpha 3 – 1 Bravo (crowns)",
// "1st Charlie · 2nd Bravo · 3rd Alpha". Used by the app and admin emails.
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
  if (details.placements) {
    return Object.entries(details.placements)
      .sort(([, x], [, y]) => x - y)
      .map(([uid, place]) => `${ordinal(place)} ${tag(uid)}`)
      .join(' · ');
  }
  return '';
}
