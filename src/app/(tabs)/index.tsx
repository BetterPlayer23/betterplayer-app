import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { GameTile } from '@/components/GameTile';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { useAuth } from '@/auth/AuthProvider';
import { games } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';

export default function HomeScreen() {
  const { profile } = useAuth();

  return (
    <Screen>
      <View style={styles.greeting}>
        <Text style={styles.hello}>Hi, {profile?.gamerTag ?? 'Player'}</Text>
        <Text style={styles.sub}>Ready for your next match?</Text>
      </View>

      <View style={styles.row}>
        {/* Credits stay at 0 until the ledger is connected (next step). */}
        <StatCard label="Available credits" value="0" color={colors.accent} />
        <StatCard label="Locked credits" value="0" />
        <StatCard label="Reputation" value="—" />
      </View>

      <View style={styles.row}>
        <Button
          label="Create match"
          style={styles.flex}
          onPress={() => router.navigate('/create')}
        />
        <Button
          label="Join match"
          variant="success"
          style={styles.flex}
          onPress={() => router.navigate('/matches')}
        />
      </View>

      <SectionTitle>Active match</SectionTitle>
      <EmptyState
        title="No active match"
        message="When you create or join a match, it will show up here."
      />

      <SectionTitle>Open matches</SectionTitle>
      <EmptyState
        title="No open matches right now"
        message="Be the first: create a match and invite a rival."
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
    fontSize: 32,
    color: colors.text,
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
