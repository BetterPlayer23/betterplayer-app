import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/firestore';
import { onCall, type CallableOptions, type CallableRequest } from 'firebase-functions/https';
import { setGlobalOptions } from 'firebase-functions/options';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/scheduler';

import * as matches from './matches/actions';
import * as admin from './matches/admin';
import { sendReviewAlert } from './matches/alerts';
import type { MatchDoc } from './matches/common';
import * as results from './matches/results';
import { requireUid, requireVerifiedEmail } from './matches/common';
import * as authEmails from './authEmails';
import { setRankingExclusionAction } from './exclusions';
import * as boards from './leaderboards';
import { previousSeason, seasonOf } from './shared/badges';
import { acceptRules as acceptRulesAction } from './rules';
import { guardBackground, guardCallable, registerSecret } from './safeLog';
import { grantStarterCredits } from './starterGrant';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();

// When a player's profile (users/{uid}) is created, give them their starter
// credits. Safe to retry: the grant happens at most once per player.
export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', retry: true },
  (event) =>
    guardBackground(
      'onUserCreated',
      async () => {
        const { uid } = event.params;
        const granted = await grantStarterCredits(getFirestore(), uid);
        logger.info(granted ? 'Starter credits granted' : 'Starter credits already granted', { uid });
      },
      true, // retried: the grant is idempotent
    ),
);

// Logging rule: never log secrets, API keys, passwords or whole error objects.
// Every function runs inside guardCallable / guardBackground (./safeLog), which
// log only a cleaned, shortened error description.

// ---- Match flow (round A). The app calls these; it never writes matches,
// wallets or the ledger itself.

type Action = (
  db: FirebaseFirestore.Firestore,
  uid: string,
  data: Record<string, unknown> | undefined,
) => Promise<unknown>;

// `verified`: the player's email must be verified (entering matches).
const callable = (action: Action, options: CallableOptions = {}, verified = false) =>
  onCall(options, async (request: CallableRequest<Record<string, unknown> | undefined>) => {
    const uid = requireUid(request.auth);
    if (verified) requireVerifiedEmail(request.auth);
    return guardCallable(action.name, () => action(getFirestore(), uid, request.data));
  });

export const createMatch = callable(matches.createMatch, {}, true);
export const joinMatch = callable(matches.joinMatch, {}, true);
export const leaveMatch = callable(matches.leaveMatch);
export const setLobbyCode = callable(matches.setLobbyCode);
export const startMatch = callable(matches.startMatch);
export const cancelMatch = callable(matches.cancelMatch);

// ---- Results and review (round B)
// The Anthropic API key (automatic result check) lives in Secret Manager
// (Firebase secret), never in code.
const anthropicApiKey = defineSecret('ANTHROPIC_API_KEY');

// Photo checks (sharp + the vision API) are CPU-heavy and slow: fewer requests
// per instance, more memory, and more instances than the light functions.
const photoOptions: CallableOptions = { memory: '1GiB', cpu: 1, concurrency: 8, maxInstances: 30 };

// Reporting a result runs the automatic check (Claude vision) on the screenshot.
export const submitResult = onCall(
  { ...photoOptions, secrets: [anthropicApiKey], timeoutSeconds: 120 },
  async (request: CallableRequest<Record<string, unknown> | undefined>) => {
    const uid = requireUid(request.auth);
    const apiKey = anthropicApiKey.value();
    registerSecret(apiKey);
    return guardCallable('submitResult', () =>
      results.submitResult(getFirestore(), uid, request.data, new Date(), apiKey),
    );
  },
);
export const confirmResult = callable(results.confirmResult);
// Dispute photos are checked for duplicates too.
export const disputeResult = callable(results.disputeResult, photoOptions);
export const adminDecide = callable(admin.adminDecide);
export const reverseAutoDecision = callable(admin.reverseAutoDecision);

// Every 5 minutes: results nobody responded to within 30 minutes go to review
// (silence counts as confirmation).
export const closeResponseWindows = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Madrid' },
  () =>
    guardBackground('closeResponseWindows', async () => {
      const count = await results.closeResponseWindows(getFirestore());
      if (count) logger.info('Moved matches to review after the deadline', { count });
    }),
);

// Every 5 minutes: cancel open matches nobody filled within 15 minutes.
export const expireOpenMatches = onSchedule(
  { schedule: 'every 5 minutes', timeZone: 'Europe/Madrid' },
  () =>
    guardBackground('expireOpenMatches', async () => {
      const count = await matches.cancelExpiredMatches(getFirestore());
      if (count) logger.info('Cancelled expired matches', { count });
    }),
);

// Beta rules acceptance (saved on users/{uid} with a server timestamp).
export const acceptRules = callable(acceptRulesAction);

// ---- Admin email alerts
// The Gmail app password lives in Secret Manager (Firebase secret), never in code.
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD');

// Our own verification and password-reset emails, linking to the in-app page
// /auth/action (Firebase's email template can't be changed for this project).
// Limited to 1 a minute and 5 an hour per player / per email address.
export const sendVerificationEmail = onCall(
  { secrets: [gmailAppPassword] },
  async (request: CallableRequest<Record<string, unknown> | undefined>) => {
    const uid = requireUid(request.auth);
    const password = gmailAppPassword.value();
    registerSecret(password);
    return guardCallable('sendVerificationEmail', () =>
      authEmails.sendVerificationEmail(getFirestore(), uid, password),
    );
  },
);

// "Forgot password?": no sign-in needed.
export const sendPasswordResetEmail = onCall(
  { secrets: [gmailAppPassword] },
  async (request: CallableRequest<Record<string, unknown> | undefined>) => {
    const password = gmailAppPassword.value();
    registerSecret(password);
    return guardCallable('sendPasswordResetEmail', () =>
      authEmails.sendPasswordResetEmail(getFirestore(), request.data, password),
    );
  },
);

// When a match becomes under_review, email the admin (once per match).
export const alertAdminOnReview = onDocumentUpdated(
  { document: 'matches/{matchId}', secrets: [gmailAppPassword], retry: false },
  (event) =>
    guardBackground('alertAdminOnReview', async () => {
      const before = event.data?.before.data() as MatchDoc | undefined;
      const after = event.data?.after.data() as MatchDoc | undefined;
      if (!after || after.status !== 'under_review' || before?.status === 'under_review') return;
      const password = gmailAppPassword.value();
      registerSecret(password);
      const result = await sendReviewAlert(getFirestore(), event.params.matchId, after, password);
      logger.info('Review alert', { matchId: event.params.matchId, result });
    }),
);

// ---- Badges, leaderboards, crowns (./leaderboards.ts)

// Every settled match (admin decision or automatic approval) and every reversal
// writes admin_reviews/{id}: count it in the season stats, leaderboards, tiers
// and crowns. Retried on failure; a second run does nothing.
export const onMatchDecided = onDocumentCreated(
  { document: 'admin_reviews/{reviewId}', retry: true },
  (event) =>
    guardBackground(
      'onMatchDecided',
      async () => {
        const result = await boards.applyReview(getFirestore(), event.params.reviewId);
        logger.info('Leaderboards updated', { reviewId: event.params.reviewId, result });
      },
      true,
    ),
);

// Founder badge: called by the app once the player's email is verified.
const claimFounderAction: Action = (db, uid) => boards.claimFounder(db, uid);
export const claimFounder = callable(claimFounderAction, {}, true);

// Admins: mark a suspicious-pattern flag as reviewed.
export const dismissFlag = callable(boards.dismissFlag);

// Admins: leave an admin / test account out of rankings and Founder numbers (or include it again).
export const setRankingExclusion = callable(setRankingExclusionAction);

// 00:10 on the 1st of each month (Spain): close last month's season and give
// every Prism holder a permanent trophy.
export const closeSeasons = onSchedule(
  { schedule: '10 0 1 * *', timeZone: 'Europe/Madrid' },
  () =>
    guardBackground('closeSeasons', async () => {
      const season = previousSeason(seasonOf(new Date()));
      const trophies = await boards.closeSeason(getFirestore(), season);
      logger.info('Season closed', { season, trophies });
    }),
);
