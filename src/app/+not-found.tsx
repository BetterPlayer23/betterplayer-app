import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link}>
          Back to home
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.accent,
  },
});
