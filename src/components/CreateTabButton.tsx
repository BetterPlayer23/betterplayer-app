import type { BottomTabBarButtonProps } from 'expo-router/tabs';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, primaryGlow } from '@/constants/theme';

// The raised round "+" button in the middle of the tab bar.
export function CreateTabButton({ onPress, accessibilityState }: BottomTabBarButtonProps) {
  return (
    <View style={styles.slot}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create match"
        accessibilityState={accessibilityState}
        onPress={onPress}
        style={({ pressed }) => [styles.circle, { opacity: pressed ? 0.85 : 1 }]}>
        <SymbolView
          name={{ ios: 'plus', android: 'add', web: 'add' }}
          tintColor={colors.text}
          size={30}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: 'center',
  },
  circle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginTop: -22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 4,
    borderColor: colors.background,
    boxShadow: primaryGlow,
  },
});
