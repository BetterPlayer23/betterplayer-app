import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fonts, textGlow } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  color?: string;
  glow?: boolean; // soft glow on the number (highlighted numbers only)
  big?: boolean; // a larger number (Wallet balance)
};

// A big Exo 2 number with a 2px top border in the same colour.
export function StatCard({ label, value, color = colors.text, glow = false, big = false }: Props) {
  return (
    <Card style={[styles.card, { borderTopColor: color }]}>
      <Text style={[styles.value, big && styles.big, { color }, glow && textGlow(color)]}>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    gap: 4,
    borderTopWidth: 2,
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: 28,
  },
  big: {
    fontSize: 36,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
