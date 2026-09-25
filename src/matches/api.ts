import { httpsCallable } from 'firebase/functions';

import { functions } from '@/firebase';

// The app changes matches ONLY through these Cloud Functions. It never writes
// matches, wallets or the ledger itself.

// Turns a Cloud Function error into a message for players. The functions
// already send plain-language messages; the Firebase library adds a status
// like " [400]" at the end, which we remove.
export function matchError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  const raw = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  const message = raw.replace(/\s*\[\d{3}\]$/, '').trim();

  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
    return 'No connection. Check your internet and try again.';
  }
  if (code === 'functions/internal' || code === 'functions/unknown' || !message) {
    return 'Something went wrong. Please try again.';
  }
  return message;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
  return result.data;
}

export const createMatch = (input: { game: string; maxPlayers: number; title?: string }) =>
  call<{ matchId: string; code: string }>('createMatch', input);

export const joinMatch = (input: { matchId: string } | { code: string }) =>
  call<{ matchId: string }>('joinMatch', input);

export const leaveMatch = (matchId: string) => call('leaveMatch', { matchId });

export const setLobbyCode = (matchId: string, code: string) =>
  call('setLobbyCode', { matchId, code });

export const startMatch = (matchId: string) => call('startMatch', { matchId });

export const cancelMatch = (matchId: string) => call('cancelMatch', { matchId });

// ---- Round B: results and review

export type ResultInput = {
  matchId: string;
  winnerUid: string;
  details: Record<string, unknown>;
  screenshotPath: string;
  notes?: string;
};

export const submitResult = (input: ResultInput) => call('submitResult', input);

export const confirmResult = (matchId: string) => call('confirmResult', { matchId });

export const disputeResult = (matchId: string, reason: string, evidencePath?: string) =>
  call('disputeResult', { matchId, reason, ...(evidencePath && { evidencePath }) });

export type Decision = 'approve' | 'override' | 'cancel_refund';

export const adminDecide = (input: {
  matchId: string;
  decision: Decision;
  winnerUid?: string;
  note: string;
}) => call<{ status: string; winnerUid: string | null }>('adminDecide', input);

// Reverse a match approved automatically (within 24 hours): the correct winner,
// or cancel & refund. New ledger entries; old ones are never changed.
export const reverseAutoDecision = (input: {
  matchId: string;
  decision: 'override' | 'cancel_refund';
  winnerUid?: string;
  note: string;
}) => call<{ status: string; winnerUid: string | null }>('reverseAutoDecision', input);
