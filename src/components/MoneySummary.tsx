import { StyleSheet, Text, View } from 'react-native';

import { FEE_RATE, matchMoney } from '@shared/games';

import { colors, fonts } from '@/constants/theme';
import { formatCredits } from '@/wallet/format';

// Entry, pot, 20% fee and what the winner gets, for a number of players.
export function MoneySummary({ players }: { players: number }) {
  const m = matchMoney(players);
  const rows: [string, string][] = [
    ['Entry', `${formatCredits(m.entry)} credits per player`],
    ['Pot', `${formatCredits(m.pot)} credits (${players} players)`],
    [`Fee (${Math.round(FEE_RATE * 100)}%)`, `${formatCredits(m.fee)} credits`],
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
        <Text style={styles.totalLabel}>Winner gets</Text>
        <Text style={styles.totalValue}>{formatCredits(m.winnerGets)} credits</Text>
      </View>
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
