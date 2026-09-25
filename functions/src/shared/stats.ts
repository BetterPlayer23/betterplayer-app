// Player stats per game, worked out from our own settled matches. Used by the
// Cloud Functions (to update stats when a match is settled or reversed) and by
// the app (to show them). Keep this file free of imports.

export const ELO_START = 1000; // skill rating of a new player
export const ELO_K = 32; // how much one result can move the rating

export type MatchResult = 'win' | 'loss' | 'draw';

// playerStats/{uid}.games[gameId]
export type GameStats = {
  played: number;
  wins: number; // a shared win on a tie counts as a win
  losses: number;
  draws: number; // Clash Royale draws
  creditsWon: number; // winnings received (never includes refunds)
  streak: number; // +3 = three wins in a row, -2 = two losses in a row, 0 after a draw
  elo: number; // skill rating, starts at 1000
  lastMatchId: string | null; // the most recent settled match counted here
};

// statsEntries/{matchId}.players[uid]: what one match did to a player's stats,
// so a reversal can undo it exactly.
export type StatsEntry = {
  result: MatchResult;
  credits: number;
  eloDelta: number;
  streakBefore: number;
};

export const emptyStats = (): GameStats => ({
  played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  creditsWon: 0,
  streak: 0,
  elo: ELO_START,
  lastMatchId: null,
});

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Win rate in whole percent (draws count as played, not won).
export const winRate = (s: Pick<GameStats, 'played' | 'wins'>) =>
  s.played ? Math.round((s.wins / s.played) * 100) : 0;

export const resultOf = (uid: string, winners: string[]): MatchResult =>
  winners.length === 0 ? 'draw' : winners.includes(uid) ? 'win' : 'loss';

/**
 * Elo changes for one match, from the ratings before it. Each winner counts
 * as beating each player who didn't win (1v1: the usual Elo; squads: the
 * winner beats every other player). Tied winners draw with each other; players
 * who didn't win don't play each other. A draw (no winners) is a draw between
 * everyone.
 */
export function eloChanges(
  uids: string[],
  winners: string[],
  ratings: Record<string, number>,
): Record<string, number> {
  const delta: Record<string, number> = Object.fromEntries(uids.map((u) => [u, 0]));
  const expected = (a: string, b: string) => 1 / (1 + 10 ** ((ratings[b] - ratings[a]) / 400));
  const game = (a: string, b: string, scoreA: number) => {
    delta[a] += ELO_K * (scoreA - expected(a, b));
    delta[b] += ELO_K * (1 - scoreA - expected(b, a));
  };
  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const [a, b] = [uids[i], uids[j]];
      const aWon = winners.includes(a);
      const bWon = winners.includes(b);
      if (!winners.length || (aWon && bWon)) game(a, b, 0.5);
      else if (aWon) game(a, b, 1);
      else if (bWon) game(a, b, 0);
    }
  }
  for (const u of uids) delta[u] = round1(delta[u]);
  return delta;
}

// Adds one match to a player's stats.
export function applyResult(
  prev: GameStats | undefined,
  matchId: string,
  entry: Omit<StatsEntry, 'streakBefore'>,
): { stats: GameStats; entry: StatsEntry } {
  const s = { ...emptyStats(), ...prev };
  const streakBefore = s.streak;
  const streak =
    entry.result === 'win'
      ? Math.max(s.streak, 0) + 1
      : entry.result === 'loss'
        ? Math.min(s.streak, 0) - 1
        : 0;
  return {
    stats: {
      played: s.played + 1,
      wins: s.wins + (entry.result === 'win' ? 1 : 0),
      losses: s.losses + (entry.result === 'loss' ? 1 : 0),
      draws: s.draws + (entry.result === 'draw' ? 1 : 0),
      creditsWon: round2(s.creditsWon + entry.credits),
      streak,
      elo: round1(s.elo + entry.eloDelta),
      lastMatchId: matchId,
    },
    entry: { ...entry, streakBefore },
  };
}

// Takes one match back out of a player's stats (when an admin reverses it).
// The streak can only be restored when that match was the player's latest.
export function removeResult(prev: GameStats | undefined, matchId: string, entry: StatsEntry): GameStats {
  const s = { ...emptyStats(), ...prev };
  const latest = s.lastMatchId === matchId;
  return {
    played: Math.max(0, s.played - 1),
    wins: Math.max(0, s.wins - (entry.result === 'win' ? 1 : 0)),
    losses: Math.max(0, s.losses - (entry.result === 'loss' ? 1 : 0)),
    draws: Math.max(0, s.draws - (entry.result === 'draw' ? 1 : 0)),
    creditsWon: Math.max(0, round2(s.creditsWon - entry.credits)),
    streak: latest ? entry.streakBefore : s.streak,
    elo: round1(s.elo - entry.eloDelta),
    lastMatchId: latest ? null : s.lastMatchId,
  };
}

/**
 * The stats changes for one settled match: for each player, their new stats
 * for this game and what the match did (stored to allow a reversal).
 * `credits` = each player's winnings (0 for losers and draws).
 */
export function statsForMatch(
  matchId: string,
  uids: string[],
  winners: string[],
  credits: Record<string, number>,
  current: Record<string, GameStats | undefined>,
): Record<string, { stats: GameStats; entry: StatsEntry }> {
  const ratings = Object.fromEntries(uids.map((u) => [u, current[u]?.elo ?? ELO_START]));
  const delta = eloChanges(uids, winners, ratings);
  return Object.fromEntries(
    uids.map((u) => [
      u,
      applyResult(current[u], matchId, {
        result: resultOf(u, winners),
        credits: winners.includes(u) ? (credits[u] ?? 0) : 0,
        eloDelta: delta[u],
      }),
    ]),
  );
}
