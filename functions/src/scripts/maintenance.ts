/**
 * One-off data jobs (run from GitHub Actions → "Maintenance", or a terminal):
 *   node lib/scripts/maintenance.js migrate-platforms [--apply]
 *   node lib/scripts/maintenance.js rebuild-stats [--apply]
 *   node lib/scripts/maintenance.js backfill-image-hashes [--apply]
 *   node lib/scripts/maintenance.js migrate-private [--apply]
 *   node lib/scripts/maintenance.js exclude-test-accounts [--apply]
 *   node lib/scripts/maintenance.js assign-founders [--apply]
 * Without --apply it only previews and changes nothing. Prints counts only.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import {
  assignFounders,
  backfillImageHashes,
  migratePlatforms,
  migratePrivate,
  rebuildStats,
} from '../maintenance';
import { excludeTestAccounts } from '../exclusions';
import { safeError } from '../safeLog';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'betterplayer-beta';

async function main() {
  const [task] = process.argv.slice(2);
  const apply = process.argv.includes('--apply');
  initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  const mode = apply ? 'APPLIED' : 'preview only, nothing changed';

  if (task === 'migrate-platforms') {
    const n = await migratePlatforms(db, apply);
    console.log(`Profiles moved from one platform to a list: ${n} (${mode})`);
  } else if (task === 'rebuild-stats') {
    const r = await rebuildStats(db, apply);
    console.log(`Stats rebuilt from ${r.matches} settled matches for ${r.players} players (${mode})`);
  } else if (task === 'backfill-image-hashes') {
    const n = await backfillImageHashes(db, apply);
    console.log(`Image hashes given search pieces: ${n} (${mode})`);
  } else if (task === 'migrate-private') {
    const n = await migratePrivate(db, apply);
    console.log(`Matches with lobby code / game IDs moved to private data: ${n} (${mode})`);
  } else if (task === 'exclude-test-accounts') {
    // Gamer tags only (never emails): Actions logs may be public.
    const r = await excludeTestAccounts(db, apply);
    console.log(`Accounts left out of rankings and Founder numbers: ${r.rows.length} (${mode})`);
    for (const row of r.rows) console.log(`  - ${row.gamerTag}: ${row.reason}`);
    console.log(`Kept in rankings (owner's main account): ${r.keptTag ?? 'not found'}`);
    if (r.adminsStillIncluded.length) {
      console.log(`Admins still included (use the Admin tab to exclude): ${r.adminsStillIncluded.join(', ')}`);
    }
  } else if (task === 'assign-founders') {
    const r = await assignFounders(db, apply);
    console.log(
      `Verified players: ${r.verified} (${r.excluded} admin/test accounts left out). Founder numbers given: ${r.assigned}. Already founders: ${r.already} (${mode})`,
    );
  } else {
    console.log('Choose migrate-platforms, rebuild-stats, backfill-image-hashes, migrate-private, exclude-test-accounts or assign-founders.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Maintenance failed:', safeError(error).message);
  process.exit(1);
});
