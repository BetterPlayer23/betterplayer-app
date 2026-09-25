import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { StorageImage } from '@/components/StorageImage';
import { colors, fonts } from '@/constants/theme';
import { describeResult } from '@/matches/format';
import type { Dispute, Report } from '@/matches/hooks';
import type { MatchPlayer } from '@/matches/types';

// Shows the reported result (and any dispute) with screenshots.
export function ReportView({
  report,
  disputes = [],
  players,
}: {
  report: Report;
  disputes?: Dispute[];
  players: MatchPlayer[];
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Reported by {report.gamerTag}</Text>
      <Text style={styles.winner}>Winner: {report.winnerGamerTag}</Text>
      <Text style={styles.score}>{describeResult(report.details, players)}</Text>
      {report.notes && <Text style={styles.notes}>“{report.notes}”</Text>}
      <StorageImage path={report.screenshotPath} label="Result screenshot" />
      {disputes.map((d) => (
        <View key={d.uid} style={styles.dispute}>
          <Text style={styles.disputeTitle}>Disputed by {d.gamerTag}</Text>
          <Text style={styles.notes}>{d.reason}</Text>
          {d.evidencePath && <StorageImage path={d.evidencePath} label="Dispute evidence" />}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  winner: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  score: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.accent,
  },
  notes: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  dispute: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    marginTop: 4,
  },
  disputeTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.error,
  },
});
