import { StyleSheet, Text, View } from 'react-native';

import type { MatchStatus } from '@shared/games';

import { colors, fonts } from '@/constants/theme';
import { statusLabels } from '@/matches/types';

export const statusColors: Record<MatchStatus, string> = {
  open: colors.accent,
  full: colors.error, // red for full matches
  started: colors.primary,
  awaiting_result: colors.awaiting,
  under_review: colors.awaiting,
  completed: colors.success,
  cancelled: colors.textMuted,
};

export function StatusPill({ status }: { status: MatchStatus }) {
  const color = statusColors[status];
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{statusLabels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
});
