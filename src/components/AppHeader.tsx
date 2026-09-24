import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';

export function AppHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.brand}>BetterPlayer</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Beta: credits only</Text>
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
    backgroundColor: colors.pitch,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  brand: {
    fontFamily: fonts.heading,
    fontSize: 30,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.chalk,
  },
  badge: {
    backgroundColor: colors.floodlight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.deep,
  },
});
