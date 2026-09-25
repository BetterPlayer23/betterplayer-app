import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { MatchCard } from '@/components/MatchCard';
import { MatchList } from '@/components/MatchList';
import { GameTile } from '@/components/GameTile';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/auth/AuthProvider';
import { games } from '@/constants/games';
import { useMyMatches, useOpenMatches } from '@/matches/hooks';
import { colors, fonts, textGlow } from '@/constants/theme';
import { formatCredits } from '@/wallet/format';
import { useReputation } from '@/wallet/useReputation';
import { useWallet } from '@/wallet/useWallet';

export default function HomeScreen() {
  const { profile } = useAuth();
  const wallet = useWallet();
  const reputation = useReputation();
  const credits = (n: number) => (wallet.loading ? '…' : formatCredits(n));
  const mine = useMyMatches(10);
  const open = useOpenMatches(5);

  return (
    <Screen>
      <View style={styles.greeting}>
        <Text style={styles.hello}>
          Hi, <Text style={styles.tag}>{profile?.gamerTag ?? 'Player'}</Text>
        </Text>
        <Text style={styles.sub}>Ready for your next match?</Text>
      </View>

      <View style={styles.row}>
        <StatCard
          label="Available credits"
          value={credits(wallet.data.available)}
          color={colors.primary}
          glow
        />
        <StatCard
          label="Locked credits"
          value={credits(wallet.data.locked)}
          color={colors.awaiting}
        />
        <StatCard
          label="Reputation"
          value={reputation.loading ? '…' : String(reputation.data.points)}
          color={colors.reputation}
        />
      </View>

      <View style={styles.row}>
        <Button
          label="Create match"
          style={styles.flex}
          onPress={() => router.navigate('/create')}
        />
        <Button
          label="Join match"
          variant="secondary"
          style={styles.flex}
          onPress={() => router.navigate('/matches')}
        />
      </View>

      <SectionTitle>Active match</SectionTitle>
      {mine.active ? (
        <MatchCard match={mine.active} variant="active" />
      ) : (
        <EmptyState
          title="No active match"
          message="When you create or join a match, it will show up here."
        />
      )}

      <SectionTitle>Open matches</SectionTitle>
      <MatchList
        {...open}
        matches={open.data}
        emptyTitle="No open matches right now"
        emptyMessage="Be the first: create a match and invite a rival."
      />

      <SectionTitle>Games</SectionTitle>
      <View style={styles.grid}>
        {games.map((game) => (
          <GameTile key={game.id} game={game} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    gap: 2,
  },
  hello: {
    fontFamily: fonts.heading,
    fontSize: 34,
    color: '#FFFFFF',
  },
  tag: {
    color: colors.primary,
    ...textGlow(colors.primary),
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
