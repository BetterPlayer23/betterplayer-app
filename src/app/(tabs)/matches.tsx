import { EmptyState } from '@/components/EmptyState';
import { Screen, SectionTitle } from '@/components/Screen';

export default function MatchesScreen() {
  return (
    <Screen>
      <SectionTitle>Open matches</SectionTitle>
      <EmptyState
        title="No open matches right now"
        message="Open matches from other players will appear here so you can join."
      />
      <SectionTitle>Your matches</SectionTitle>
      <EmptyState
        title="Nothing here yet"
        message="Matches you play, and their results, will be listed here."
      />
    </Screen>
  );
}
