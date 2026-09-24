import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

type Props = {
  title: string;
  message: string;
};

export function PlaceholderScreen({ title, message }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.deep,
    padding: 16,
    gap: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 40,
    textTransform: 'uppercase',
    color: colors.chalk,
  },
  card: {
    backgroundColor: colors.pitch,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 24,
    alignItems: 'center',
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
    color: colors.chalkMuted,
  },
});
