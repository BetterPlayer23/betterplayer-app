import type { Timestamp } from 'firebase/firestore';

export const platforms = [
  { id: 'pc', label: 'PC' },
  { id: 'playstation', label: 'PlayStation' },
  { id: 'xbox', label: 'Xbox' },
  { id: 'switch', label: 'Nintendo Switch' },
  { id: 'mobile', label: 'Mobile' },
] as const;

export type PlatformId = (typeof platforms)[number]['id'];

export function platformLabel(id: string): string {
  return platforms.find((p) => p.id === id)?.label ?? id;
}

// A player's platforms, also for older profiles that saved just one.
export function platformsOf(p: { platforms?: string[]; platform?: string }): PlatformId[] {
  const list = p.platforms ?? (p.platform ? [p.platform] : []);
  return platforms.map((x) => x.id).filter((id) => list.includes(id));
}

// Per-game player IDs a player can add on their profile.
export const gameIdFields = [
  { key: 'eaId', label: 'EA ID', game: 'EA FC · Battlefield REDSEC', placeholder: 'Your EA ID' },
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
  platforms?: PlatformId[]; // one or more
  platform?: PlatformId; // older profiles only (moved to `platforms`)
  ageConfirmed: true;
  ageConfirmedAt: Timestamp | null;
  country: 'ES';
  gameIds: GameIds;
  createdAt: Timestamp | null;
  // Written only by the acceptRules Cloud Function.
  acceptedRulesVersion?: string;
  acceptedAt?: Timestamp | null;
};
