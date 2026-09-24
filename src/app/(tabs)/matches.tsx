import { JoinWithCode } from '@/components/JoinWithCode';
import { MatchList } from '@/components/MatchList';
import { Screen, SectionTitle } from '@/components/Screen';
import { useMyMatches, useOpenMatches } from '@/matches/hooks';

export default function MatchesScreen() {
  const open = useOpenMatches();
  const mine = useMyMatches();

  return (
    <Screen>
      <JoinWithCode />
      <SectionTitle>Open matches</SectionTitle>
      <MatchList
        {...open}
        matches={open.data}
        emptyTitle="No open matches right now"
        emptyMessage="Be the first: tap + to create a match and share its code with a rival."
      />
      <SectionTitle>Your matches</SectionTitle>
      <MatchList
        {...mine}
        matches={mine.data}
        emptyTitle="Nothing here yet"
        emptyMessage="Matches you create or join will be listed here."
      />
    </Screen>
  );
}
