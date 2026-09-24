// Supported games. Never use publisher logos or artwork: games are shown
// as their name on a coloured tile (see src/components/GameTile.tsx).
export type Game = {
  id: 'eafc' | 'warzone-rebirth' | 'fortnite' | 'clash-royale';
  name: string;
  players: string;
  color: string;
};

export const games: Game[] = [
  { id: 'eafc', name: 'EA FC', players: '1v1', color: '#22C55E' },
  { id: 'warzone-rebirth', name: 'Warzone Rebirth', players: '2–4 players', color: '#F97316' },
  { id: 'fortnite', name: 'Fortnite', players: '2–4 players', color: '#A855F7' },
  { id: 'clash-royale', name: 'Clash Royale', players: '1v1', color: '#29B6FF' },
];
