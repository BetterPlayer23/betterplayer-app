import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fonts } from '@/constants/theme';

type Props = {
  label: string;
  value: string;
  color?: string;
};

export function StatCard({ label, value, color = colors.text }: Props) {
  return (
    <Card style={styles.card}>
      <Text style={[styles.value, { color }]}>{value}</Text>
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
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: 26,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textMuted,
  },
});
