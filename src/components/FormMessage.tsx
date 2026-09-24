import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';

// A message box above or below a form: red for errors, green for success.
export function FormMessage({ kind, text }: { kind: 'error' | 'success'; text: string }) {
  const color = kind === 'error' ? colors.error : colors.success;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, { borderColor: color, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.text, { color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});
