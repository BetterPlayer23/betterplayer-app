import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH, colors, fonts, glow, withAlpha } from '@/constants/theme';

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
};

// A row of pill buttons where exactly one can be picked.
export function ChipSelect<T extends string>({ label, options, value, onChange, error }: Props<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup">
        {options.map((o) => {
          const selected = o.id === value;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.id)}
              style={[
                styles.chip,
                selected && styles.chipOn,
              ]}>
              <Text style={[styles.chipText, selected && { color: colors.primary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipOn: {
    borderColor: colors.primary,
    borderWidth: 1.5,
    backgroundColor: withAlpha(colors.primary, 0.1),
    boxShadow: glow.badge(colors.primary),
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textMuted,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.error,
  },
});
