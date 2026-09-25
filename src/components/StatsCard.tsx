import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { winRate } from '@shared/stats';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { colors, fonts } from '@/constants/theme';
import { totals, usePlayerStats } from '@/matches/useStats';
import { formatCredits } from '@/wallet/format';

// Profile: a summary of the player's stats over all games.
export function StatsCard({ uid }: { uid: string }) {
  const { data, loading } = usePlayerStats(uid);
  const t = totals(data);
  const items: [string, string][] = [
    ['Played', String(t.played)],
    ['Wins', String(t.wins)],
    ['Win rate', `${winRate(t)}%`],
    ['Credits won', formatCredits(t.creditsWon)],
  ];
  return (
    <Card style={styles.card}>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : t.played === 0 ? (
        <Text style={styles.muted}>No settled matches yet. Your stats appear after your first one.</Text>
      ) : (
        <View style={styles.grid}>
          {items.map(([label, value]) => (
            <View key={label} style={styles.item}>
              <Text style={styles.value}>{value}</Text>
              <Text style={styles.label}>{label}</Text>
            </View>
          ))}
        </View>
      )}
      <Button
        label="See all stats"
        variant="outline"
        onPress={() => router.push({ pathname: '/stats', params: { uid } })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 12,
  },
  item: {
    width: '50%',
    gap: 2,
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
