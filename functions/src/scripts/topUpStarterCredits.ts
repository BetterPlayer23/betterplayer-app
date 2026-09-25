/**
 * One-time top-up: gives the 10 starter credits to players who signed up
 * before the onUserCreated Cloud Function was deployed.
 *
 * Safe to run any number of times: it uses the same grantStarterCredits as the
 * Cloud Function, so a player who already has ledger/grant_{uid} gets nothing.
 *
 * Run from Google Cloud Shell (repo root):
 *   ./top-up.sh            # preview only, changes nothing
 *   ./top-up.sh --apply    # actually gives the credits
 */
import { safeError } from '../safeLog';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { grantStarterCredits } from '../starterGrant';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'betterplayer-beta';

async function main() {
  const apply = process.argv.includes('--apply');
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();

  // Only players with a profile (users/{uid}). Accounts without one get their
  // credits automatically when they finish their profile.
  const users = await db.collection('users').select('gamerTag').get();
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Players with a profile: ${users.size}`);

  const missing: { uid: string; gamerTag: string }[] = [];
  for (const user of users.docs) {
    const grant = await db.collection('ledger').doc(`grant_${user.id}`).get();
    if (!grant.exists) missing.push({ uid: user.id, gamerTag: String(user.get('gamerTag') ?? '?') });
  }

  if (missing.length === 0) {
    console.log('Everyone already has their starter credits. Nothing to do.');
    return;
  }

  console.log(`Players without starter credits: ${missing.length}`);
  for (const m of missing) console.log(`  - ${m.gamerTag} (${m.uid})`);

  if (!apply) {
    console.log('\nPreview only: nothing was changed.');
    console.log('To give these players their 10 starter credits, run: ./top-up.sh --apply');
    return;
  }

  let granted = 0;
  for (const m of missing) {
    // Re-checked inside a transaction, so this can never grant twice.
    if (await grantStarterCredits(db, m.uid)) granted++;
  }
  console.log(`\nDone. Gave 10 starter credits to ${granted} player(s).`);
}

main().catch((error) => {
  console.error('Top-up failed:', safeError(error).message);
  process.exit(1);
});
