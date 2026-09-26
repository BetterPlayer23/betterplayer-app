// Supported games. The rules (players, format, which game ID is needed) live
// in ONE shared place used by the app and the Cloud Functions:
// functions/src/shared/games.ts. This file only adds the tile colours.
// Never use publisher logos or artwork: games are shown as their name on a
// coloured tile (see src/components/GameTile.tsx).
import { GAMES, type GameConfig, type GameId } from '@shared/games';

export type Game = GameConfig & {
  players: string; // short label for tiles, e.g. "1v1" or "2–4 players"
  color: string;
};

const colorsById: Record<GameId, string> = {
  eafc: '#22C55E',
  'warzone-rebirth': '#F97316',
  fortnite: '#A855F7',
  'clash-royale': '#38BDF8',
  'bf-redsec': '#F43F5E', // a rose red, clearly different from the danger red #FF4D6D
};

export const games: Game[] = GAMES.map((g) => ({
  ...g,
  players: g.minPlayers === g.maxPlayers ? '1v1' : `${g.minPlayers}–${g.maxPlayers} players`,
  color: colorsById[g.id],
}));

export function gameById(id: string): Game | undefined {
  return games.find((g) => g.id === id);
}
