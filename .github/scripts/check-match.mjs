// Read-only: did the automatic result check run on the latest match between
// two players, and what did it return? Prints no emails or in-game names.
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { namesMatch } = require('./lib/matches/vision.js');

const PROJECT = 'betterplayer-beta';
initializeApp({ projectId: PROJECT });
const db = getFirestore();
process.on('unhandledRejection', (e) => {
  console.log('Check stopped:', String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
const say = (q, a) => console.log(`${q.padEnd(44)} ${a}`);
const tags = [process.env.PLAYER1, process.env.PLAYER2].map((t) => (t || '').trim());

const uids = [];
for (const tag of tags) {
  const snap = await db.collection('users').where('gamerTag', '==', tag).limit(1).get();
  say(`Player "${tag}" found:`, snap.empty ? 'NO' : 'YES');
  if (!snap.empty) uids.push(snap.docs[0].id);
}
if (uids.length < 2) process.exit(1);

const candidates = await db.collection('matches').where('playerUids', 'array-contains', uids[0])
  .orderBy('createdAt', 'desc').limit(30).get();
const doc = candidates.docs.find((d) => d.get('playerUids').includes(uids[1]));
if (!doc) { say('Match between them:', 'NONE FOUND'); process.exit(0); }
const m = doc.data();
const label = (uid) => (uid === uids[0] ? tags[0] : uid === uids[1] ? tags[1] : 'other player');
const when = (ts) => (ts ? ts.toDate().toISOString() : '—');

console.log('\n== Match');
say('Game:', m.gameName);
say('Created / started:', `${when(m.createdAt)} / ${when(m.startedAt)}`);
say('Status now:', m.status);
say('Reported by:', m.reportedByUid ? label(m.reportedByUid) : '—');
say('Reported at:', when(m.reportedAt));
say('Why it needs review (reviewReasons):', JSON.stringify(m.reviewReasons ?? null));
say('Decided by:', m.decidedBy ?? '—');

console.log('\n== Automatic check (saved on the match)');
if (!m.verification) {
  say('Verification saved:', 'NO (the check did not run for this match)');
} else {
  const v = m.verification;
  say('Verification saved:', 'YES');
  say('Result:', v.status);
  say('Confidence:', String(v.confidence));
  say('Reason:', v.reason);
  say('Model:', v.model ?? '—');
  say('Looks like an earlier photo:', v.similarTo ? 'YES' : 'NO');
  say('Checked at:', when(v.checkedAt));
}

if (m.reportedByUid) {
  const r = (await doc.ref.collection('reports').doc(m.reportedByUid).get()).data();
  if (r) {
    console.log('\n== The report');
    const d = r.details ?? {};
    for (const [k, map] of Object.entries(d)) {
      say(`Reported ${k}:`, Object.entries(map).map(([u, n]) => `${label(u)} ${n}`).join(', '));
    }
    say('Reported winner:', r.winnerUid ? label(r.winnerUid) : 'none (draw)');
    console.log('\n== What the AI read on the photo');
    const v = r.vision;
    if (!v) {
      say('Reading saved:', 'NO (no answer from the AI: not set up, error, or refused)');
    } else {
      say('Final result screen:', v.isFinalScreen ? 'YES' : 'NO');
      say('Names read:', String(v.playerNames?.length ?? 0));
      say('Numbers read:', JSON.stringify(v.scores ?? []));
      if (v.damage) say('Damage read:', JSON.stringify(v.damage));
      say('Winner name read:', v.winnerName ? 'yes' : 'none');
      say('AI confidence:', String(v.confidence));
      say('AI notes:', v.notes || '—');
      for (const p of m.players) {
        const i = (v.playerNames ?? []).findIndex((n) => namesMatch(n, p.gameId) || namesMatch(n, p.gamerTag));
        say(`${p.gamerTag}'s saved ID found on the photo:`, i < 0 ? 'NO' : `YES (number ${v.scores?.[i]})`);
      }
    }
  }
}

console.log('\n== submitResult logs around the report (warnings and errors)');
const t = m.reportedAt?.toDate() ?? m.updatedAt?.toDate() ?? new Date();
const from = new Date(t.getTime() - 10 * 60_000).toISOString();
const to = new Date(t.getTime() + 10 * 60_000).toISOString();
const filter = `resource.type="cloud_run_revision" AND resource.labels.service_name="submitresult" AND severity>=WARNING AND timestamp>="${from}" AND timestamp<="${to}"`;
try {
  const out = execFileSync('gcloud', ['logging', 'read', filter, '--project', PROJECT, '--limit', '30', '--format', 'json'], { encoding: 'utf8' });
  const entries = JSON.parse(out || '[]');
  if (!entries.length) console.log('No warnings or errors.');
  for (const e of entries.reverse()) {
    // Request records (run.googleapis.com/requests) have no text, only the
    // HTTP answer. (An empty "{}" would be starred out by GitHub, because the
    // deploy key secret contains lines that are just "{" and "}".)
    const msg = e.httpRequest
      ? `request answered ${e.httpRequest.status ?? '?'} (${e.httpRequest.latency ?? '?'})`
      : e.jsonPayload?.message ?? e.textPayload ?? '(no text)';
    const err = e.jsonPayload?.error ? ` | ${String(e.jsonPayload.error)}` : '';
    console.log(`${e.timestamp} ${e.severity}: ${String(msg).split('\n')[0].slice(0, 200)}${err.slice(0, 300)}`);
  }
} catch (e) {
  console.log('Could not read logs:', String(e.message).split('\n')[0]);
}
