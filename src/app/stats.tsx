import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { winRate, type GameStats } from '@shared/stats';

import { useAuth } from '@/auth/AuthProvider';
import { BadgeShowcase } from '@/components/BadgeShowcase';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen, SectionTitle } from '@/components/Screen';
import { games } from '@/constants/games';
import { colors, fonts, withAlpha } from '@/constants/theme';
import { usePlayerStats } from '@/matches/useStats';
import { formatCredits } from '@/wallet/format';

// Stats per game for a player: /stats?uid=… (your own when no uid is given).
// Opened from Profile ("See all stats") and by tapping a player in a match.
export default function StatsScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ uid?: string }>();
  const uid = params.uid || user?.uid || null;
  const mine = uid === user?.uid;
  const { data, loading, error } = usePlayerStats(uid);

  const played = games.filter((g) => (data?.games[g.id]?.played ?? 0) > 0);
  return (
    <Screen>
      <SectionTitle>{mine ? 'Your stats' : `${data?.gamerTag ?? 'Player'}’s stats`}</SectionTitle>
      <Text style={styles.help}>
        From settled Betterplayer matches. Skill rating starts at 1000 and goes up when you beat
        higher-rated players.
      </Text>
      {uid && <BadgeShowcase uid={uid} mine={mine} />}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : error ? (
        <EmptyState title="Stats unavailable" message="Check your connection and try again." />
      ) : played.length === 0 ? (
        <EmptyState
          title="No stats yet"
          message={
            mine
              ? 'Your stats appear after your first settled match.'
              : 'This player has no settled matches yet.'
          }
        />
      ) : (
        played.map((g) => <GameSection key={g.id} name={g.name} color={g.color} s={data!.games[g.id]!} />)
      )}
    </Screen>
  );
}

function GameSection({ name, color, s }: { name: string; color: string; s: GameStats }) {
  const streak =
    s.streak > 0 ? `${s.streak} win${s.streak > 1 ? 's' : ''}` : s.streak < 0 ? `${-s.streak} loss${s.streak < -1 ? 'es' : ''}` : '—';
  const rows: [string, string][] = [
    ['Matches played', String(s.played)],
    ['Wins', String(s.wins)],
    ['Losses', String(s.losses)],
    ...(s.draws ? ([['Draws', String(s.draws)]] as [string, string][]) : []),
    ['Win rate', `${winRate(s)}%`],
    ['Credits won', formatCredits(s.creditsWon)],
    ['Current streak', streak],
    ['Skill rating', String(Math.round(s.elo))],
  ];
  return (
    <Card style={[styles.card, { borderColor: withAlpha(color, 0.35) }]}>
      <Text style={[styles.game, { color }]}>{name}</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={[styles.value, { color }]}>{value}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    marginTop: -8,
  },
  loading: {
    marginVertical: 24,
  },
  card: {
    gap: 8,
  },
  game: {
    fontFamily: fonts.heading,
    fontSize: 22,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: 18,
  },
});
