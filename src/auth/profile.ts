import type { Timestamp } from 'firebase/firestore';

export const platforms = [
  { id: 'pc', label: 'PC' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'mobile', label: 'Mobile' },
] as const;

export type PlatformId = (typeof platforms)[number]['id'];

export function platformLabel(id: string): string {
  return platforms.find((p) => p.id === id)?.label ?? id;
}

// Per-game player IDs a player can add on their profile.
export const gameIdFields = [
  { key: 'eaId', label: 'EA ID', game: 'EA FC', placeholder: 'Your EA ID' },
  {
    key: 'activisionId',
    label: 'Activision ID',
    game: 'Warzone Rebirth',
    placeholder: 'Name#1234567',
  },
  { key: 'epicName', label: 'Epic display name', game: 'Fortnite', placeholder: 'Your Epic name' },
  {
    key: 'clashRoyaleTag',
    label: 'Clash Royale player tag',
    game: 'Clash Royale',
    placeholder: '#ABC123',
  },
] as const;

export type GameIdKey = (typeof gameIdFields)[number]['key'];
export type GameIds = Partial<Record<GameIdKey, string>>;

// The users/{uid} document. Credits and reputation are NOT here: they are
// server-only and written by Cloud Functions.
export type Profile = {
  gamerTag: string;
  platform: PlatformId;
  ageConfirmed: true;
  ageConfirmedAt: Timestamp | null;
  country: 'ES';
  gameIds: GameIds;
  createdAt: Timestamp | null;
};
