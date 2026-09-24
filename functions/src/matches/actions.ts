import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

import {
  ENTRY_CREDITS,
  LOBBY_CODE_MAX,
  OPEN_MATCH_MINUTES,
  SHARE_CODE_ALPHABET,
  SHARE_CODE_LENGTH,
  TITLE_MAX,
  getGame,
  matchMoney,
} from '../shared/games';
import {
  checkEligible,
  closedMessage,
  countTodaysMatch,
  fail,
  matchRef,
  randomShareCode,
  requireString,
  type MatchDoc,
  type MatchPlayer,
} from './common';

// Every action below takes the caller's uid (already checked as signed in)
// and the raw request data, and throws friendly HttpsErrors.

type Data = Record<string, unknown> | undefined | null;

// ---------- createMatch ----------

export async function createMatch(db: Firestore, uid: string, data: Data, now = new Date()) {
  const game = getGame(String(data?.game ?? ''));
  if (!game) throw fail('invalid-argument', 'Choose a game.');

  const maxPlayers = data?.maxPlayers === undefined ? game.minPlayers : Number(data.maxPlayers);
  if (
    !Number.isInteger(maxPlayers) ||
    maxPlayers < game.minPlayers ||
    maxPlayers > game.maxPlayers
  ) {
    throw fail(
      'invalid-argument',
      game.minPlayers === game.maxPlayers
        ? `${game.name} matches are for ${game.minPlayers} players.`
        : `${game.name} matches are for ${game.minPlayers} to ${game.maxPlayers} players.`,
    );
  }

  let title: string | null = null;
  if (data?.title !== undefined && data.title !== null) {
    if (typeof data.title !== 'string') throw fail('invalid-argument', 'Invalid title.');
    title = data.title.trim().replace(/\s+/g, ' ') || null;
    if (title && title.length > TITLE_MAX) {
      throw fail('invalid-argument', `Keep the title under ${TITLE_MAX} characters.`);
    }
  }

  const ref = db.collection('matches').doc();
  const money = matchMoney(maxPlayers);

  // A share code is reserved in matchCodes/{code} so it's never reused.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShareCode();
    const codeRef = db.collection('matchCodes').doc(code);
    const created = await db.runTransaction(async (tx) => {
      const player = await checkEligible(tx, db, uid, game, now);
      if ((await tx.get(codeRef)).exists) return false; // taken: try another code

      const nowTs = Timestamp.fromDate(now);
      const host: MatchPlayer = {
        uid,
        gamerTag: player.gamerTag,
        gameId: player.gameId,
        joinedAt: nowTs,
      };
      const match: MatchDoc = {
        game: game.id,
        gameName: game.name,
        title,
        hostUid: uid,
        hostGamerTag: player.gamerTag,
        maxPlayers,
        players: [host],
        playerUids: [uid],
        status: 'open',
        code,
        lobbyCode: null,
        entry: money.entry,
        pot: money.pot,
        fee: money.fee,
        winnerGets: money.winnerGets,
        createdAt: nowTs,
        updatedAt: nowTs,
        expiresAt: Timestamp.fromMillis(now.getTime() + OPEN_MATCH_MINUTES * 60_000),
      };
      tx.create(ref, match);
      tx.create(codeRef, { matchId: ref.id, createdAt: nowTs });
      countTodaysMatch(tx, player, now);
      return true;
    });
    if (created) return { matchId: ref.id, code };
  }
  throw fail('unavailable', 'Couldn’t create the match. Please try again.');
}

// ---------- joinMatch ----------

const CODE_PATTERN = new RegExp(`^[${SHARE_CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

async function resolveMatchId(db: Firestore, data: Data): Promise<string> {
  if (typeof data?.matchId === 'string' && data.matchId) return data.matchId;
  const code = String(data?.code ?? '')
    .trim()
    .toUpperCase();
  if (!code) throw fail('invalid-argument', 'Enter a match code.');
  if (!CODE_PATTERN.test(code)) {
    throw fail('invalid-argument', 'Match codes are 6 letters and numbers, like K7PX2M.');
  }
  const snap = await db.collection('matchCodes').doc(code).get();
  if (!snap.exists) throw fail('not-found', 'No match found with that code.');
  return String(snap.get('matchId'));
}

export async function joinMatch(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = await resolveMatchId(db, data);
  const ref = matchRef(db, matchId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const match = snap.data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (match.playerUids.includes(uid)) {
      throw fail('already-exists', 'You’re already in this match.');
    }
    if (match.status !== 'open' || match.players.length >= match.maxPlayers) {
      throw fail(
        'failed-precondition',
        closedMessage(match.status === 'open' ? 'full' : match.status),
      );
    }
    if (match.expiresAt.toMillis() <= now.getTime()) {
      throw fail('failed-precondition', 'This match has expired.');
    }
    const game = getGame(match.game);
    if (!game) throw fail('failed-precondition', 'This game is no longer available.');

    const player = await checkEligible(tx, db, uid, game, now);
    const players = [
      ...match.players,
      { uid, gamerTag: player.gamerTag, gameId: player.gameId, joinedAt: Timestamp.fromDate(now) },
    ];
    tx.update(ref, {
      players,
      playerUids: FieldValue.arrayUnion(uid),
      status: players.length >= match.maxPlayers ? 'full' : 'open',
      updatedAt: Timestamp.fromDate(now),
    });
    countTodaysMatch(tx, player, now);
  });
  return { matchId };
}

// ---------- leaveMatch ----------

export async function leaveMatch(db: Firestore, uid: string, data: Data, now = new Date()) {
  const ref = matchRef(db, requireString(data?.matchId, 'match'));
  await db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (!match.playerUids.includes(uid))
      throw fail('failed-precondition', 'You’re not in this match.');
    if (match.hostUid === uid) {
      throw fail('failed-precondition', 'You’re the host: cancel the match instead.');
    }
    if (match.status !== 'open' && match.status !== 'full') {
      throw fail('failed-precondition', 'You can only leave before the match starts.');
    }
    tx.update(ref, {
      players: match.players.filter((p) => p.uid !== uid),
      playerUids: FieldValue.arrayRemove(uid),
      status: 'open',
      // A full match that reopens gets a fresh 15 minutes to fill up again.
      ...(match.status === 'full' && {
        expiresAt: Timestamp.fromMillis(now.getTime() + OPEN_MATCH_MINUTES * 60_000),
      }),
      updatedAt: Timestamp.fromDate(now),
    });
  });
  return { ok: true };
}

// ---------- setLobbyCode ----------

export async function setLobbyCode(db: Firestore, uid: string, data: Data, now = new Date()) {
  const ref = matchRef(db, requireString(data?.matchId, 'match'));
  if (typeof data?.code !== 'string') throw fail('invalid-argument', 'Enter the lobby code.');
  const code = data.code.trim();
  if (code.length > LOBBY_CODE_MAX) {
    throw fail('invalid-argument', `Lobby codes can be up to ${LOBBY_CODE_MAX} characters.`);
  }
  await db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (match.hostUid !== uid) throw fail('permission-denied', 'Only the host can do that.');
    if (!['open', 'full', 'started'].includes(match.status)) {
      throw fail('failed-precondition', closedMessage(match.status));
    }
    tx.update(ref, { lobbyCode: code || null, updatedAt: Timestamp.fromDate(now) });
  });
  return { ok: true };
}

// ---------- startMatch ----------

/**
 * Locks 2 credits from every player and starts the match, all in one
 * transaction. Idempotent: each lock is ledger/lock_{matchId}_{uid}, and a
 * match that has already started is left as is.
 */
export async function startMatch(db: Firestore, uid: string, data: Data, now = new Date()) {
  const matchId = requireString(data?.matchId, 'match');
  const ref = matchRef(db, matchId);

  await db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (match.hostUid !== uid) throw fail('permission-denied', 'Only the host can do that.');
    if (match.status === 'started') return; // already done
    if (match.status === 'open') {
      throw fail('failed-precondition', 'The match can start once all seats are filled.');
    }
    if (match.status !== 'full') throw fail('failed-precondition', closedMessage(match.status));

    // Read everything first (Firestore transactions: all reads before writes).
    const rows = await Promise.all(
      match.players.map(async (p) => {
        const walletRef = db.collection('wallets').doc(p.uid);
        const lockRef = db.collection('ledger').doc(`lock_${matchId}_${p.uid}`);
        const [wallet, lock] = await Promise.all([tx.get(walletRef), tx.get(lockRef)]);
        return { player: p, walletRef, lockRef, wallet, locked: lock.exists };
      }),
    );

    const short = rows.filter(
      (r) => !r.locked && Number(r.wallet.get('available') ?? 0) < ENTRY_CREDITS,
    );
    if (short.length > 0) {
      const names = short.map((r) => r.player.gamerTag).join(', ');
      throw fail(
        'failed-precondition',
        `Can’t start yet: ${names} ${short.length === 1 ? 'doesn’t' : 'don’t'} have ${ENTRY_CREDITS} available credits.`,
        { reason: 'not_enough_credits', uids: short.map((r) => r.player.uid) },
      );
    }

    const nowTs = Timestamp.fromDate(now);
    for (const r of rows) {
      if (r.locked) continue;
      tx.create(r.lockRef, {
        uid: r.player.uid,
        type: 'stake_lock',
        amount: ENTRY_CREDITS,
        matchId,
        game: match.game,
        description: `Entry locked: ${match.gameName} match`,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(r.walletRef, {
        available: FieldValue.increment(-ENTRY_CREDITS),
        locked: FieldValue.increment(ENTRY_CREDITS),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    tx.update(ref, { status: 'started', startedAt: nowTs, updatedAt: nowTs });
  });
  return { ok: true };
}

// ---------- cancelMatch ----------

export async function cancelMatch(db: Firestore, uid: string, data: Data, now = new Date()) {
  const ref = matchRef(db, requireString(data?.matchId, 'match'));
  await db.runTransaction(async (tx) => {
    const match = (await tx.get(ref)).data();
    if (!match) throw fail('not-found', 'This match doesn’t exist.');
    if (match.hostUid !== uid) throw fail('permission-denied', 'Only the host can do that.');
    if (match.status === 'cancelled') return;
    if (match.status !== 'open' && match.status !== 'full') {
      throw fail('failed-precondition', 'You can only cancel before the match starts.');
    }
    const nowTs = Timestamp.fromDate(now);
    tx.update(ref, {
      status: 'cancelled',
      cancelledAt: nowTs,
      cancelReason: 'host',
      updatedAt: nowTs,
    });
  });
  return { ok: true };
}

// ---------- expiry (scheduled) ----------

// Cancels open matches whose 15 minutes have run out. Returns how many.
export async function cancelExpiredMatches(db: Firestore, now = new Date()): Promise<number> {
  const nowTs = Timestamp.fromDate(now);
  const expired = await db
    .collection('matches')
    .where('status', '==', 'open')
    .where('expiresAt', '<=', nowTs)
    .limit(200)
    .get();

  let cancelled = 0;
  for (const doc of expired.docs) {
    const done = await db.runTransaction(async (tx) => {
      const match = (await tx.get(doc.ref)).data() as MatchDoc | undefined;
      // Re-check: someone may have filled or cancelled it meanwhile.
      if (!match || match.status !== 'open' || match.expiresAt.toMillis() > now.getTime()) {
        return false;
      }
      tx.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: nowTs,
        cancelReason: 'expired',
        updatedAt: nowTs,
      });
      return true;
    });
    if (done) cancelled++;
  }
  return cancelled;
}
