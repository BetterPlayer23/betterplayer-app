import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AVG_MIN_MATCHES,
  BOARD_SHOW,
  BOARD_STATS,
  STAT_LABEL,
  seasonLabel,
  seasonOf,
  tierForRank,
  type BoardEntry,
  type StatId,
} from '@shared/badges';

import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { EmptyState } from '@/components/EmptyState';
import { SectionTitle } from '@/components/Screen';
import { games } from '@/constants/games';
import { MIN_TOUCH, badgeColors, colors, fonts, withAlpha } from '@/constants/theme';
import { useLeaderboard, useMyPosition, type MyPosition } from '@/badges/hooks';

// Leaderboards of the current season (a calendar month): one per game and
// stat. Opened from the card on Home: /leaderboard?game=…&stat=…
const boardGames = games.filter((g) => BOARD_STATS[g.id]);

export default function LeaderboardScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ game?: string; stat?: string }>();
  const [gameId, setGameId] = useState(
    boardGames.find((g) => g.id === params.game)?.id ?? boardGames[0].id,
  );
  const stats = BOARD_STATS[gameId];
  const [statPick, setStatPick] = useState<StatId>((params.stat as StatId) ?? stats[0]);
  const stat = stats.includes(statPick) ? statPick : stats[0];
  const game = boardGames.find((g) => g.id === gameId)!;

  const season = seasonOf(new Date());
  const board = useLeaderboard(season, gameId, stat);
  const top = board.data.slice(0, BOARD_SHOW);
  const me = useMyPosition(season, gameId, stat, user?.uid, board.data, board.loading);

  return (
    <View style={styles.page}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SectionTitle>Leaderboards</SectionTitle>
        <Text style={styles.help}>
          {seasonLabel(season)} ends {seasonEnd(season)}. Only matches checked by Betterplayer count.
          #1–10 Prism · #11–50 Neon · #51–250 Gold · 5+ matches Cobalt · everyone else Carbon.
        </Text>
        <ChipSelect
          label="Game"
          options={boardGames.map((g) => ({ id: g.id, label: g.name }))}
          value={gameId}
          onChange={(id) => setGameId(id)}
        />
        <ChipSelect
          label="Ranked by"
          options={stats.map((s) => ({ id: s, label: STAT_LABEL[s] }))}
          value={stat}
          onChange={setStatPick}
        />
        {stat === 'avgElims' && (
          <Text style={styles.help}>Average eliminations counts players with {AVG_MIN_MATCHES}+ matches this season.</Text>
        )}

        {board.loading ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : board.error ? (
          <EmptyState title="Leaderboard unavailable" message="Check your connection and try again." />
        ) : top.length === 0 ? (
          <EmptyState
            title="Nobody here yet"
            message={`Play ${game.name} this season to be the first on this board.`}
          />
        ) : (
          <Card style={[styles.list, { borderColor: withAlpha(game.color, 0.35) }]}>
            {top.map((e, i) => (
              <Row key={e.uid} entry={e} rank={i + 1} stat={stat} mine={e.uid === user?.uid} />
            ))}
          </Card>
        )}
      </ScrollView>
      <YourPosition pos={me} stat={stat} />
    </View>
  );
}

function Row({ entry, rank, stat, mine }: { entry: BoardEntry; rank: number; stat: StatId; mine: boolean }) {
  const tier = tierForRank(rank, entry.matches);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Number ${rank}, ${entry.tag}, ${formatValue(stat, entry.value)}`}
      onPress={() => router.push({ pathname: '/stats', params: { uid: entry.uid } })}
      style={({ pressed }) => [styles.row, mine && styles.rowMine, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.rank, tier && { color: badgeColors[tier].color }]}>{rank}</Text>
      {tier ? <Badge kind={tier} size="medium" animate={false} /> : <View style={styles.badgeSpace} />}
      <Text style={[styles.name, mine && { color: colors.primary }]} numberOfLines={1}>
        {entry.tag}
      </Text>
      <Text style={styles.value}>{formatValue(stat, entry.value)}</Text>
    </Pressable>
  );
}

// "Your position", pinned at the bottom of the screen.
function YourPosition({ pos, stat }: { pos: MyPosition | null; stat: StatId }) {
  let body;
  if (!pos) body = <Text style={styles.footText}>Working out your position…</Text>;
  else if (pos.kind === 'none') body = <Text style={styles.footText}>You haven’t played this game this season yet.</Text>;
  else if (pos.kind === 'needsMatches')
    body = (
      <Text style={styles.footText}>
        {pos.matches} of {AVG_MIN_MATCHES} matches played: average eliminations ranks you after {AVG_MIN_MATCHES}.
      </Text>
    );
  else {
    const tier = tierForRank(pos.rank, pos.matches);
    body = (
      <View style={styles.footRow}>
        <Text style={styles.footRank}>#{pos.rank}</Text>
        {tier && <Badge kind={tier} size="medium" />}
        <Text style={styles.footText} numberOfLines={2}>
          Your position{tier ? ` · ${tier[0].toUpperCase()}${tier.slice(1)}` : ''}
        </Text>
        <Text style={styles.value}>{formatValue(stat, pos.value)}</Text>
      </View>
    );
  }
  return <View style={styles.foot}>{body}</View>;
}

function formatValue(stat: StatId, v: number): string {
  if (stat === 'avgElims') return v.toFixed(2);
  if (stat === 'goalDiff') return v > 0 ? `+${v}` : String(v);
  if (stat === 'damage') return v.toLocaleString('en-GB');
  return String(v);
}

// "2026-09" → "30 September" (the season's last day).
function seasonEnd(season: string): string {
  const [y, m] = season.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return `${last.getUTCDate()} ${last.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
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
  list: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  rowMine: {
    backgroundColor: withAlpha(colors.primary, 0.08),
  },
  rank: {
    width: 30,
    textAlign: 'right',
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.textSecondary,
  },
  badgeSpace: {
    width: 44,
  },
  name: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.primary,
  },
  foot: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.chrome,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 64,
    justifyContent: 'center',
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footRank: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary,
  },
  footText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
