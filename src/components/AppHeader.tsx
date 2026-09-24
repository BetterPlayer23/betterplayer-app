import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

export function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.logo}>Betterplayer</Text>
      <View style={styles.right}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>CLOSED BETA</Text>
        </View>
        <Text style={styles.marker}>18+ · Spain only</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: {
    fontFamily: fonts.headingHeavy,
    fontSize: 26,
    color: colors.text,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accent,
  },
  marker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
});
