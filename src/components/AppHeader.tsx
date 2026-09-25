import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIN_TOUCH, colors, fonts, glow, radius } from '@/constants/theme';

// Pass onBack to show a back arrow before the logo.
export function AppHeader({ onBack }: { onBack?: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.left}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={10}
            style={styles.back}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              tintColor={colors.text}
              size={22}
            />
          </Pressable>
        )}
        <Text style={styles.logo} accessibilityLabel="Betterplayer">
          Better<Text style={styles.logoAccent}>player</Text>
        </Text>
      </View>
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
    backgroundColor: colors.chrome,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  back: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  logo: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: '#FFFFFF',
  },
  logoAccent: {
    color: colors.primary,
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    boxShadow: glow.badge(colors.primary),
  },
  badgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.primary,
  },
  marker: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textMuted,
  },
});
