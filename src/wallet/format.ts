// "10", "3.20", "-2": whole numbers stay short, others show 2 decimals.
export function formatCredits(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatSignedCredits(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatCredits(Math.abs(n))}`;
}

// Friendly names for ledger entry types. Unknown types fall back to the
// entry's own description.
const typeLabels: Record<string, string> = {
  starter_grant: 'Starter credits',
  stake_lock: 'Entry locked',
  match_entry: 'Match entry',
  match_win: 'Match win',
  entry_returned: 'Entry returned',
  correction: 'Correction',
};

export function ledgerLabel(type: string, description: string): string {
  // Entry locks carry the game in their description: "Entry locked: EA FC match".
  if (type === 'stake_lock' && description) return description;
  return typeLabels[type] ?? (description || 'Credits');
}

// Entry locks move credits from available to locked; they aren't spent yet.
export function isLock(type: string): boolean {
  return type === 'stake_lock';
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
