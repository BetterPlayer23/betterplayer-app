import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { glow } from '@/constants/theme';

// A 10px dot in the given colour that gently pulses. Stays still when the
// phone's "reduce motion" setting is on.
export function PulseDot({ color, size = 10 }: { color: string; size?: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
  }, [reduceMotion, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, boxShadow: glow.badge(color) },
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {},
});
