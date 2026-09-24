import { StyleSheet, Text } from 'react-native';

import { Card } from '@/components/Card';
import { colors, fonts } from '@/constants/theme';

type Props = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: Props) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
