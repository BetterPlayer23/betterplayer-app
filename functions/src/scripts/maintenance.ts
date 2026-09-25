/**
 * One-off data jobs (run from GitHub Actions → "Maintenance", or a terminal):
 *   node lib/scripts/maintenance.js migrate-platforms [--apply]
 *   node lib/scripts/maintenance.js rebuild-stats [--apply]
 * Without --apply it only previews and changes nothing. Prints counts only.
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { migratePlatforms, rebuildStats } from '../maintenance';
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
  } else {
    console.log('Choose migrate-platforms or rebuild-stats.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Maintenance failed:', safeError(error).message);
  process.exit(1);
});
