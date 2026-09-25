import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { matchFormat } from '@shared/games';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PulseDot } from '@/components/PulseDot';
import { StatusPill } from '@/components/StatusPill';
import { gameById } from '@/constants/games';
import { colors, fonts, glow, withAlpha } from '@/constants/theme';
import { joinMatch, matchError } from '@/matches/api';
import type { Match } from '@/matches/types';
import { formatCredits } from '@/wallet/format';

export function openMatchRoom(id: string) {
  router.push({ pathname: '/match', params: { id } });
}

const formatLabel = (m: Match) => matchFormat(gameById(m.game), m.maxPlayers);

// One match. `compact` (lists): game name, "1v1 · Host … · 1/2" (squads:
// "Squad · N players · …"), status and a
// small Join / Open button. `active` (Home): pulsing dot, what the winner
// gets, who you play against and "Open match room".
export function MatchCard({ match, variant = 'compact' }: { match: Match; variant?: 'compact' | 'active' }) {
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

  if (variant === 'active') {
    const rivals = match.players.filter((p) => p.uid !== user?.uid).map((p) => p.gamerTag);
    return (
      <Card
        style={[
          styles.card,
          { borderColor: withAlpha(color, 0.35), boxShadow: glow.activeCard(color) },
        ]}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${match.gameName} match`}
          onPress={() => openMatchRoom(match.id)}
          style={styles.body}>
          <View style={styles.top}>
            <View style={styles.nameRow}>
              <PulseDot color={color} />
              <Text style={[styles.game, { color }]}>{match.gameName}</Text>
            </View>
            <StatusPill status={match.status} />
          </View>
          {match.title && <Text style={styles.title}>{match.title}</Text>}
          <Text style={styles.meta}>
            {formatLabel(match)} · Winner gets{' '}
            <Text style={styles.metaStrong}>{formatCredits(match.winnerGets)} credits</Text>
          </Text>
          <Text style={styles.meta}>
            vs{' '}
            <Text style={styles.metaStrong}>
              {rivals.length ? rivals.join(', ') : 'waiting for a rival'}
            </Text>
          </Text>
        </Pressable>
        <Button label="Open match room" variant="outline" onPress={() => openMatchRoom(match.id)} />
      </Card>
    );
  }

  return (
    <Card style={[styles.card, styles.compact, { borderColor: withAlpha(color, 0.35) }]}>
      <View style={styles.compactRow}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${match.gameName} match`}
          onPress={() => openMatchRoom(match.id)}
          style={styles.compactBody}>
          <Text style={[styles.game, { color }]}>{match.gameName}</Text>
          {match.title && <Text style={styles.title}>{match.title}</Text>}
          <Text style={styles.meta}>
            {formatLabel(match)} · Host <Text style={styles.metaStrong}>{match.hostGamerTag}</Text>{' '}
            · {match.players.length}/{match.maxPlayers}
          </Text>
        </Pressable>
        <View style={styles.side}>
          <StatusPill status={match.status} />
          {canJoin ? (
            <Button label="Join" variant="tint" color={color} size="small" onPress={join} loading={busy} />
          ) : (
            <Button
              label={mine ? 'Open' : 'View'}
              variant="outline"
              size="small"
              onPress={() => openMatchRoom(match.id)}
            />
          )}
        </View>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  compact: {
    paddingVertical: 12,
    gap: 6,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compactBody: {
    flex: 1,
    gap: 3,
  },
  side: {
    alignItems: 'flex-end',
    gap: 8,
  },
  body: {
    gap: 6,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
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
    color: colors.textSecondary,
  },
  metaStrong: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.error,
  },
});
