import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import * as B from './shared/badges';
import { ADMIN_NOTE_MAX, ADMIN_NOTE_MIN, getGame } from './shared/games';
import {
  loadAntiCheat,
  playerChecksRef,
  promotionTime,
  publicSettings,
  qualifiesForTop,
  readChecks,
  shouldWatch,
} from './antiCheat';
import {
  prepareBoardUpdate,
  removeCrowns,
  removeFromBoards,
  seasonPrivateRef,
  seasonStatsRef,
  toSeasonStats,
} from './boardEngine';
import { applyCrowns, disqualifiedRef, notify, type RecordCandidate, type StoredEntry } from './leaderboards';
import { requireAdmin } from './matches/admin';
import { fail, madridDay, matchRef } from './matches/common';

// Fair play: player reports, spot checks, held results and sanctions.
// Every admin action needs a note and is written to auditLog (append-only:
// created here, never changed or deleted). Players only ever see neutral
// texts; the reasons stay with admins.

type Data = Record<string, unknown> | undefined | null;

export const CONTACT_EMAIL = 'Better.player.one@gmail.com';
export const REPORT_REASON_MIN = 5;
export const REPORT_REASON_MAX = 300;
const REPORTS_PER_DAY = 5;

export const TEXT = {
  warning: `A Betterplayer admin found a problem with one of your results. Fake results lead to removal of badges and trophies and to account deactivation. To dispute this decision, email ${CONTACT_EMAIL}.`,
  rejected: `One of your results was removed from the leaderboards after a review. To dispute this decision, email ${CONTACT_EMAIL}.`,
  disqualified: (board: string) =>
    `Your ${board} results this season were removed from the leaderboards after a review. To dispute this decision, email ${CONTACT_EMAIL}.`,
};

const publicStatsRef = (db: Firestore, season: string) => db.collection('publicStats').doc(season);

function readNote(data: Data): string {
  const note = typeof data?.note === 'string' ? data.note.trim() : '';
  if (note.length < ADMIN_NOTE_MIN || note.length > ADMIN_NOTE_MAX) {
    throw fail('invalid-argument', `Add a note of ${ADMIN_NOTE_MIN} to ${ADMIN_NOTE_MAX} characters.`);
  }
  return note;
}

async function audit(
  db: Firestore,
  entry: { action: string; adminUid: string; targetUid: string | null; note: string; ref?: string; detail?: string },
) {
  await db.collection('auditLog').add({ ...entry, ref: entry.ref ?? null, detail: entry.detail ?? null, createdAt: FieldValue.serverTimestamp() });
}

const tagOfUser = async (db: Firestore, uid: string) =>
  String((await db.collection('users').doc(uid).get()).get('gamerTag') ?? 'Player');

// ---------- reportPlayer (any signed-in player, from a leaderboard row)

export async function reportPlayer(db: Firestore, uid: string, data: Data, now = new Date()) {
  const targetUid = typeof data?.targetUid === 'string' ? data.targetUid : '';
  const game = typeof data?.game === 'string' ? data.game : '';
  const stat = typeof data?.stat === 'string' ? data.stat : '';
  const reason = typeof data?.reason === 'string' ? data.reason.trim() : '';
  if (!targetUid || !getGame(game) || !(B.BOARD_STATS[game] ?? []).includes(stat as B.StatId)) {
    throw fail('invalid-argument', 'Choose a player on a leaderboard.');
  }
  if (targetUid === uid) throw fail('invalid-argument', 'You can’t report yourself.');
  if (reason.length < REPORT_REASON_MIN || reason.length > REPORT_REASON_MAX) {
    throw fail('invalid-argument', `Explain what looks wrong in ${REPORT_REASON_MIN} to ${REPORT_REASON_MAX} characters.`);
  }
  const countRef = db.collection('reportCounts').doc(`${uid}_${madridDay(now)}`);
  const [target, reporter] = await Promise.all([
    db.collection('users').doc(targetUid).get(),
    db.collection('users').doc(uid).get(),
  ]);
  if (!target.exists) throw fail('not-found', 'This player doesn’t exist.');
  await db.runTransaction(async (tx) => {
    const count = Number((await tx.get(countRef)).get('count') ?? 0);
    if (count >= REPORTS_PER_DAY) {
      throw fail('resource-exhausted', 'You’ve reached today’s report limit. Try again tomorrow.');
    }
    tx.set(countRef, { uid, count: count + 1 });
    tx.create(db.collection('playerReports').doc(), {
      reporterUid: uid,
      reporterTag: String(reporter.get('gamerTag') ?? 'Player'),
      targetUid,
      targetTag: String(target.get('gamerTag') ?? 'Player'),
      game,
      gameName: getGame(game)!.name,
      stat,
      season: B.seasonOf(now),
      reason,
      status: 'open',
      createdAt: Timestamp.fromDate(now),
    });
  });
  return { ok: true };
}

// ---------- sanctions

/** A proven fake: 1st → warning, 2nd → account deactivated. */
async function strike(db: Firestore, uid: string, adminUid: string, note: string, now: Date) {
  const anti = await loadAntiCheat(db);
  const season = B.seasonOf(now);
  const strikes = await db.runTransaction(async (tx) => {
    const ref = playerChecksRef(db, uid);
    const c = readChecks((await tx.get(ref)).data(), season);
    c.rejected += 1;
    c.strikes += 1;
    c.watch = shouldWatch(anti, c);
    tx.set(ref, { ...c, updatedAt: Timestamp.fromDate(now) }, { merge: true });
    tx.set(publicStatsRef(db, season), { season, rejected: FieldValue.increment(1) }, { merge: true });
    if (c.strikes === 1) notify(tx, db, uid, 'warning', TEXT.warning, now);
    return c.strikes;
  });
  if (strikes >= 2) await deactivate(db, uid, adminUid, `Second proven fake result. ${note}`, now);
  return strikes;
}

async function deactivate(db: Firestore, uid: string, adminUid: string, note: string, now: Date) {
  const season = B.seasonOf(now);
  const userRef = db.collection('users').doc(uid);
  const already = (await userRef.get()).get('deactivated') === true;
  await getAuth().updateUser(uid, { disabled: true });
  await getAuth().revokeRefreshTokens(uid);
  await userRef.set({ deactivated: true, excludeFromRankings: true, deactivatedAt: Timestamp.fromDate(now) }, { merge: true });
  if (!already) {
    await publicStatsRef(db, season).set({ season, deactivated: FieldValue.increment(1) }, { merge: true });
  }
  const anti = await loadAntiCheat(db);
  await removeFromBoards(db, uid, { season, games: Object.keys(B.BOARD_STATS), now, promoteAt: promotionTime(anti, now) });
  await removeCrowns(db, uid, { now });
  await db.runTransaction(async (tx) => {
    const ref = db.collection('badges').doc(uid);
    const b = (await tx.get(ref)).data() as B.PlayerBadges | undefined;
    if (!b) return;
    tx.set(ref, { ...b, tiers: {}, crowns: {}, chip: null, updatedAt: Timestamp.fromDate(now) });
  });
  await audit(db, { action: 'deactivate', adminUid, targetUid: uid, note });
}

async function disqualify(db: Firestore, uid: string, game: string, season: string, adminUid: string, note: string, now: Date) {
  const g = getGame(game);
  if (!g || !B.BOARD_STATS[game]) throw fail('invalid-argument', 'Choose a game with leaderboards.');
  const anti = await loadAntiCheat(db);
  await disqualifiedRef(db, season, game, uid).set({ uid, season, game, adminUid, note, createdAt: Timestamp.fromDate(now) });
  await removeFromBoards(db, uid, { season, games: [game], now, promoteAt: promotionTime(anti, now) });
  await removeCrowns(db, uid, { now, game, season });
  // Badges: that game's tiers and that season's trophies there go.
  await db.runTransaction(async (tx) => {
    const ref = db.collection('badges').doc(uid);
    const b = (await tx.get(ref)).data() as B.PlayerBadges | undefined;
    if (!b) return;
    const live = B.seasonOf(now);
    const tiers = Object.fromEntries(
      Object.entries(B.currentTiers(b, live)).filter(([k]) => !(season === live && k.startsWith(`${game}.`))),
    );
    const trophies = (b.trophies ?? []).filter((t) => !(t.season === season && t.game === game));
    const next: B.PlayerBadges = { ...b, tiers, tiersSeason: live, trophies };
    next.chip = B.chipFor(next, live);
    tx.set(ref, { ...next, updatedAt: Timestamp.fromDate(now) });
    notify(tx, db, uid, 'disqualified', TEXT.disqualified(g.name), now);
  });
}

// ---------- held results: release (count it) or reject (fake)

async function settleHeld(db: Firestore, heldId: string, adminUid: string, release: boolean, now: Date) {
  const anti = await loadAntiCheat(db);
  const heldRef = db.collection('heldResults').doc(heldId);
  const info = await db.runTransaction(async (tx) => {
    const held = await tx.get(heldRef);
    if (!held.exists) throw fail('not-found', 'This held result doesn’t exist.');
    if (held.get('status') !== 'held') throw fail('failed-precondition', 'This result has already been decided.');
    const { uid, game, season, matchId } = held.data() as { uid: string; game: string; season: string; matchId: string };
    if (uid === adminUid) throw fail('permission-denied', 'You can’t review your own result.');
    const c = held.get('contribution') as B.SeasonStats;
    const clean = held.get('clean') === true;
    const entryRef = db.collection('leaderboardEntries').doc(matchId);
    const [st, pr, chk, user, dq, entry] = await Promise.all([
      tx.get(seasonStatsRef(db, season, game, uid)),
      tx.get(seasonPrivateRef(db, season, game, uid)),
      tx.get(playerChecksRef(db, uid)),
      tx.get(db.collection('users').doc(uid)),
      tx.get(disqualifiedRef(db, season, game, uid)),
      tx.get(entryRef),
    ]);
    const counts = release && user.get('excludeFromRankings') !== true && !dq.exists;
    let full = toSeasonStats(st.data());
    let cleanStats = toSeasonStats(pr.get('clean'));
    if (counts) {
      full = B.addContribution(full, c, 1);
      if (clean) cleanStats = B.addContribution(cleanStats, c, 1);
    }
    const verifying = Math.max(0, Number(st.get('verifying') ?? 0) - 1);
    const checks = readChecks(chk.data(), season);
    if (counts && clean) checks.verifiedMatches += 1;
    const upd = await prepareBoardUpdate(tx, db, {
      season,
      game,
      changes: [
        {
          uid,
          tag: String(held.get('gamerTag') ?? 'Player'),
          full,
          clean: cleanStats,
          qualified: qualifiesForTop(anti, uid, checks),
          verifying: verifying > 0,
        },
      ],
      now,
      promoteAt: promotionTime(anti, now),
    });
    // ---- writes
    upd.write();
    const at = Timestamp.fromDate(now);
    if (st.exists || counts) {
      tx.set(
        seasonStatsRef(db, season, game, uid),
        { season, game, uid, tag: String(held.get('gamerTag') ?? 'Player'), ...full, avgElims: B.statValue(full, 'avgElims'), verifying, updatedAt: at },
      );
    }
    if (counts) {
      tx.set(seasonPrivateRef(db, season, game, uid), { season, game, uid, clean: cleanStats, updatedAt: at });
      tx.set(playerChecksRef(db, uid), { verifiedMatches: checks.verifiedMatches, updatedAt: at }, { merge: true });
      // So a later reversal of the match takes it out again.
      const e = (entry.data() as StoredEntry | undefined) ?? null;
      if (e) {
        tx.update(entryRef, {
          [`players.${uid}`]: { tag: String(held.get('gamerTag') ?? 'Player'), c, clean },
          held: (e.held ?? []).filter((h) => h !== uid),
        });
      }
    }
    tx.update(heldRef, { status: release ? 'released' : 'rejected', decidedBy: adminUid, decidedAt: at });
    return { uid, game, matchId, counts, clean, candidates: (held.get('candidates') ?? []) as RecordCandidate[], tag: String(held.get('gamerTag') ?? 'Player') };
  });
  // Crowns for a released clean result (a separate step).
  if (info.counts && info.clean && info.candidates.length) {
    const g = getGame(info.game)!;
    const defs = B.recordsFor(g.id, g.name);
    await db.runTransaction(async (tx) => {
      const snaps = await Promise.all(info.candidates.map((c) => tx.get(db.collection('records').doc(c.id))));
      const docs = Object.fromEntries(info.candidates.map((c, i) => [c.id, snaps[i].data() as B.RecordDoc | undefined]));
      const res = applyCrowns(
        defs,
        docs,
        info.candidates.map((c) => ({ uid: info.uid, tag: info.tag, id: c.id, value: c.value })),
        info.matchId,
        now.getTime(),
      );
      const people = [...new Set([...res.gain.map((x) => x.uid), ...res.lose.map((x) => x.uid)])];
      const badgeSnaps = await Promise.all(people.map((u) => tx.get(db.collection('badges').doc(u))));
      for (const [id, doc] of Object.entries(res.writes)) {
        tx.set(db.collection('records').doc(id), { ...doc, game: g.id, label: defs.find((d) => d.id === id)?.label ?? id });
      }
      const live = B.seasonOf(now);
      people.forEach((u, i) => {
        const b = (badgeSnaps[i].data() as B.PlayerBadges | undefined) ?? {};
        const crowns = { ...(b.crowns ?? {}) };
        for (const l of res.lose.filter((x) => x.uid === u)) delete crowns[l.id];
        for (const w of res.gain.filter((x) => x.uid === u)) crowns[w.id] = { label: w.label, value: w.value };
        const next: B.PlayerBadges = { ...b, crowns };
        next.chip = B.chipFor(next, live);
        tx.set(badgeSnaps[i].ref, { ...next, updatedAt: Timestamp.fromDate(now) });
      });
      for (const l of res.lose) if (l.by) notify(tx, db, l.uid, 'crown_lost', B.lostCrownText(l.by, l.label), now);
    });
  }
  return info;
}

// ---------- spot checks: OK, or reject (the result was fake)

async function rejectMatchResult(db: Firestore, matchId: string, now: Date) {
  const anti = await loadAntiCheat(db);
  const entryRef = db.collection('leaderboardEntries').doc(matchId);
  const entry = (await entryRef.get()).data() as StoredEntry | undefined;
  if (!entry?.counted || !Object.keys(entry.players ?? {}).length) return;
  await db.runTransaction(async (tx) => {
    const e = (await tx.get(entryRef)).data() as StoredEntry | undefined;
    if (!e?.counted) return;
    const uids = Object.keys(e.players);
    const snaps = await Promise.all(
      uids.flatMap((u) => [tx.get(seasonStatsRef(db, e.season, e.game, u)), tx.get(seasonPrivateRef(db, e.season, e.game, u)), tx.get(playerChecksRef(db, u))]),
    );
    const changes = uids.map((u, i) => {
      const p = e.players[u];
      const full = B.addContribution(toSeasonStats(snaps[3 * i].data()), p.c, -1);
      const clean = p.clean ? B.addContribution(toSeasonStats(snaps[3 * i + 1].get('clean')), p.c, -1) : toSeasonStats(snaps[3 * i + 1].get('clean'));
      return { uid: u, tag: p.tag, full, clean, qualified: qualifiesForTop(anti, u, readChecks(snaps[3 * i + 2].data(), e.season)), verifying: Number(snaps[3 * i].get('verifying') ?? 0) > 0 };
    });
    const upd = await prepareBoardUpdate(tx, db, { season: e.season, game: e.game, changes, now, promoteAt: promotionTime(anti, now) });
    upd.write();
    const at = Timestamp.fromDate(now);
    changes.forEach((c) => {
      tx.set(seasonStatsRef(db, e.season, e.game, c.uid), { ...c.full, avgElims: B.statValue(c.full, 'avgElims'), updatedAt: at }, { merge: true });
      tx.set(seasonPrivateRef(db, e.season, e.game, c.uid), { clean: c.clean, updatedAt: at }, { merge: true });
    });
    tx.update(entryRef, { counted: false, players: {}, rejected: true, updatedAt: at });
  });
  // Crowns set by this match go back to the next best.
  const records = await db.collection('records').get();
  for (const r of records.docs) {
    if (!((r.get('history') ?? []) as B.RecordHolder[]).some((h) => h.matchId === matchId)) continue;
    await db.runTransaction(async (tx) => {
      const doc = (await tx.get(r.ref)).data() as B.RecordDoc | undefined;
      const next = B.removeMatchFromRecord(doc, matchId);
      const changed = doc?.holder?.uid !== next.holder?.uid;
      const [oldB, newB] = await Promise.all([
        changed && doc?.holder ? tx.get(db.collection('badges').doc(doc.holder.uid)) : null,
        changed && next.holder ? tx.get(db.collection('badges').doc(next.holder.uid)) : null,
      ]);
      tx.update(r.ref, { holder: next.holder, history: next.history });
      const live = B.seasonOf(now);
      if (oldB) {
        const b = (oldB.data() as B.PlayerBadges | undefined) ?? {};
        const crowns = { ...(b.crowns ?? {}) };
        delete crowns[r.id];
        const nb: B.PlayerBadges = { ...b, crowns };
        nb.chip = B.chipFor(nb, live);
        tx.set(oldB.ref, { ...nb, updatedAt: Timestamp.fromDate(now) });
      }
      if (newB && next.holder) {
        const b = (newB.data() as B.PlayerBadges | undefined) ?? {};
        const nb: B.PlayerBadges = { ...b, crowns: { ...(b.crowns ?? {}), [r.id]: { label: String(r.get('label') ?? r.id), value: next.holder.value } } };
        nb.chip = B.chipFor(nb, live);
        tx.set(newB.ref, { ...nb, updatedAt: Timestamp.fromDate(now) });
      }
    });
  }
}

// ---------- the admin callable

export type IntegrityAction = 'release' | 'reject' | 'spot_ok' | 'dismiss' | 'disqualify' | 'warn' | 'deactivate';
const ACTIONS: IntegrityAction[] = ['release', 'reject', 'spot_ok', 'dismiss', 'disqualify', 'warn', 'deactivate'];

/**
 * integrityAction({ action, note, heldId? | spotId? | reportId? | targetUid?, game?, season? })
 * - release / reject: a held result (reject = a proven fake: strike)
 * - spot_ok / reject: a spot check (reject takes the match off the boards, strike for the reporter)
 * - dismiss: a player report
 * - disqualify (targetUid, game, season?), warn, deactivate (targetUid)
 */
export async function integrityAction(db: Firestore, adminUid: string, data: Data, now = new Date()) {
  const action = data?.action as IntegrityAction;
  if (!ACTIONS.includes(action)) throw fail('invalid-argument', 'Choose an action.');
  const note = readNote(data);
  await requireAdmin(db, adminUid);
  const str = (k: string) => (typeof data?.[k] === 'string' ? (data[k] as string) : '');
  const heldId = str('heldId');
  const spotId = str('spotId');
  const reportId = str('reportId');
  let targetUid = str('targetUid');
  const at = Timestamp.fromDate(now);

  // A report being acted on: its target, and it is closed with the action.
  if (reportId) {
    const rep = await db.collection('playerReports').doc(reportId).get();
    if (!rep.exists) throw fail('not-found', 'This report doesn’t exist.');
    targetUid = targetUid || String(rep.get('targetUid'));
  }
  if (targetUid === adminUid) throw fail('permission-denied', 'You can’t act on your own account.');
  const closeReport = async () => {
    if (reportId) await db.collection('playerReports').doc(reportId).update({ status: action, decidedBy: adminUid, note, decidedAt: at });
  };

  if ((action === 'release' || action === 'reject') && heldId) {
    const info = await settleHeld(db, heldId, adminUid, action === 'release', now);
    await audit(db, { action, adminUid, targetUid: info.uid, note, ref: `heldResults/${heldId}` });
    if (action === 'reject') {
      const strikes = await strike(db, info.uid, adminUid, note, now);
      return { ok: true, strikes };
    }
    return { ok: true };
  }

  if ((action === 'spot_ok' || action === 'reject') && spotId) {
    const ref = db.collection('spotChecks').doc(spotId);
    const spot = await ref.get();
    if (!spot.exists) throw fail('not-found', 'This spot check doesn’t exist.');
    if (spot.get('status') !== 'open') throw fail('failed-precondition', 'This spot check has already been done.');
    const players = (spot.get('players') ?? []) as { uid: string }[];
    if (players.some((p) => p.uid === adminUid)) {
      throw fail('permission-denied', "You can't review a match you played in");
    }
    await ref.update({ status: action === 'spot_ok' ? 'ok' : 'rejected', decidedBy: adminUid, note, decidedAt: at });
    await audit(db, { action, adminUid, targetUid: spot.get('reporterUid') ?? null, note, ref: `spotChecks/${spotId}` });
    if (action === 'spot_ok') {
      await matchRef(db, spotId).update({ spotChecked: true });
      return { ok: true };
    }
    await rejectMatchResult(db, spotId, now);
    const reporter = spot.get('reporterUid') as string | null;
    if (reporter) {
      await db.collection('notifications').doc(reporter).collection('items').add({ type: 'rejected', text: TEXT.rejected, read: false, createdAt: at });
      const strikes = await strike(db, reporter, adminUid, note, now);
      return { ok: true, strikes };
    }
    return { ok: true };
  }

  if (action === 'dismiss') {
    if (!reportId) throw fail('invalid-argument', 'Choose a report.');
    await closeReport();
    await audit(db, { action, adminUid, targetUid: targetUid || null, note, ref: `playerReports/${reportId}` });
    return { ok: true };
  }

  if (!targetUid) throw fail('invalid-argument', 'Choose a player.');
  if (!(await db.collection('users').doc(targetUid).get()).exists) throw fail('not-found', 'This player doesn’t exist.');

  if (action === 'warn') {
    await db.collection('notifications').doc(targetUid).collection('items').add({ type: 'warning', text: TEXT.warning, read: false, createdAt: at });
    await audit(db, { action, adminUid, targetUid, note, ref: reportId ? `playerReports/${reportId}` : undefined });
  } else if (action === 'deactivate') {
    await deactivate(db, targetUid, adminUid, note, now);
  } else if (action === 'disqualify') {
    let game = str('game');
    let season = str('season') || B.seasonOf(now);
    if (reportId) {
      const rep = await db.collection('playerReports').doc(reportId).get();
      game = game || String(rep.get('game'));
      season = str('season') || String(rep.get('season') ?? season);
    }
    await disqualify(db, targetUid, game, season, adminUid, note, now);
    await audit(db, { action, adminUid, targetUid, note, ref: reportId ? `playerReports/${reportId}` : undefined, detail: `${game} · ${season}` });
  } else {
    throw fail('invalid-argument', 'This action needs a held result or a spot check.');
  }
  await closeReport();
  return { ok: true, gamerTag: await tagOfUser(db, targetUid) };
}

// ---------- admins: see the secret settings (never readable from the app)

export async function getAntiCheatSettings(db: Firestore, adminUid: string) {
  await requireAdmin(db, adminUid);
  return publicSettings(await loadAntiCheat(db));
}

/**
 * Admins change the secret settings from the Admin tab (the code on GitHub
 * only holds starting values). Unknown or out-of-range values are refused.
 */
export async function setAntiCheatSettings(db: Firestore, adminUid: string, data: Data, now = new Date()) {
  await requireAdmin(db, adminUid);
  const note = readNote(data);
  const input = (data?.settings ?? {}) as Record<string, unknown>;
  const n = (k: string, min: number, max: number, int = true) => {
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      throw fail('invalid-argument', `${k} must be ${int ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
    }
    return v;
  };
  const caps = { eliminations: n('capEliminations', 1, 199), damage: n('capDamage', 1, 99_999) };
  const update = {
    trustMatches: n('trustMatches', 0, 500),
    diversityOpponents: n('diversityOpponents', 0, 100),
    jitter: n('jitter', 0, 10),
    outlierMultiplier: n('outlierMultiplier', 1, 20, false),
    outlierMinMatches: n('outlierMinMatches', 1, 100),
    caps: Object.fromEntries(Object.entries(B.BOARD_STATS).filter(([, st]) => st.includes('elims')).map(([g]) => [g, caps])),
    topConfidence: n('topConfidence', 0, 1, false),
    spotCheckRate: n('spotCheckRate', 0, 1, false),
    watchAfter: n('watchAfter', 1, 50),
    promotionDelayMinutes: { min: n('promotionDelayMin', 0, 1440), max: n('promotionDelayMax', 0, 1440) },
    autoThreshold: n('autoThreshold', 0.01, 1, false),
  };
  if (update.promotionDelayMinutes.max < update.promotionDelayMinutes.min) {
    throw fail('invalid-argument', 'The longest promotion delay must be at least the shortest.');
  }
  await loadAntiCheat(db); // makes sure the salt exists
  await db.collection('serverConfig').doc('antiCheat').set({ ...update, updatedAt: Timestamp.fromDate(now), updatedBy: adminUid }, { merge: true });
  await audit(db, { action: 'settings', adminUid, targetUid: null, note });
  return publicSettings(await loadAntiCheat(db));
}

// madridDay is re-exported for tests of the daily report limit.
export { madridDay };
