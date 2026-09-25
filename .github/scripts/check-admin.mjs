// Read-only check: why doesn't a player see the Admin tab?
// Prints only yes/no answers (the repo's Actions logs may be public).
import { createRequire } from 'module';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp, cert } = require('firebase-admin/app');
const { readFileSync } = await import('fs');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT = 'betterplayer-beta';
const API_KEY = process.env.FIREBASE_WEB_API_KEY; // public web key from src/firebase/config.ts
const uid = (process.env.CHECK_UID || '').trim();
if (!uid) throw new Error('Give the uid to check.');

// Use the deploy key directly so custom tokens are signed locally.
initializeApp({
  projectId: PROJECT,
  credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
});
// Never dump error objects (they can be long); print a short message only.
process.on('unhandledRejection', (e) => {
  console.log('Check stopped:', String(e?.message ?? e).split('.')[0]);
  process.exit(1);
});
const db = getFirestore();
const say = (q, a) => console.log(`${q.padEnd(58)} ${a}`);

// 1. Is there a login account with exactly this uid?
let authUser = null;
try { authUser = await getAuth().getUser(uid); } catch { /* not found */ }
say('1. A login account exists with exactly this uid:', authUser ? 'YES' : 'NO');

// 2. Does admins/{uid} exist?
const adminDoc = await db.collection('admins').doc(uid).get();
say('2. admins/{uid} exists with exactly this id:', adminDoc.exists ? 'YES' : 'NO');
if (!adminDoc.exists) {
  const all = await db.collection('admins').listDocuments();
  const norm = (s) => s.replace(/[lI1]/g, '?').replace(/[O0]/g, '?').toLowerCase();
  const lookAlike = all.some((d) => norm(d.id) === norm(uid));
  say('   admin documents in the collection:', String(all.length));
  say('   one of them looks almost the same (l/I, O/0 or case):', lookAlike ? 'YES' : 'NO');
  const spaced = all.some((d) => d.id.trim() === uid && d.id !== uid);
  say('   one of them is this uid with extra spaces:', spaced ? 'YES' : 'NO');
}

// 3. Signed in as that player, do the LIVE rules let them read admins/{uid}?
if (authUser && API_KEY) {
  const custom = await getAuth().createCustomToken(uid);
  const signIn = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  const { idToken } = await signIn.json();
  const read = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/admins/${uid}`,
    { headers: { authorization: `Bearer ${idToken}` } });
  const verdict = read.status === 200 ? 'YES (found)' : read.status === 404 ? 'ALLOWED, but no document' : read.status === 403 ? 'NO (refused by rules)' : `HTTP ${read.status}`;
  say('3. Live rules let this player read admins/{uid}:', verdict);
} else {
  say('3. Live rules check:', 'skipped (no login account for this uid)');
}

// 4. Anything waiting for review?
const queue = await db.collection('matches').where('status', '==', 'under_review').count().get();
say('4. Matches under review:', String(queue.data().count));
