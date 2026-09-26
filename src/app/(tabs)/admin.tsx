import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { AdminReviewCard } from '@/components/AdminReviewCard';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FairPlayAdmin } from '@/components/FairPlayAdmin';
import { FlagsList } from '@/components/FlagsList';
import { FormMessage } from '@/components/FormMessage';
import { PastDecisionRow } from '@/components/PastDecisionRow';
import { RankingExclusions } from '@/components/RankingExclusions';
import { Screen, SectionTitle } from '@/components/Screen';
import { colors, fonts } from '@/constants/theme';
import { usePastDecisions, useReviewQueue } from '@/matches/hooks';

export default function AdminScreen() {
  const { isAdmin, user } = useAuth();
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
        Matches the automatic check couldn’t approve, and every disputed match. Newest first.
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

      <FairPlayAdmin />

      <SectionTitle>Suspicious patterns</SectionTitle>
      <Text style={styles.help}>
        Possible leaderboard farming. The same two players count at most 3 matches a day.
      </Text>
      <FlagsList />

      <SectionTitle>Left out of rankings</SectionTitle>
      <Text style={styles.help}>
        Admin and test accounts: never on leaderboards, no crowns, tiers or Founder number. They
        can still play matches.
      </Text>
      <RankingExclusions />

      <SectionTitle>Past decisions</SectionTitle>
      {past.error ? (
        <FormMessage kind="error" text={past.error} />
      ) : past.data.length === 0 ? (
        <EmptyState
          title="No decisions yet"
          message="Admin and automatic decisions will be listed here."
        />
      ) : (
        <Card style={styles.list}>
          {past.data.map((r, i) => (
            <PastDecisionRow
              key={r.id}
              review={r}
              reversed={!r.reverses && past.data.some((x) => x.reverses === r.matchId)}
              adminUid={user?.uid ?? null}
              first={i === 0}
            />
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
});
