import { ActivityIndicator, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { MatchCard } from '@/components/MatchCard';
import { colors } from '@/constants/theme';
import type { Match } from '@/matches/types';

export function MatchList({
  matches,
  loading,
  error,
  emptyTitle,
  emptyMessage,
}: {
  matches: Match[];
  loading: boolean;
  error: string | null;
  emptyTitle: string;
  emptyMessage: string;
}) {
  if (error) return <FormMessage kind="error" text={error} />;
  if (loading) return <ActivityIndicator color={colors.accent} style={styles.loading} />;
  if (matches.length === 0) return <EmptyState title={emptyTitle} message={emptyMessage} />;
  return (
    <>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginVertical: 24,
  },
});
