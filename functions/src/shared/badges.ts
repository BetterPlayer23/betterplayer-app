// Badges, monthly seasons, leaderboards and crowns: the rules, shared by the
// Cloud Functions (which compute everything) and the app (which only shows
// it). Keep this file free of imports so it works in both.
// Badges, ranks and trophies are for fun: non-transferable, no cash value.

// ---------- tiers and badge kinds

export type Tier = 'carbon' | 'cobalt' | 'gold' | 'neon' | 'prism';
export type BadgeKind = Tier | 'founder' | 'crown';

// Lowest to highest.
export const TIER_ORDER: readonly Tier[] = ['carbon', 'cobalt', 'gold', 'neon', 'prism'];

export const BADGE_LABEL: Record<BadgeKind, string> = {
  carbon: 'Carbon',
  cobalt: 'Cobalt',
  gold: 'Gold',
  neon: 'Neon',
  prism: 'Prism',
  founder: 'Founder',
  crown: 'Crown',
};

export const tierValue = (t: Tier | null | undefined) => (t ? TIER_ORDER.indexOf(t) : -1);

export const FOUNDER_LIMIT = 100; // the first 100 verified players
export const PRISM_MAX_RANK = 10;
export const NEON_MAX_RANK = 50;
export const GOLD_MAX_RANK = 250;
export const COBALT_MIN_MATCHES = 5;
export const AVG_MIN_MATCHES = 10; // average eliminations needs 10 matches
export const BOARD_LIST_SIZE = 260; // stored per leaderboard (a little past #250)
export const BOARD_SHOW = 50; // shown on the Leaderboard screen

/**
 * The live tier for a rank on a leaderboard: #1–10 Prism, #11–50 Neon,
 * #51–250 Gold; after that (or not ranked) Cobalt with at least 5 matches
 * this season, otherwise Carbon. No matches this season: no tier.
 */
export function tierForRank(rank: number | null, matches: number): Tier | null {
  if (matches <= 0) return null;
  if (rank !== null && rank <= PRISM_MAX_RANK) return 'prism';
  if (rank !== null && rank <= NEON_MAX_RANK) return 'neon';
  if (rank !== null && rank <= GOLD_MAX_RANK) return 'gold';
  return matches >= COBALT_MIN_MATCHES ? 'cobalt' : 'carbon';
}

// ---------- seasons (calendar months, Europe/Madrid)

export const LAUNCH_SEASON = '2026-09'; // Season 1

// "2026-09" for a date, in Spanish time.
export function seasonOf(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return `${y}-${m}`;
}

const monthIndex = (season: string) => {
  const [y, m] = season.split('-').map(Number);
  return y * 12 + (m - 1);
};

export function previousSeason(season: string): string {
  const i = monthIndex(season) - 1;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

// Season 1 = September 2026.
export const seasonNumber = (season: string) => monthIndex(season) - monthIndex(LAUNCH_SEASON) + 1;
export const seasonLabel = (season: string) => `Season ${seasonNumber(season)}`;

// ---------- leaderboards

export type StatId = 'elims' | 'damage' | 'avgElims' | 'wins' | 'goalDiff' | 'threeCrowns';

export const STAT_LABEL: Record<StatId, string> = {
  elims: 'Eliminations',
  damage: 'Damage',
  avgElims: 'Avg eliminations',
  wins: 'Wins',
  goalDiff: 'Goal difference',
  threeCrowns: '3-crown wins',
};

const SQUAD_STATS: StatId[] = ['elims', 'damage', 'avgElims'];

// The leaderboards of each game (games without an entry have none).
export const BOARD_STATS: Record<string, StatId[]> = {
  'warzone-rebirth': SQUAD_STATS,
  fortnite: SQUAD_STATS,
  'bf-redsec': SQUAD_STATS,
  eafc: ['wins', 'goalDiff'],
  'clash-royale': ['wins', 'threeCrowns'],
};

export const boardKey = (game: string, stat: StatId) => `${game}.${stat}`;
// Firestore ids: leaderboards/{season}_{game}_{stat}, seasonStats/{season}_{game}_{uid}.
export const boardDocId = (season: string, game: string, stat: StatId) => `${season}_${game}_${stat}`;
export const seasonStatsId = (season: string, game: string, uid: string) => `${season}_${game}_${uid}`;

export const boardTitle = (gameName: string, stat: StatId) => `${gameName} · ${STAT_LABEL[stat]}`;

// A player's totals for one game in one season (seasonStats/{id}).
export type SeasonStats = {
  matches: number;
  elims: number;
  damage: number;
  wins: number;
  goalDiff: number;
  threeCrowns: number;
};

export const emptySeasonStats = (): SeasonStats => ({
  matches: 0,
  elims: 0,
  damage: 0,
  wins: 0,
  goalDiff: 0,
  threeCrowns: 0,
});

const round2 = (n: number) => Math.round(n * 100) / 100;

// The number a leaderboard ranks by, or null when the player doesn't qualify.
export function statValue(s: SeasonStats, stat: StatId): number | null {
  if (s.matches <= 0) return null;
  if (stat === 'avgElims') return s.matches >= AVG_MIN_MATCHES ? round2(s.elims / s.matches) : null;
  return s[stat];
}

// What one settled match adds for one player.
export type Contribution = SeasonStats;

type Scores = Record<string, number>;
export type ResultNumbers = {
  goals?: Scores;
  crowns?: Scores;
  eliminations?: Scores;
  damage?: Scores;
};

/**
 * Each player's contribution from one settled match. `details` are the
 * reported numbers, passed only when the final winners are the reported ones
 * (an admin override keeps wins/matches but not the reported numbers).
 */
export function contributionsFor(
  resultKind: 'goals' | 'crowns' | 'eliminations',
  playerUids: string[],
  winners: string[],
  details: ResultNumbers | null,
): Record<string, Contribution> {
  const out: Record<string, Contribution> = {};
  for (const uid of playerUids) {
    const c = emptySeasonStats();
    c.matches = 1;
    const won = winners.includes(uid);
    if (resultKind === 'eliminations') {
      c.elims = details?.eliminations?.[uid] ?? 0;
      c.damage = details?.damage?.[uid] ?? 0;
      c.wins = won ? 1 : 0;
    } else if (resultKind === 'goals') {
      c.wins = won ? 1 : 0;
      const g = details?.goals;
      if (g) {
        const mine = g[uid] ?? 0;
        const theirs = playerUids.filter((u) => u !== uid).reduce((sum, u) => sum + (g[u] ?? 0), 0);
        c.goalDiff = mine - theirs;
      }
    } else {
      c.wins = won ? 1 : 0;
      c.threeCrowns = won && details?.crowns?.[uid] === 3 ? 1 : 0;
    }
    out[uid] = c;
  }
  return out;
}

// stats + sign × contribution (sign −1 takes a reversed match back out).
export function addContribution(stats: SeasonStats, c: Contribution, sign: 1 | -1 = 1): SeasonStats {
  const out = { ...stats };
  for (const k of Object.keys(out) as (keyof SeasonStats)[]) out[k] = round2(out[k] + sign * (c[k] ?? 0));
  out.matches = Math.max(0, out.matches);
  return out;
}

// One row of a stored leaderboard. `at` = when the player reached this value
// (earlier ranks higher on a tie).
export type BoardEntry = { uid: string; tag: string; value: number; matches: number; at: number };

export function sortEntries(entries: BoardEntry[]): BoardEntry[] {
  return [...entries].sort((a, b) => b.value - a.value || a.at - b.at || (a.uid < b.uid ? -1 : 1));
}

export type BoardChange = { uid: string; tag: string; value: number | null; matches: number; at: number };

// The board with some players' new values (null = no longer qualifies).
export function updateBoard(entries: BoardEntry[], changes: BoardChange[]): BoardEntry[] {
  const changed = new Set(changes.map((c) => c.uid));
  const previous = new Map(entries.map((e) => [e.uid, e]));
  const kept = entries.filter((e) => !changed.has(e.uid));
  for (const c of changes) {
    if (c.value === null) continue;
    const before = previous.get(c.uid);
    // Keep the original time when the value didn't change.
    const at = before && before.value === c.value ? before.at : c.at;
    kept.push({ uid: c.uid, tag: c.tag, value: c.value, matches: c.matches, at });
  }
  return sortEntries(kept).slice(0, BOARD_LIST_SIZE);
}

export const rankOf = (entries: BoardEntry[], uid: string): number | null => {
  const i = entries.findIndex((e) => e.uid === uid);
  return i < 0 ? null : i + 1;
};

export type TierChange = { uid: string; tag: string; from: Tier | null; to: Tier | null; takenBy: string | null };

/**
 * Tier changes between two versions of a board. `movers` are the players of
 * the match (their own changes are reported too, with takenBy null).
 * `matchesOf` gives the season matches of players who left the stored list.
 * For a player who dropped a tier because someone passed them, `takenBy` is
 * the tag of the highest-placed mover who passed them.
 */
export function tierChanges(
  before: BoardEntry[],
  after: BoardEntry[],
  movers: Set<string>,
  matchesOf: (uid: string) => number,
): TierChange[] {
  const uids = new Set([...before.map((e) => e.uid), ...after.map((e) => e.uid), ...movers]);
  const tagOf = new Map([...before, ...after].map((e) => [e.uid, e.tag]));
  const out: TierChange[] = [];
  for (const uid of uids) {
    const rb = rankOf(before, uid);
    const ra = rankOf(after, uid);
    const eb = before.find((e) => e.uid === uid);
    const ea = after.find((e) => e.uid === uid);
    const from = eb ? tierForRank(rb, eb.matches) : movers.has(uid) ? null : tierForRank(null, matchesOf(uid));
    const to = ea ? tierForRank(ra, ea.matches) : tierForRank(null, matchesOf(uid));
    if (from === to) continue;
    let takenBy: string | null = null;
    if (!movers.has(uid) && tierValue(to) < tierValue(from)) {
      // The best-placed mover now above this player who was below (or absent) before.
      const passer = after.find((e) => {
        if (!movers.has(e.uid)) return false;
        const moverBefore = rankOf(before, e.uid);
        const myAfter = ra ?? Infinity;
        return rankOf(after, e.uid)! < myAfter && (moverBefore === null || rb === null || moverBefore > rb);
      });
      takenBy = passer?.tag ?? null;
    }
    out.push({ uid, tag: tagOf.get(uid) ?? 'Player', from, to, takenBy });
  }
  return out;
}

// ---------- crowns (all-time records, one holder each)

export type RecordKind = 'bestElims' | 'bestDamage' | 'margin' | 'streak';
export type RecordDef = { id: string; game: string; kind: RecordKind; label: string };

const SQUAD_GAMES = ['warzone-rebirth', 'fortnite', 'bf-redsec'];

export function recordsFor(game: string, gameName: string): RecordDef[] {
  if (SQUAD_GAMES.includes(game)) {
    return [
      { id: `${game}.bestElims`, game, kind: 'bestElims', label: `${gameName} · Most eliminations in one match` },
      { id: `${game}.bestDamage`, game, kind: 'bestDamage', label: `${gameName} · Most damage in one match` },
    ];
  }
  if (game === 'eafc') return [{ id: 'eafc.margin', game, kind: 'margin', label: 'EA FC · Biggest win margin' }];
  if (game === 'clash-royale') {
    return [{ id: 'clash-royale.streak', game, kind: 'streak', label: 'Clash Royale · Longest win streak' }];
  }
  return [];
}

export type RecordHolder = { uid: string; tag: string; value: number; matchId: string; at: number };
export type RecordDoc = { holder: RecordHolder | null; history: RecordHolder[] };

const RECORD_HISTORY = 5; // kept so a reversed record falls back to the next best

/**
 * The record candidates of one match: the single best player for each
 * record (join order breaks a tie). `streaks` = each winner's win streak
 * after this match (Clash Royale). `eligible` leaves out players who can't
 * hold crowns (admin / test accounts); they still count as opponents.
 */
export function recordCandidates(
  defs: RecordDef[],
  playerUids: string[],
  winners: string[],
  details: ResultNumbers,
  streaks: Record<string, number>,
  eligible: (uid: string) => boolean = () => true,
): { def: RecordDef; uid: string; value: number }[] {
  const best = (scores: Scores | undefined) => {
    let top: { uid: string; value: number } | null = null;
    for (const uid of playerUids) {
      if (!eligible(uid)) continue;
      const v = scores?.[uid];
      if (typeof v === 'number' && v > 0 && (!top || v > top.value)) top = { uid, value: v };
    }
    return top;
  };
  const out: { def: RecordDef; uid: string; value: number }[] = [];
  for (const def of defs) {
    let c: { uid: string; value: number } | null = null;
    if (def.kind === 'bestElims') c = best(details.eliminations);
    else if (def.kind === 'bestDamage') c = best(details.damage);
    else if (def.kind === 'margin' && winners.length === 1 && details.goals) {
      const w = winners[0];
      const theirs = Math.max(...playerUids.filter((u) => u !== w).map((u) => details.goals![u] ?? 0));
      const margin = (details.goals[w] ?? 0) - theirs;
      if (margin > 0) c = { uid: w, value: margin };
    } else if (def.kind === 'streak' && winners.length === 1) {
      const v = streaks[winners[0]] ?? 0;
      if (v > 0) c = { uid: winners[0], value: v };
    }
    if (c && eligible(c.uid)) out.push({ def, ...c });
  }
  return out;
}

// Adds a candidate; the crown moves only when the record is strictly beaten.
export function applyRecord(
  doc: RecordDoc | undefined,
  cand: RecordHolder,
): { doc: RecordDoc; newHolder: boolean; previous: RecordHolder | null } {
  const history = sortHolders([...(doc?.history ?? []).filter((h) => h.matchId !== cand.matchId || h.uid !== cand.uid), cand]);
  const previous = doc?.holder ?? null;
  const beaten = !previous || cand.value > previous.value;
  const holder = beaten ? cand : previous;
  return {
    doc: { holder, history: history.slice(0, RECORD_HISTORY) },
    newHolder: beaten && previous?.uid !== cand.uid,
    previous: beaten ? previous : null,
  };
}

const sortHolders = (h: RecordHolder[]) => [...h].sort((a, b) => b.value - a.value || a.at - b.at);

// A reversed match no longer counts: the next best takes the crown back.
export function removeMatchFromRecord(doc: RecordDoc | undefined, matchId: string): RecordDoc {
  const history = sortHolders((doc?.history ?? []).filter((h) => h.matchId !== matchId));
  return { holder: history[0] ?? null, history };
}

// ---------- a player's badges (badges/{uid})

export type Trophy = { season: string; game: string; stat: StatId; label: string };

export type PlayerBadges = {
  gamerTag?: string;
  founder?: { number: number };
  crowns?: Record<string, { label: string; value: number }>;
  tiers?: Record<string, Tier>; // boardKey → live tier, for tiersSeason only
  tiersSeason?: string;
  trophies?: Trophy[];
  chip?: Chip | null;
};

export type Chip = { kind: BadgeKind; label: string };

// This season's tiers (older seasons' tiers no longer count).
export const currentTiers = (b: PlayerBadges | undefined, season: string): Record<string, Tier> =>
  b?.tiersSeason === season ? (b.tiers ?? {}) : {};

export function bestTier(tiers: Record<string, Tier>): Tier | null {
  let best: Tier | null = null;
  for (const t of Object.values(tiers)) if (tierValue(t) > tierValue(best)) best = t;
  return best;
}

/**
 * The small chip shown next to a name: a crown beats everything, then the
 * best live tier (Prism, Neon, Gold), then Founder, then Cobalt / Carbon.
 */
export function chipFor(b: PlayerBadges | undefined, season: string): Chip | null {
  if (!b) return null;
  if (b.crowns && Object.keys(b.crowns).length) return { kind: 'crown', label: 'Crown' };
  const t = bestTier(currentTiers(b, season));
  if (t && tierValue(t) >= tierValue('gold')) return { kind: t, label: BADGE_LABEL[t] };
  if (b.founder) return { kind: 'founder', label: `Founder #${b.founder.number}` };
  if (t) return { kind: t, label: BADGE_LABEL[t] };
  return null;
}

export const trophyLabel = (season: string, gameName: string, stat: StatId) =>
  `${seasonLabel(season)} · Prism · ${boardTitle(gameName, stat)}`;

// ---------- anti-farming

export const PAIR_DAILY_CAP = 3; // matches per day between the same two players that count
export const SAME_WINNER_FLAG = 5; // same winner this many times in a row → flag for admins
export const LOPSIDED_EA_MARGIN = 7; // an EA FC win by 7+ goals → flag for admins

export const pairKey = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export function pairsOf(uids: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < uids.length; i++) for (let j = i + 1; j < uids.length; j++) out.push([uids[i], uids[j]]);
  return out;
}

export type FlagReason = 'pair_daily_cap' | 'same_winner_streak' | 'lopsided';
export const FLAG_REASON_LABEL: Record<FlagReason, string> = {
  pair_daily_cap: 'Same players more than 3 times today (extra matches don’t count for leaderboards)',
  same_winner_streak: 'Same winner 5 times in a row between the same two players',
  lopsided: 'Very one-sided result',
};

// ---------- notification texts

export const lostTierText = (by: string, tier: Tier, gameName: string, stat: StatId) =>
  `${by} took your ${BADGE_LABEL[tier]} spot in ${boardTitle(gameName, stat)}. Win it back.`;
export const lostCrownText = (by: string, label: string) =>
  `${by} beat your record: ${label}. Take your crown back.`;
export const trophyText = (label: string) => `Season over! You earned a permanent trophy: ${label}.`;
export const founderText = (n: number) => `You're Founder #${n} of Betterplayer. This badge is yours for good.`;
