import { StyleSheet, Text, View } from 'react-native';

import { matchMoney, percent, type ResultKind } from '@shared/games';

import { colors, fonts } from '@/constants/theme';
import { formatCredits } from '@/wallet/format';

// Entry, pot, fee and what the winner gets, for a number of players and a fee
// rate (a new match: the live rate; an existing match: its own stored rate).
// What happens on a level result depends on the game.
const LEVEL_NOTE: Partial<Record<ResultKind, string>> = {
  eliminations: 'Split equally between the winners on a tie.',
  crowns: 'A draw is refunded.',
};

export function MoneySummary({
  players,
  kind,
  feeRate,
}: {
  players: number;
  kind?: ResultKind;
  feeRate: number;
}) {
  const m = matchMoney(players, feeRate);
  const rows: [string, string][] = [
    ['Entry', `${formatCredits(m.entry)} credits per player`],
    ['Pot', `${formatCredits(m.pot)} credits (${players} players)`],
    [`Fee (${percent(feeRate)})`, `${formatCredits(m.fee)} credits`],
  ];
  return (
    <View style={styles.box}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
      ))}
      <View style={[styles.row, styles.total]}>
        <Text style={styles.totalLabel}>Winner gets ({percent(1 - feeRate)})</Text>
        <Text style={styles.totalValue}>{formatCredits(m.winnerGets)} credits</Text>
      </View>
      {kind && LEVEL_NOTE[kind] && <Text style={styles.label}>{LEVEL_NOTE[kind]}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.text,
    textAlign: 'right',
    flexShrink: 1,
  },
  total: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    alignItems: 'center',
  },
  totalLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  totalValue: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.success,
  },
});
