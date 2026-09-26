import type { Timestamp } from 'firebase/firestore';

import type { Chip } from '@shared/badges';
import type { MatchStatus, ReviewReason, Verification } from '@shared/games';

// matches/{id}, written only by Cloud Functions (functions/src/matches).
export type MatchPlayer = {
  uid: string;
  gamerTag: string;
  gameId?: string; // only on matches created before game IDs moved to private data
  chip?: Chip | null; // the player's badge when they joined (shown next to the name)
};

// matches/{id}/private/data: readable by the match's players and admins only.
export type MatchPrivate = {
  lobbyCode: string | null;
  gameIds: Record<string, string>; // uid -> in-game ID for this match's game
};

// A player's in-game ID for a match (private data, or older matches' player entry).
export const gameIdOf = (p: MatchPlayer | undefined, priv: MatchPrivate | null | undefined) =>
  (p && (priv?.gameIds[p.uid] ?? p.gameId)) || '';

export type Match = {
  id: string;
  game: string;
  gameName: string;
  title: string | null;
  hostUid: string;
  hostGamerTag: string;
  maxPlayers: number;
  players: MatchPlayer[];
  playerUids: string[];
  status: MatchStatus;
  code: string;
  entry: number;
  pot: number;
  fee: number;
  winnerGets: number;
  feeRate?: number; // fixed when the match was created (older matches: none = 20%)
  createdAt: Timestamp | null;
  expiresAt: Timestamp | null;
  startedAt?: Timestamp;
  cancelReason?: 'host' | 'expired' | 'admin_refund';
  // Round B
  reportedByUid?: string;
  responseDeadline?: Timestamp;
  confirmedUids?: string[];
  disputed?: boolean;
  reviewAt?: Timestamp;
  winnerUid?: string; // single winner (absent on a tie or draw)
  winnerUids?: string[]; // 2+ = tie (the winnings are shared), none = draw
  draw?: boolean; // Clash Royale draw: every entry refunded
  decision?: 'approve' | 'override' | 'cancel_refund';
  settledAt?: Timestamp;
  // Automatic result check (Claude vision)
  verification?: Verification & { model?: string; checkedAt?: Timestamp };
  reviewReasons?: ReviewReason[];
  decidedBy?: 'admin' | 'vision';
  reversedAt?: Timestamp;
};

export const statusLabels: Record<MatchStatus, string> = {
  open: 'Open',
  full: 'Full',
  started: 'Started',
  awaiting_result: 'Awaiting result',
  under_review: 'Under review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Matches a player is still taking part in.
export const ACTIVE_STATUSES: MatchStatus[] = [
  'open',
  'full',
  'started',
  'awaiting_result',
  'under_review',
];
