import { StyleSheet, Text, View } from 'react-native';

import type { MatchStatus } from '@shared/games';

import { colors, fonts, glow, radius, withAlpha } from '@/constants/theme';
import { statusLabels } from '@/matches/types';

export const statusColors: Record<MatchStatus, string> = {
  open: colors.primary,
  full: colors.error, // red for full matches
  started: colors.success, // playing now
  awaiting_result: colors.awaiting,
  under_review: colors.awaiting,
  completed: colors.success,
  cancelled: colors.textMuted,
};

export function StatusPill({ status }: { status: MatchStatus }) {
  const color = statusColors[status];
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color, backgroundColor: withAlpha(color, 0.08), boxShadow: glow.badge(color) },
      ]}>
      <Text style={[styles.text, { color }]}>{statusLabels[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
  },
});
