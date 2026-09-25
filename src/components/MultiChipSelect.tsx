import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH, colors, fonts, glow, withAlpha } from '@/constants/theme';

type Option<T extends string> = { id: T; label: string };

type Props<T extends string> = {
  label: string;
  options: readonly Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  hint?: string;
  error?: string | null;
};

// A row of pill buttons where several can be picked (tap again to unpick).
export function MultiChipSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  hint,
  error,
}: Props<T>) {
  function toggle(id: T) {
    // Keep the options' own order, whatever order they're tapped in.
    const next = value.includes(id) ? value.filter((v) => v !== id) : [...value, id];
    onChange(options.map((o) => o.id).filter((o) => next.includes(o)));
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <View style={styles.row}>
        {options.map((o) => {
          const selected = value.includes(o.id);
          return (
            <Pressable
              key={o.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(o.id)}
              style={[
                styles.chip,
                selected && styles.chipOn,
              ]}>
              <Text style={[styles.chipText, selected && { color: colors.primary }]}>
                {selected ? '✓ ' : ''}
                {o.label}
              </Text>
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
  hint: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: -4,
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
