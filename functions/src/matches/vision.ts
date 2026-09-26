import { createHash } from 'node:crypto';

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';

import {
  DEFAULT_AUTO_THRESHOLD,
  DEFAULT_VISION_MODEL,
  type GameConfig,
  type ResultDetails,
  type Verification,
} from '../shared/games';
import { logError, registerSecret } from '../safeLog';
import { fail, type MatchDoc, type MatchPlayer } from './common';

// sharp and the Anthropic SDK are loaded only when a photo is checked, so the
// light functions (createMatch, joinMatch, ...) start faster.
const loadSharp = async () => (await import('sharp')).default;
const loadAnthropic = async () => (await import('@anthropic-ai/sdk')).default;

// ---------- config/review (created by hand in the Firebase console)

export type ReviewConfig = { autoApprove: boolean; threshold: number; visionModel: string };

export function readReviewConfig(data: Record<string, unknown> | undefined): ReviewConfig {
  const threshold = Number(data?.threshold);
  const model = data?.visionModel;
  return {
    autoApprove: data?.autoApprove === true,
    threshold: threshold > 0 && threshold <= 1 ? threshold : DEFAULT_AUTO_THRESHOLD,
    visionModel: typeof model === 'string' && model.trim() ? model.trim() : DEFAULT_VISION_MODEL,
  };
}

export const reviewConfigRef = (db: Firestore) => db.collection('config').doc('review');

// ---------- images: loading, perceptual hash, duplicates

export type LoadedImage = {
  path: string;
  jpeg: Buffer; // resized for the vision check
  hash: string; // 256-bit difference hash, hex
  sha256: string;
  uploadedAt: Date;
};

// Perceptual "difference hash": shrink to 17×16 grey pixels and record whether
// each pixel is brighter than its right neighbour. Re-saved, resized or
// slightly edited copies of a picture keep almost the same 256 bits.
async function differenceHash(image: Buffer): Promise<string> {
  const W = 17;
  const H = 16;
  const sharp = await loadSharp();
  const px = await sharp(image)
    .rotate()
    .greyscale()
    .resize(W, H, { fit: 'fill' })
    .raw()
    .toBuffer();
  let bits = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) bits += px[y * W + x] > px[y * W + x + 1] ? '1' : '0';
  }
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// Out of 256 bits: at or under DUPLICATE the image is refused, at or under
// SIMILAR it is accepted but never approved automatically.
export const DUPLICATE_DISTANCE = 26;
export const SIMILAR_DISTANCE = 48;

export async function loadImage(path: string): Promise<LoadedImage> {
  const file = getStorage().bucket().file(path);
  const [[data], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  try {
    const sharp = await loadSharp();
    const jpeg = await sharp(data, { failOn: 'error' })
      .rotate()
      .resize({ width: 1568, height: 1568, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return {
      path,
      jpeg,
      hash: await differenceHash(data),
      sha256: createHash('sha256').update(data).digest('hex'),
      uploadedAt: new Date(String(meta.timeCreated ?? Date.now())),
    };
  } catch {
    throw fail('invalid-argument', 'That photo couldn’t be read. Please take it again.');
  }
}

// Every accepted result image is recorded in imageHashes/{id} (server-only).
export const imageHashRef = (db: Firestore, id: string) =>
  db.collection('imageHashes').doc(id);

// The 256-bit hash cut into 27 pieces ("0:1010110011", ...). Two images at
// most DUPLICATE_DISTANCE (26) bits apart differ in at most 26 pieces, so they
// always share at least one: a query for images sharing any piece finds every
// possible duplicate without reading the whole collection.
export const HASH_SEGMENTS = 27;
export function hashSegments(hash: string): string[] {
  let bits = '';
  for (const c of hash) bits += parseInt(c, 16).toString(2).padStart(4, '0');
  const out: string[] = [];
  let at = 0;
  for (let i = 0; i < HASH_SEGMENTS; i++) {
    const len = Math.ceil((bits.length - at) / (HASH_SEGMENTS - i));
    out.push(`${i}:${bits.slice(at, at + len)}`);
    at += len;
  }
  return out;
}

/**
 * Refuses an image identical or nearly identical to any earlier one.
 * Returns the id of an earlier image it merely resembles, or null.
 * Reads: one query for the same file (sha256), one for images sharing a hash
 * piece (only real candidates), instead of the whole collection.
 */
export async function checkDuplicate(db: Firestore, image: LoadedImage): Promise<string | null> {
  const col = db.collection('imageHashes');
  const [same, near] = await Promise.all([
    col.where('sha256', '==', image.sha256).select().limit(1).get(),
    col.where('segments', 'array-contains-any', hashSegments(image.hash)).select('hash').get(),
  ]);
  let closest: { id: string; distance: number } | null = null;
  if (!same.empty) closest = { id: same.docs[0].id, distance: 0 };
  for (const doc of near.docs) {
    const distance = hammingDistance(String(doc.get('hash') ?? ''), image.hash);
    if (!closest || distance < closest.distance) closest = { id: doc.id, distance };
  }
  if (closest && closest.distance <= DUPLICATE_DISTANCE) {
    throw fail(
      'already-exists',
      'This photo has already been used for a result. Take a new photo of your own final screen.',
      { reason: 'duplicate_image' },
    );
  }
  return closest && closest.distance <= SIMILAR_DISTANCE ? closest.id : null;
}

export function imageHashDoc(image: LoadedImage, matchId: string, uid: string, kind: string) {
  return {
    hash: image.hash,
    segments: hashSegments(image.hash),
    sha256: image.sha256,
    path: image.path,
    matchId,
    uid,
    kind,
    createdAt: FieldValue.serverTimestamp(),
  };
}

// ---------- the vision check

// What the model reads on the screenshot (JSON only).
export type VisionReading = {
  playerNames: string[];
  scores: number[];
  damage: number[]; // squads only; empty otherwise
  winnerName: string;
  isFinalScreen: boolean;
  confidence: number;
  notes: string;
};

const READING_SCHEMA = {
  type: 'object',
  properties: {
    playerNames: { type: 'array', items: { type: 'string' } },
    scores: { type: 'array', items: { type: 'number' } },
    damage: { type: 'array', items: { type: 'number' } },
    winnerName: { type: 'string' },
    isFinalScreen: { type: 'boolean' },
    confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['playerNames', 'scores', 'damage', 'winnerName', 'isFinalScreen', 'confidence', 'notes'],
  additionalProperties: false,
};

// Per-game hints on where to look.
const HINTS: Record<string, string> = {
  eafc: 'EA FC final whistle (full-time) screen. The final score and both players’ names or team names are near the top. A draw decided on penalties shows the shoot-out score too, often in brackets.',
  'clash-royale':
    'Clash Royale battle result screen (often a phone screenshot). Both player names are shown with the crowns each won (0 to 3); the winner is usually marked "Winner". A draw shows no winner.',
  'warzone-rebirth':
    'Call of Duty: Warzone (Rebirth Island) end-of-match squad scoreboard. Read each squad member’s name, eliminations (kills) and damage.',
  fortnite:
    'Fortnite end-of-match squad scoreboard or squad stats screen. Read each squad member’s name, eliminations and damage dealt.',
  'bf-redsec':
    'Battlefield REDSEC (battle royale) end-of-match squad scoreboard. Read each squad member’s name, eliminations (kills) and damage.',
};

const SCORE_WORD: Record<GameConfig['resultKind'], string> = {
  goals: 'goals scored (full-time score, not penalties)',
  crowns: 'crowns won (0 to 3)',
  eliminations: 'eliminations (kills)',
};

export function buildPrompt(game: GameConfig, players: number): string {
  return [
    `You check result screenshots for a ${game.name} match (${players} players).`,
    `The right screen: ${HINTS[game.id] ?? game.resultScreen}`,
    'The photo may be taken of a TV or monitor with a phone camera. Report only what you can actually see; never guess names or numbers.',
    'Answer with JSON only:',
    '- playerNames: the player names shown in the result, in the order shown.',
    `- scores: one number per name in playerNames, same order: ${SCORE_WORD[game.resultKind]}.`,
    game.resultKind === 'eliminations'
      ? '- damage: one number per name in playerNames, same order: damage dealt.'
      : '- damage: [] (not used for this game).',
    game.resultKind === 'eliminations'
      ? '- winnerName: "" (the squad scoreboard has no single winner).'
      : '- winnerName: the winner’s name exactly as shown, or "" if the screen doesn’t make it clear or it is a draw.',
    '- isFinalScreen: true only if this is the game’s final result screen (not a menu, a match still being played, or something else).',
    '- confidence: 0 to 1, how sure you are that the names and scores are read correctly and that this is a genuine, unedited final result screen.',
    '- notes: one short sentence on anything odd (edited, cropped, blurry, another screen), or "".',
  ].join('\n');
}

export type VisionRequest = { apiKey: string; model: string; prompt: string; jpeg: Buffer };

async function callClaude({ apiKey, model, prompt, jpeg }: VisionRequest): Promise<VisionReading | null> {
  const Anthropic = await loadAnthropic();
  const client = new Anthropic({ apiKey, timeout: 40_000, maxRetries: 1, logLevel: 'off' });
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: READING_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') return null;
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? parseReading(JSON.parse(text.text)) : null;
}

// In the emulator only, tests put the answer in _emulator/visionMock instead of
// calling Anthropic. The request is saved in _emulator/visionLastCall.
async function callMock(db: Firestore, req: VisionRequest): Promise<VisionReading | null> {
  await db.doc('_emulator/visionLastCall').set({
    model: req.model,
    prompt: req.prompt,
    imageBytes: req.jpeg.length,
    at: FieldValue.serverTimestamp(),
  });
  const mock = (await db.doc('_emulator/visionMock').get()).data();
  if (mock?.error) throw new Error(String(mock.error));
  return mock?.reading ? parseReading(mock.reading) : null;
}

function parseReading(raw: unknown): VisionReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.playerNames) || !Array.isArray(r.scores)) return null;
  return {
    playerNames: r.playerNames.map(String),
    scores: r.scores.map(Number),
    damage: Array.isArray(r.damage) ? r.damage.map(Number) : [],
    winnerName: typeof r.winnerName === 'string' ? r.winnerName : '',
    isFinalScreen: r.isFinalScreen === true,
    confidence: Math.min(1, Math.max(0, Number(r.confidence) || 0)),
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 300) : '',
  };
}

// ---------- tolerant name matching

export const normName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

// Same name, ignoring case, accents, spaces and symbols; allows a longer
// display name that contains it (clan tags) and small misreadings (~1 in 5).
export function namesMatch(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  return editDistance(x, y) <= Math.max(1, Math.floor(Math.max(x.length, y.length) / 5));
}

// ---------- comparing the reading with the report

const SCORE_KEY = { goals: 'goals', crowns: 'crowns', eliminations: 'eliminations' } as const;
const SCORE_NAME = { goals: 'goals', crowns: 'crowns', eliminations: 'eliminations' } as const;

// A player's in-game ID for this match (matches/{id}/private/data.gameIds),
// falling back to the ID older matches kept on the player entry.
export type GameIdMap = Record<string, string>;
const gameIdOf = (p: MatchPlayer, ids: GameIdMap) => ids[p.uid] ?? p.gameId ?? '';

export function compareReading(
  reading: VisionReading | null,
  game: GameConfig,
  match: Pick<MatchDoc, 'players'>,
  report: { winnerUids: string[]; details: ResultDetails },
  gameIds: GameIdMap = {},
): Verification {
  const confidence = reading?.confidence ?? 0;
  const result = (status: Verification['status'], reason: string): Verification => ({
    status,
    confidence,
    reason,
  });
  if (!reading) return result('unreadable', 'The screenshot couldn’t be read.');
  if (!reading.isFinalScreen) return result('unreadable', 'It isn’t the final result screen.');
  if (!reading.playerNames.length) return result('unreadable', 'No player names could be read.');
  if (reading.scores.length !== reading.playerNames.length) {
    return result('unreadable', 'The scores couldn’t be read for every name.');
  }
  const squad = game.resultKind === 'eliminations';
  if (squad && reading.damage.length !== reading.playerNames.length) {
    return result('unreadable', 'The damage couldn’t be read for every name.');
  }

  // Find each player's name on the screen (saved game ID, or gamer tag).
  const used = new Set<number>();
  const found = new Map<string, number>();
  for (const p of match.players) {
    const i = reading.playerNames.findIndex(
      (name, idx) =>
        !used.has(idx) && (namesMatch(name, gameIdOf(p, gameIds)) || namesMatch(name, p.gamerTag)),
    );
    if (i < 0) {
      return result('mismatch', `${p.gamerTag}’s name (${gameIdOf(p, gameIds)}) isn’t on the screenshot.`);
    }
    used.add(i);
    found.set(p.uid, i);
  }

  const reported = report.details[SCORE_KEY[game.resultKind]] ?? {};
  const word = SCORE_NAME[game.resultKind];
  for (const p of match.players) {
    const seen = reading.scores[found.get(p.uid)!];
    if (seen !== reported[p.uid]) {
      return result(
        'mismatch',
        `The screenshot shows ${seen} ${word} for ${p.gamerTag}, the report says ${reported[p.uid]}.`,
      );
    }
    if (squad) {
      const dmg = reading.damage[found.get(p.uid)!];
      const said = report.details.damage?.[p.uid];
      if (dmg !== said) {
        return result(
          'mismatch',
          `The screenshot shows ${dmg} damage for ${p.gamerTag}, the report says ${said}.`,
        );
      }
    }
  }
  // Squads: the winners follow from the numbers checked above.
  if (squad) return result('match', 'Names, eliminations and damage match the report.');

  const winners = match.players.filter((p) => report.winnerUids.includes(p.uid));
  if (reading.winnerName) {
    const named = winners.some(
      (w) =>
        namesMatch(reading.winnerName, gameIdOf(w, gameIds)) ||
        namesMatch(reading.winnerName, w.gamerTag),
    );
    if (!named) {
      return result('mismatch', `The screenshot shows ${reading.winnerName} as the winner.`);
    }
  } else if (report.details.penalties) {
    return result('unreadable', 'The penalty shoot-out winner couldn’t be read.');
  }
  return result('match', 'Names, score and winner match the report.');
}

/**
 * Runs the automatic check on a reported result. Never throws: if the check
 * can't run (no API key, API error), the result is "unreadable" with a reason,
 * and an admin reviews the match.
 */
export async function verifyResult(
  db: Firestore,
  opts: {
    apiKey: string;
    game: GameConfig;
    match: Pick<MatchDoc, 'players'>;
    report: { winnerUids: string[]; details: ResultDetails };
    image: LoadedImage;
    gameIds?: GameIdMap;
  },
): Promise<{ verification: Verification & { model: string }; reading: VisionReading | null }> {
  const config = readReviewConfig((await reviewConfigRef(db).get()).data());
  const req: VisionRequest = {
    apiKey: opts.apiKey,
    model: config.visionModel,
    prompt: buildPrompt(opts.game, opts.match.players.length),
    jpeg: opts.image.jpeg,
  };
  registerSecret(opts.apiKey);
  let reading: VisionReading | null = null;
  try {
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      reading = await callMock(db, req);
    } else if (!opts.apiKey || opts.apiKey === 'not-set') {
      logger.warn('Automatic result check is off: set the ANTHROPIC_API_KEY secret.');
      return {
        verification: {
          status: 'unreadable',
          confidence: 0,
          reason: 'Automatic check isn’t set up.',
          model: config.visionModel,
        },
        reading: null,
      };
    } else {
      reading = await callClaude(req);
    }
  } catch (e) {
    logError('Automatic result check failed', e);
    return {
      verification: {
        status: 'unreadable',
        confidence: 0,
        reason: 'Automatic check unavailable.',
        model: config.visionModel,
      },
      reading: null,
    };
  }
  const verification = compareReading(reading, opts.game, opts.match, opts.report, opts.gameIds);
  return { verification: { ...verification, model: config.visionModel }, reading };
}
