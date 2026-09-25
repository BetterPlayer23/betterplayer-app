import type { Timestamp } from 'firebase/firestore';

import type { MatchStatus } from '@shared/games';

// matches/{id}, written only by Cloud Functions (functions/src/matches).
export type MatchPlayer = {
  uid: string;
  gamerTag: string;
  gameId: string;
};

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
  lobbyCode: string | null;
  entry: number;
  pot: number;
  fee: number;
  winnerGets: number;
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
  winnerUid?: string;
  decision?: 'approve' | 'override' | 'cancel_refund';
  settledAt?: Timestamp;
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
