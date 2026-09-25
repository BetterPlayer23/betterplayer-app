import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ENTRY_CREDITS, TITLE_MAX } from '@shared/games';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { GameTile } from '@/components/GameTile';
import { openMatchRoom } from '@/components/MatchCard';
import { useFeeRate } from '@/matches/useFeeRate';
import { MoneySummary } from '@/components/MoneySummary';
import { Screen, SectionTitle } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { games, type Game } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import { createMatch, matchError } from '@/matches/api';
import { useWallet } from '@/wallet/useWallet';

export default function CreateScreen() {
  const { profile } = useAuth();
  const wallet = useWallet();
  const feeRate = useFeeRate();
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState(2);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flexible = !!game && game.minPlayers !== game.maxPlayers;
  const playerCount = game ? (flexible ? players : game.minPlayers) : 2;
  const missingId = !!game && !profile?.gameIds?.[game.gameIdKey];
  const lowCredits = !wallet.loading && wallet.data.available < ENTRY_CREDITS;

  function pick(g: Game) {
    setGame(g);
    setPlayers(g.minPlayers);
    setError(null);
  }

  async function create() {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const { matchId } = await createMatch({
        game: game.id,
        maxPlayers: playerCount,
        title: title.trim() || undefined,
      });
      setGame(null);
      setTitle('');
      openMatchRoom(matchId);
    } catch (e) {
      setError(matchError(e));
    } finally {
      setBusy(false);
    }
  }

  const playerOptions = game
    ? Array.from({ length: game.maxPlayers - game.minPlayers + 1 }, (_, i) => {
        const n = String(game.minPlayers + i);
        return { id: n, label: `${n} players` };
      })
    : [];

  return (
    <Screen>
      <SectionTitle>Create match</SectionTitle>
      <Text style={styles.note}>Pick a game. Entry is always {ENTRY_CREDITS} credits.</Text>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {games.map((g) => (
          <GameTile key={g.id} game={g} selected={game?.id === g.id} onPress={() => pick(g)} />
        ))}
      </View>

      {game && (
        <>
          {flexible && (
            <ChipSelect
              label="Number of players"
              options={playerOptions}
              value={String(players)}
              onChange={(v) => setPlayers(Number(v))}
            />
          )}

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Rules</Text>
            <Text style={styles.format}>{game.tile}</Text>
            <Text style={styles.body}>{game.rules}</Text>
            <Text style={styles.body}>
              A Betterplayer admin checks every result before any credits move.
            </Text>
          </Card>

          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Credits</Text>
            <MoneySummary players={playerCount} kind={game?.resultKind} feeRate={feeRate} />
          </Card>

          <TextField
            label="Title (optional)"
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Friday night 1v1"
            maxLength={TITLE_MAX}
            autoCapitalize="sentences"
            autoCorrect
          />

          {missingId ? (
            <Card style={[styles.card, styles.warning]}>
              <Text style={styles.body}>
                Add your <Text style={styles.strong}>{game.gameIdLabel}</Text> in Profile to play{' '}
                {game.name}, so your rivals can find you in the game.
              </Text>
              <Button
                label="Go to Profile"
                variant="outline"
                onPress={() => router.navigate('/profile')}
              />
            </Card>
          ) : lowCredits ? (
            <FormMessage
              kind="error"
              text={`You need at least ${ENTRY_CREDITS} available credits to create a match.`}
            />
          ) : null}

          {error && <FormMessage kind="error" text={error} />}
          <Button
            label="Create match"
            onPress={create}
            loading={busy}
            disabled={missingId || lowCredits}
          />
          <Text style={styles.small}>
            Your {ENTRY_CREDITS} credits are only locked when the host starts the match. Open
            matches close after 15 minutes if they don’t fill up.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    gap: 8,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
  },
  format: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.accent,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  strong: {
    fontFamily: fonts.bodyBold,
  },
  warning: {
    borderColor: colors.awaiting,
    gap: 12,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
