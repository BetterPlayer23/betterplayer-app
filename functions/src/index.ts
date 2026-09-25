import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/firestore';
import { onCall, type CallableRequest } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions/options';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/scheduler';

import * as matches from './matches/actions';
import * as admin from './matches/admin';
import { sendReviewAlert } from './matches/alerts';
import type { MatchDoc } from './matches/common';
import * as results from './matches/results';
import { requireUid } from './matches/common';
import { acceptRules as acceptRulesAction } from './rules';
import { grantStarterCredits } from './starterGrant';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();

// When a player's profile (users/{uid}) is created, give them their starter
// credits. Safe to retry: the grant happens at most once per player.
export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', retry: true },
  async (event) => {
    const { uid } = event.params;
    const granted = await grantStarterCredits(getFirestore(), uid);
    logger.info(granted ? 'Starter credits granted' : 'Starter credits already granted', { uid });
  },
);

// ---- Match flow (round A). The app calls these; it never writes matches,
// wallets or the ledger itself.

type Action = (
  db: FirebaseFirestore.Firestore,
  uid: string,
  data: Record<string, unknown> | undefined,
) => Promise<unknown>;

const callable = (action: Action) =>
  onCall(async (request: CallableRequest<Record<string, unknown> | undefined>) => {
    const uid = requireUid(request.auth);
    return action(getFirestore(), uid, request.data);
  });

export const createMatch = callable(matches.createMatch);
export const joinMatch = callable(matches.joinMatch);
export const leaveMatch = callable(matches.leaveMatch);
export const setLobbyCode = callable(matches.setLobbyCode);
export const startMatch = callable(matches.startMatch);
export const cancelMatch = callable(matches.cancelMatch);

// ---- Results and review (round B)
export const submitResult = callable(results.submitResult);
export const confirmResult = callable(results.confirmResult);
export const disputeResult = callable(results.disputeResult);
export const adminDecide = callable(admin.adminDecide);

// Every 5 minutes: results nobody responded to within 30 minutes go to review
// (silence counts as confirmation).
export const closeResponseWindows = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Madrid' },
  async () => {
    const count = await results.closeResponseWindows(getFirestore());
    if (count) logger.info('Moved matches to review after the deadline', { count });
  },
);

// Every 5 minutes: cancel open matches nobody filled within 15 minutes.
export const expireOpenMatches = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Madrid' },
  async () => {
    const count = await matches.cancelExpiredMatches(getFirestore());
    if (count) logger.info('Cancelled expired matches', { count });
  },
);

// Beta rules acceptance (saved on users/{uid} with a server timestamp).
export const acceptRules = callable(acceptRulesAction);

// ---- Admin email alerts
// The Gmail app password lives in Secret Manager (Firebase secret), never in code.
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

// When a match becomes under_review, email the admin (once per match).
export const alertAdminOnReview = onDocumentUpdated(
  { document: 'matches/{matchId}', secrets: [gmailAppPassword], retry: false },
  async (event) => {
    const before = event.data?.before.data() as MatchDoc | undefined;
    const after = event.data?.after.data() as MatchDoc | undefined;
    if (!after || after.status !== 'under_review' || before?.status === 'under_review') return;
    const result = await sendReviewAlert(
      getFirestore(),
      event.params.matchId,
      after,
      gmailAppPassword.value(),
    );
    logger.info('Review alert', { matchId: event.params.matchId, result });
  },
);
