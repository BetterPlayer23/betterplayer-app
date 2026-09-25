import {
  FieldValue,
  Timestamp,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/https';

import {
  DAILY_MATCH_LIMIT,
  ENTRY_CREDITS,
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  type GameConfig,
  type MatchStatus,
} from '../shared/games';
import { BETA_RULES_VERSION } from '../shared/betaRules';

export type MatchPlayer = {
  uid: string;
  gamerTag: string; // snapshot at join time
  gameId: string; // the player's in-game ID for this match's game
  joinedAt: Timestamp;
};

export type MatchDoc = {
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
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
  startedAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelReason?: 'host' | 'expired' | 'admin_refund';
  // Round B: results and review
  reportedByUid?: string;
  reportedAt?: Timestamp;
  responseDeadline?: Timestamp;
  confirmedUids?: string[];
  disputed?: boolean;
  reviewAt?: Timestamp; // when it went to under_review (admin queue order)
  winnerUid?: string; // final winner after admin decision
  decision?: 'approve' | 'override' | 'cancel_refund';
  settledAt?: Timestamp;
};

// matches/{id}/reports/{uid}: the player's result report (one per player).
export type ReportDoc = {
  uid: string;
  gamerTag: string;
  winnerUid: string;
  winnerGamerTag: string;
  details: Record<string, unknown>;
  notes: string | null;
  screenshotPath: string;
  createdAt: Timestamp;
};

// matches/{id}/disputes/{uid}
export type DisputeDoc = {
  uid: string;
  gamerTag: string;
  reason: string;
  evidencePath: string | null;
  createdAt: Timestamp;
};

// Plain-language errors. The app shows `message` as is.
export const fail = (
  code: ConstructorParameters<typeof HttpsError>[0],
  message: string,
  details?: Record<string, unknown>,
) => new HttpsError(code, message, details);

export function requireUid(auth: { uid: string } | undefined): string {
  if (!auth) throw fail('unauthenticated', 'Please log in again.');
  return auth.uid;
}

export function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw fail('invalid-argument', `Missing ${name}.`);
  }
  return value.trim();
}

// Calendar day in Spain, e.g. "2026-09-24".
export function madridDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function randomShareCode(): string {
  let code = '';
  for (let i = 0; i < SHARE_CODE_LENGTH; i++) {
    code += SHARE_CODE_ALPHABET[Math.floor(Math.random() * SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

export const matchRef = (db: Firestore, id: string) =>
  db.collection('matches').doc(id) as DocumentReference<MatchDoc>;

export type EligiblePlayer = {
  uid: string;
  gamerTag: string;
  gameId: string;
  dailyRef: DocumentReference;
};

/**
 * Checks shared by createMatch and joinMatch. Reads only (call before any
 * writes in the transaction):
 * - the player has a profile with the game ID this game needs
 * - at least 2 available credits
 * - fewer than 10 matches created or joined today (Europe/Madrid)
 */
export async function checkEligible(
  tx: Transaction,
  db: Firestore,
  uid: string,
  game: GameConfig,
  now: Date,
): Promise<EligiblePlayer> {
  const dailyRef = db.collection('dailyCounts').doc(`${uid}_${madridDay(now)}`);
  const [profile, wallet, daily] = await Promise.all([
    tx.get(db.collection('users').doc(uid)),
    tx.get(db.collection('wallets').doc(uid)),
    tx.get(dailyRef),
  ]);

  if (!profile.exists) throw fail('failed-precondition', 'Finish your profile first.');
  if (profile.get('acceptedRulesVersion') !== BETA_RULES_VERSION) {
    throw fail('failed-precondition', 'Accept the beta rules first.', { reason: 'rules' });
  }
  const gameId = profile.get(`gameIds.${game.gameIdKey}`);
  if (typeof gameId !== 'string' || !gameId) {
    throw fail(
      'failed-precondition',
      `Add your ${game.gameIdLabel} in Profile to play ${game.name}.`,
      { reason: 'missing_game_id', gameIdKey: game.gameIdKey },
    );
  }
  if (Number(wallet.get('available') ?? 0) < ENTRY_CREDITS) {
    throw fail('failed-precondition', `You need at least ${ENTRY_CREDITS} available credits.`, {
      reason: 'not_enough_credits',
    });
  }
  if (Number(daily.get('count') ?? 0) >= DAILY_MATCH_LIMIT) {
    throw fail(
      'resource-exhausted',
      `You've reached today's limit of ${DAILY_MATCH_LIMIT} matches. Try again tomorrow.`,
      { reason: 'daily_limit' },
    );
  }
  return { uid, gamerTag: String(profile.get('gamerTag') ?? 'Player'), gameId, dailyRef };
}

export function countTodaysMatch(tx: Transaction, player: EligiblePlayer, now: Date) {
  tx.set(
    player.dailyRef,
    { uid: player.uid, day: madridDay(now), count: FieldValue.increment(1) },
    { merge: true },
  );
}

// Friendly message for a match that can no longer be joined or changed.
export function closedMessage(status: MatchStatus): string {
  switch (status) {
    case 'full':
      return 'This match is full.';
    case 'cancelled':
      return 'This match was cancelled.';
    default:
      return 'This match has already started.';
  }
}
