import { Pressable, StyleSheet, Text } from 'react-native';

import { MIN_TOUCH, colors, fonts } from '@/constants/theme';

export function TextLink({
  label,
  prefix,
  onPress,
  align = 'center',
}: {
  label: string;
  prefix?: string;
  onPress: () => void;
  align?: 'center' | 'flex-end';
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      hitSlop={8}
      style={[styles.wrap, { alignSelf: align }]}>
      <Text style={styles.prefix}>
        {prefix ? `${prefix} ` : ''}
        <Text style={styles.link}>{label}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 4,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  prefix: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
});
