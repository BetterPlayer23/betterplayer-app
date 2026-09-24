// The ONE place for game and credit rules. Used by the Cloud Functions and by
// the app (imported as '@shared/games'). Keep this file free of imports so it
// works in both.

export type GameId = 'eafc' | 'clash-royale' | 'warzone-rebirth' | 'fortnite';
export type GameIdKey = 'eaId' | 'clashRoyaleTag' | 'activisionId' | 'epicName';

export type GameConfig = {
  id: GameId;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  format: string; // short line, e.g. "1v1 online friendly"
  rules: string; // how the winner is decided
  gameIdKey: GameIdKey; // which profile game ID a player needs
  gameIdLabel: string;
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
