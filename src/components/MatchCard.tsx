import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { StatusPill } from '@/components/StatusPill';
import { gameById } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import { joinMatch, matchError } from '@/matches/api';
import type { Match } from '@/matches/types';
import { formatCredits } from '@/wallet/format';

export function openMatchRoom(id: string) {
  router.push({ pathname: '/match', params: { id } });
}

// One match in a list: game, title, host, seats, entry, share code and a
// Join button (or Open, for matches the player is already in).
export function MatchCard({ match }: { match: Match }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const game = gameById(match.game);
  const color = game?.color ?? colors.accent;
  const mine = !!user && match.playerUids.includes(user.uid);
  const canJoin = !mine && match.status === 'open';

  async function join() {
    setBusy(true);
    setError(null);
    try {
      await joinMatch({ matchId: match.id });
      openMatchRoom(match.id);
    } catch (e) {
      setError(matchError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={[styles.card, { borderLeftColor: color }]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Open ${match.gameName} match`}
        onPress={() => openMatchRoom(match.id)}
        style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.game, { color }]}>{match.gameName}</Text>
          <StatusPill status={match.status} />
        </View>
        {match.title && <Text style={styles.title}>{match.title}</Text>}
        <Text style={styles.meta}>
          Host <Text style={styles.metaStrong}>{match.hostGamerTag}</Text> · Players{' '}
          <Text style={styles.metaStrong}>
            {match.players.length}/{match.maxPlayers}
          </Text>
        </Text>
        <Text style={styles.meta}>
          Entry <Text style={styles.metaStrong}>{formatCredits(match.entry)} credits</Text> · Code{' '}
          <Text style={styles.code}>{match.code}</Text>
        </Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
      {canJoin ? (
        <Button label="Join" variant="success" onPress={join} loading={busy} />
      ) : (
        <Button
          label={mine ? 'Open match room' : 'View'}
          variant="outline"
          onPress={() => openMatchRoom(match.id)}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderLeftWidth: 4,
  },
  body: {
    gap: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  game: {
    fontFamily: fonts.heading,
    fontSize: 20,
    flexShrink: 1,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  metaStrong: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },
  code: {
    fontFamily: fonts.bodyBold,
    color: colors.accent,
    letterSpacing: 1,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.error,
  },
});
