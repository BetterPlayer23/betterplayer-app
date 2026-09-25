import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Game } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';

// A game shown as its name on a coloured tile. No publisher logos or artwork.
// Pass onPress to make it selectable.
export function GameTile({
  game,
  selected,
  onPress,
}: {
  game: Game;
  selected?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.name, { color: game.color }]} numberOfLines={2}>
        {game.name}
      </Text>
      <Text style={styles.players} numberOfLines={3}>
        {game.tile}
      </Text>
    </>
  );
  const tileStyle = [
    styles.tile,
    { borderColor: game.color, backgroundColor: `${game.color}1F` },
    selected && { borderWidth: 2, backgroundColor: `${game.color}40` },
  ];

  if (!onPress) return <View style={tileStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={`${game.name}, ${game.tile}`}
      onPress={onPress}
      style={({ pressed }) => [tileStyle, pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
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
