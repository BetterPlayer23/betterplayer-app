import { EmptyState } from '@/components/EmptyState';
import { Screen, SectionTitle } from '@/components/Screen';

export default function ProfileScreen() {
  return (
    <Screen>
      <SectionTitle>Profile</SectionTitle>
      <EmptyState
        title="Your gamer tag and platforms"
        message="Add your gamer tag for each game so rivals can find you."
      />
    </Screen>
  );
}
