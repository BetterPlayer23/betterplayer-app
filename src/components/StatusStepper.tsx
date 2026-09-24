import { StyleSheet, Text, View } from 'react-native';

import type { MatchStatus } from '@shared/games';

import { colors, fonts } from '@/constants/theme';
import { statusLabels } from '@/matches/types';

import { statusColors } from './StatusPill';

const STEPS: MatchStatus[] = [
  'open',
  'full',
  'started',
  'awaiting_result',
  'under_review',
  'completed',
];

// Open → Full → Started → Awaiting result → Under review → Completed.
export function StatusStepper({ status }: { status: MatchStatus }) {
  const current = STEPS.indexOf(status);

  return (
    <View style={styles.list} accessibilityLabel={`Match status: ${statusLabels[status]}`}>
      {STEPS.map((step, i) => {
        const done = current >= 0 && i < current;
        const active = i === current;
        const color = active ? statusColors[step] : done ? colors.text : colors.textMuted;
        return (
          <View key={step} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { borderColor: active || done ? color : colors.border },
                  (active || done) && { backgroundColor: color },
                ]}
              />
              {i < STEPS.length - 1 && (
                <View style={[styles.line, done && { backgroundColor: colors.text }]} />
              )}
            </View>
            <Text style={[styles.label, { color }, active && { fontFamily: fonts.bodyBold }]}>
              {statusLabels[step]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 0,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 30,
  },
  rail: {
    width: 14,
    alignItems: 'center',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    marginTop: 2,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
  },
});
