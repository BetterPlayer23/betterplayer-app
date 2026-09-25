import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH, colors, fonts } from '@/constants/theme';

type Props = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
};

export function Checkbox({ label, checked, onChange, error }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => onChange(!checked)}
        style={styles.row}>
        <View
          style={[
            styles.box,
            checked && { backgroundColor: colors.primary, borderColor: colors.primary },
            !!error && !checked && { borderColor: colors.error },
          ]}>
          {checked && (
            <SymbolView
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              tintColor={colors.onPrimary}
              size={16}
            />
          )}
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: MIN_TOUCH,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.error,
  },
});
