import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { MIN_TOUCH, colors, fonts, glow, radius, withAlpha } from '@/constants/theme';

type Variant =
  | 'primary' // filled cyan, dark text, glow
  | 'secondary' // magenta 2px outline, light magenta fill, glow
  | 'success' // filled green, dark text
  | 'outline' // dark card button with a thin border
  | 'danger' // outlined in red
  | 'tint'; // small outline in a given colour (e.g. the game colour)

type Props = {
  label: string;
  variant?: Variant;
  color?: string; // for 'tint'
  size?: 'regular' | 'small';
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = 'primary',
  color = colors.primary,
  size = 'regular',
  onPress,
  disabled,
  loading,
  style,
}: Props) {
  const inactive = disabled || loading;
  const look = looks(variant, color);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'small' && styles.small,
        look.box,
        { opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={look.text} />
      ) : (
        <Text style={[styles.label, size === 'small' && styles.smallLabel, { color: look.text }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function looks(variant: Variant, color: string): { box: ViewStyle; text: string } {
  switch (variant) {
    case 'primary':
      return {
        box: { backgroundColor: colors.primary, boxShadow: glow.primaryButton() },
        text: colors.onPrimary,
      };
    case 'secondary':
      return {
        box: {
          borderWidth: 2,
          borderColor: colors.secondary,
          backgroundColor: withAlpha(colors.secondary, 0.08),
          boxShadow: glow.magentaButton(),
        },
        text: colors.secondaryText,
      };
    case 'success':
      return {
        box: { backgroundColor: colors.success, boxShadow: glow.primaryButton(colors.success) },
        text: colors.onPrimary,
      };
    case 'danger':
      return {
        box: { borderWidth: 1.5, borderColor: colors.error, backgroundColor: withAlpha(colors.error, 0.06) },
        text: colors.error,
      };
    case 'tint':
      return {
        box: {
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: withAlpha(color, 0.06),
          boxShadow: glow.badge(color),
        },
        text: color,
      };
    default:
      return {
        box: { borderWidth: 1, borderColor: colors.fieldBorder, backgroundColor: colors.surface },
        text: colors.text,
      };
  }
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 54,
  },
  small: {
    minHeight: MIN_TOUCH,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.buttonSmall,
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  smallLabel: {
    fontSize: 14,
  },
});
