import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import type { MatchPlayer } from '@/matches/types';

// A drawn example of the screen to photograph for this game, using the
// players' own game IDs (no publisher logos or artwork).
export function ResultScreenExample({ game, players }: { game: Game; players: MatchPlayer[] }) {
  const [a, b] = players;
  const name = (p?: MatchPlayer) => p?.gameId || p?.gamerTag || 'Player';

  let screen;
  if (game.resultKind === 'goals') {
    screen = (
      <>
        <Text style={styles.caption}>FULL TIME</Text>
        <View style={styles.scoreLine}>
          <Text style={styles.name} numberOfLines={1}>{name(a)}</Text>
          <Text style={styles.score}>2 – 1</Text>
          <Text style={[styles.name, styles.right]} numberOfLines={1}>{name(b)}</Text>
        </View>
      </>
    );
  } else if (game.resultKind === 'crowns') {
    screen = (
      <>
        <Text style={styles.caption}>WINNER</Text>
        <View style={styles.scoreLine}>
          <Text style={styles.name} numberOfLines={1}>{name(a)}</Text>
          <Text style={styles.score}>3 ♛ 1</Text>
          <Text style={[styles.name, styles.right]} numberOfLines={1}>{name(b)}</Text>
        </View>
      </>
    );
  } else {
    screen = (
      <>
        <Text style={styles.caption}>MATCH SUMMARY</Text>
        {players.map((p, i) => (
          <View key={p.uid} style={styles.placeLine}>
            <Text style={styles.place}>#{i + 1}</Text>
            <Text style={styles.name} numberOfLines={1}>{name(p)}</Text>
          </View>
        ))}
      </>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Photograph this screen</Text>
      <View style={[styles.screen, { borderColor: game.color }]}>
        <Text style={[styles.gameName, { color: game.color }]}>{game.name}</Text>
        {screen}
      </View>
      <Text style={styles.help}>
        {game.resultScreen} Point the camera at the whole screen, with every name and the final
        score easy to read.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  screen: {
    borderWidth: 2,
    borderRadius: 12,
    backgroundColor: colors.background,
    padding: 14,
    gap: 8,
    alignItems: 'stretch',
  },
  gameName: {
    fontFamily: fonts.heading,
    fontSize: 13,
    alignSelf: 'center',
  },
  caption: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 2,
    color: colors.textMuted,
    alignSelf: 'center',
  },
  scoreLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  right: {
    textAlign: 'right',
  },
  score: {
    fontFamily: fonts.headingHeavy,
    fontSize: 24,
    color: colors.text,
  },
  placeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  place: {
    width: 32,
    fontFamily: fonts.headingHeavy,
    fontSize: 16,
    color: colors.accent,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
