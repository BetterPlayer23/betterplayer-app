import { getAuth } from 'firebase-admin/auth';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import * as B from './shared/badges';
import { requireAdmin } from './matches/admin';
import { fail } from './matches/common';

// Accounts left out of rankings (admins and test accounts):
// users/{uid}.excludeFromRankings (set only here; players can't write it,
// see firestore.rules) and a copy in rankingExclusions/{uid} for the Admin tab.
// An excluded player still plays and settles matches normally; they just never
// appear on leaderboards, never hold a crown or tier, and never get a Founder
// number. Opponents' results still count for the opponents.

export type ExclusionResult = { uid: string; gamerTag: string; excluded: boolean };

/** Sets or clears the flag. Excluding also removes the player from the live
 * season's boards and stats, from every crown, and clears their badges. */
export async function setRankingExclusion(
  db: Firestore,
  uid: string,
  exclude: boolean,
  reason: string,
  by: string | null,
  now = new Date(),
): Promise<ExclusionResult> {
  const userRef = db.collection('users').doc(uid);
  const user = await userRef.get();
  if (!user.exists) throw fail('not-found', 'No player with this profile.');
  const gamerTag = String(user.get('gamerTag') ?? 'Player');
  const listRef = db.collection('rankingExclusions').doc(uid);
  const batch = db.batch();
  batch.update(userRef, { excludeFromRankings: exclude });
  if (exclude) batch.set(listRef, { uid, gamerTag, reason, by, at: Timestamp.fromDate(now) });
  else batch.delete(listRef);
  await batch.commit();
  if (exclude) await removeFromRankings(db, uid, now);
  return { uid, gamerTag, excluded: exclude };
}

async function removeFromRankings(db: Firestore, uid: string, now: Date) {
  const season = B.seasonOf(now);
  // Live boards: take the player out; players below move up (their tiers too,
  // without a notification).
  for (const [game, stats] of Object.entries(B.BOARD_STATS)) {
    for (const stat of stats) {
      const ref = db.collection('leaderboards').doc(B.boardDocId(season, game, stat));
      await db.runTransaction(async (tx) => {
        const before = ((await tx.get(ref)).get('entries') ?? []) as B.BoardEntry[];
        if (!before.some((e) => e.uid === uid)) return;
        const after = before.filter((e) => e.uid !== uid);
        const moved = B.tierChanges(before, after, new Set(), () => 0).filter((c) => c.uid !== uid && c.to);
        const badgeRefs = moved.map((c) => db.collection('badges').doc(c.uid));
        const badgeSnaps = await Promise.all(badgeRefs.map((r) => tx.get(r)));
        tx.update(ref, { entries: after, updatedAt: Timestamp.fromDate(now) });
        moved.forEach((c, i) => {
          const b = (badgeSnaps[i].data() as B.PlayerBadges | undefined) ?? {};
          const next: B.PlayerBadges = {
            ...b,
            tiers: { ...B.currentTiers(b, season), [B.boardKey(game, stat)]: c.to! },
            tiersSeason: season,
          };
          next.chip = B.chipFor(next, season);
          tx.set(badgeRefs[i], { ...next, updatedAt: Timestamp.fromDate(now) });
        });
      });
    }
  }
  // Season totals (used for "your position" counts).
  const statDocs = await db.collection('seasonStats').where('uid', '==', uid).where('season', '==', season).get();
  for (const d of statDocs.docs) await d.ref.delete();
  // Crowns: the next best (non-excluded) holder takes over.
  // (records is a handful of documents; the player may also be in a history,
  // from where a reversal could bring them back.)
  const records = await db.collection('records').get();
  for (const r of records.docs) {
    await db.runTransaction(async (tx) => {
      const doc = (await tx.get(r.ref)).data() as B.RecordDoc | undefined;
      if (!doc || !(doc.history ?? []).some((h) => h.uid === uid) && doc.holder?.uid !== uid) return;
      const history = (doc.history ?? []).filter((h) => h.uid !== uid);
      const holder = history[0] ?? null;
      if (doc.holder?.uid !== uid) {
        tx.update(r.ref, { history });
        return;
      }
      const label = String(r.get('label') ?? r.id);
      const newRef = holder ? db.collection('badges').doc(holder.uid) : null;
      const nb = newRef ? ((await tx.get(newRef)).data() as B.PlayerBadges | undefined) ?? {} : null;
      tx.update(r.ref, { holder, history });
      if (newRef && nb && holder) {
        const next: B.PlayerBadges = { ...nb, crowns: { ...(nb.crowns ?? {}), [r.id]: { label, value: holder.value } } };
        next.chip = B.chipFor(next, season);
        tx.set(newRef, { ...next, updatedAt: Timestamp.fromDate(now) });
      }
    });
  }
  // Their own badges: no tiers, crowns or Founder number (trophies earned earlier stay).
  const badgesRef = db.collection('badges').doc(uid);
  await db.runTransaction(async (tx) => {
    const b = (await tx.get(badgesRef)).data() as B.PlayerBadges | undefined;
    if (!b) return;
    const next: B.PlayerBadges = { ...b, tiers: {}, tiersSeason: season, crowns: {} };
    delete next.founder;
    next.chip = null;
    tx.set(badgesRef, { ...next, updatedAt: Timestamp.fromDate(now) });
  });
}

/** Callable (admins): { gamerTag } or { uid }, and exclude true/false. */
export async function setRankingExclusionAction(db: Firestore, adminUid: string, data: Record<string, unknown> | undefined | null) {
  await requireAdmin(db, adminUid);
  const exclude = data?.exclude === true;
  let uid = typeof data?.uid === 'string' ? data.uid : '';
  const tag = typeof data?.gamerTag === 'string' ? data.gamerTag.trim() : '';
  if (!uid && tag) {
    const found = await db.collection('users').where('gamerTag', '==', tag).limit(2).get();
    if (found.empty) throw fail('not-found', `No player with the gamer tag “${tag}”.`);
    if (found.size > 1) throw fail('failed-precondition', 'Several players have this gamer tag.');
    uid = found.docs[0].id;
  }
  if (!uid) throw fail('invalid-argument', 'Enter a gamer tag.');
  return setRankingExclusion(db, uid, exclude, exclude ? 'Excluded by an admin' : '', adminUid);
}

// Test accounts: every frantzbenois+…@gmail.com address. The owner's own
// address (no "+") always stays included.
const TEST_EMAIL = /^frantzbenois\+[^@]*@gmail\.com$/i;
export const OWNER_EMAIL = 'frantzbenois@gmail.com'; // Fire__4REAL: Founder #1, always ranked
const EXCLUDED_TAGS = ['god']; // admin account(s), compared without case

export const isTestEmail = (email: string | undefined) => TEST_EMAIL.test((email ?? '').toLowerCase());
export const isExcludedTag = (tag: unknown) => typeof tag === 'string' && EXCLUDED_TAGS.includes(tag.toLowerCase());

/**
 * One-off (Maintenance → exclude-test-accounts): finds the admin / test
 * accounts and excludes them. Returns gamer tags only (never emails).
 */
export async function excludeTestAccounts(db: Firestore, apply: boolean) {
  const found: { uid: string; reason: string }[] = [];
  let kept: string | null = null;
  let pageToken: string | undefined;
  do {
    const page = await getAuth().listUsers(1000, pageToken);
    for (const u of page.users) {
      const email = (u.email ?? '').toLowerCase();
      if (email === OWNER_EMAIL) kept = u.uid;
      else if (TEST_EMAIL.test(email)) found.push({ uid: u.uid, reason: 'test account (frantzbenois+ address)' });
    }
    pageToken = page.pageToken;
  } while (pageToken);
  for (const tag of EXCLUDED_TAGS) {
    // Gamer tags are stored as typed; check the usual spellings.
    for (const t of new Set([tag, tag.toUpperCase(), tag[0].toUpperCase() + tag.slice(1)])) {
      const snap = await db.collection('users').where('gamerTag', '==', t).get();
      for (const d of snap.docs) {
        if (d.id !== kept && !found.some((f) => f.uid === d.id)) found.push({ uid: d.id, reason: 'admin account' });
      }
    }
  }
  const rows: { gamerTag: string; reason: string; done: boolean }[] = [];
  for (const f of found) {
    const user = await db.collection('users').doc(f.uid).get();
    const gamerTag = String(user.get('gamerTag') ?? '(no profile)');
    if (!user.exists) {
      rows.push({ gamerTag, reason: f.reason, done: false });
      continue;
    }
    if (apply) await setRankingExclusion(db, f.uid, true, f.reason, null);
    rows.push({ gamerTag, reason: f.reason, done: apply });
  }
  const keptTag = kept ? String((await db.collection('users').doc(kept).get()).get('gamerTag') ?? '(no profile)') : null;
  if (apply && kept) {
    // Make sure the owner's main account is included.
    const u = await db.collection('users').doc(kept).get();
    if (u.get('excludeFromRankings') === true) await setRankingExclusion(db, kept, false, '', null);
  }
  const admins = await db.collection('admins').get();
  const adminTags: string[] = [];
  for (const a of admins.docs) {
    if (found.some((f) => f.uid === a.id)) continue;
    adminTags.push(String((await db.collection('users').doc(a.id).get()).get('gamerTag') ?? '(no profile)'));
  }
  return { rows, keptTag, adminsStillIncluded: adminTags };
}
