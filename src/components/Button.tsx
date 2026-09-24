import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, primaryGlow } from '@/constants/theme';

type Props = {
  label: string;
  variant?: 'primary' | 'success';
  onPress?: () => void;
};

export function Button({ label, variant = 'primary', onPress }: Props) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: isPrimary ? colors.primary : colors.success,
          boxShadow: isPrimary ? primaryGlow : undefined,
          opacity: pressed ? 0.85 : 1,
        },
      ]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 14,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
});
