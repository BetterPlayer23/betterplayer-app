import { StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';

// A game shown as its name on a coloured tile. No publisher logos or artwork.
export function GameTile({ game }: { game: Game }) {
  return (
    <View style={[styles.tile, { borderColor: game.color, backgroundColor: `${game.color}1F` }]}>
      <Text style={[styles.name, { color: game.color }]} numberOfLines={2}>
        {game.name}
      </Text>
      <Text style={styles.players}>{game.players}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 84,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    justifyContent: 'space-between',
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 20,
  },
  players: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
});
