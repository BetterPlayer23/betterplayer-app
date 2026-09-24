import { StyleSheet, Text, View } from 'react-native';

import { GameTile } from '@/components/GameTile';
import { Screen, SectionTitle } from '@/components/Screen';
import { games } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';

export default function CreateScreen() {
  return (
    <Screen>
      <SectionTitle>Create match</SectionTitle>
      <Text style={styles.note}>Pick a game. Entry is always 2 credits.</Text>
      <View style={styles.grid}>
        {games.map((game) => (
          <GameTile key={game.id} game={game} />
        ))}
      </View>
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
});
