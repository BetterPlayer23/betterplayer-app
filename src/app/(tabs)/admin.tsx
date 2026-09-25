import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AdminReviewCard } from '@/components/AdminReviewCard';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { colors, fonts } from '@/constants/theme';
import { usePastDecisions, useReviewQueue } from '@/matches/hooks';

const decisionLabels = {
  approve: 'Approved',
  override: 'Winner overridden',
  cancel_refund: 'Cancelled & refunded',
} as const;

export default function AdminScreen() {
  const { isAdmin } = useAuth();
  const queue = useReviewQueue(isAdmin);
  const past = usePastDecisions(isAdmin);

  if (!isAdmin) {
    return (
      <Screen>
        <EmptyState title="Admins only" message="This area is for Betterplayer admins." />
      </Screen>
    );
  }

  return (
    <Screen>
      <SectionTitle>Review queue</SectionTitle>
      <Text style={styles.help}>
        Every match is checked here before credits move. Newest first.
      </Text>
      {queue.error ? (
        <FormMessage kind="error" text={queue.error} />
      ) : queue.loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : queue.data.length === 0 ? (
        <EmptyState title="Nothing to review" message="New results will appear here live." />
      ) : (
        queue.data.map((m) => <AdminReviewCard key={m.id} match={m} />)
      )}

      <SectionTitle>Past decisions</SectionTitle>
      {past.error ? (
        <FormMessage kind="error" text={past.error} />
      ) : past.data.length === 0 ? (
        <EmptyState title="No decisions yet" message="Your decisions will be listed here." />
      ) : (
        <Card style={styles.list}>
          {past.data.map((r, i) => (
            <Text key={r.id} style={[styles.row, i > 0 && styles.divider]}>
              <Text style={styles.strong}>{r.gameName}</Text> · {decisionLabels[r.decision]}
              {r.winnerGamerTag ? ` · ${r.winnerGamerTag} won` : ''}
              {r.disputed ? ' · disputed' : ''}
              {'\n'}
              <Text style={styles.note}>
                {r.createdAt ? r.createdAt.toDate().toLocaleString('en-GB') : ''} — {r.note}
              </Text>
            </Text>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: -8,
  },
  loading: {
    marginVertical: 24,
  },
  list: {
    paddingVertical: 4,
  },
  row: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    paddingVertical: 10,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  strong: {
    fontFamily: fonts.bodySemiBold,
  },
  note: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
