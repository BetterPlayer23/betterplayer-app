import type { ResultDetails } from '@shared/games';

import type { MatchPlayer } from './types';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// One readable line for a reported score, e.g.
// "Alpha 1 – 1 Bravo (penalties 5 – 4)", "Alpha 3 – 1 Bravo crowns",
// "1st Charlie · 2nd Bravo · 3rd Alpha".
export function describeResult(details: ResultDetails, players: MatchPlayer[]): string {
  const tag = (uid: string) => players.find((p) => p.uid === uid)?.gamerTag ?? 'Player';
  const [a, b] = players.map((p) => p.uid);
  if (details.goals && a && b) {
    const pens = details.penalties
      ? ` (penalties ${details.penalties[a]} – ${details.penalties[b]})`
      : '';
    return `${tag(a)} ${details.goals[a]} – ${details.goals[b]} ${tag(b)}${pens}`;
  }
  if (details.crowns && a && b) {
    return `${tag(a)} ${details.crowns[a]} – ${details.crowns[b]} ${tag(b)} (crowns)`;
  }
  if (details.placements) {
    return Object.entries(details.placements)
      .sort(([, x], [, y]) => x - y)
      .map(([uid, place]) => `${ordinal(place)} ${tag(uid)}`)
      .join(' · ');
  }
  return '';
}
