import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { colors } from '@/constants/theme';

export default function WalletScreen() {
  return (
    <Screen>
      <SectionTitle>Your credits</SectionTitle>
      <View style={styles.row}>
        <StatCard label="Available credits" value="0" color={colors.accent} />
        <StatCard label="Locked credits" value="0" />
      </View>
      <SectionTitle>History</SectionTitle>
      <EmptyState
        title="No credit activity yet"
        message="Your 10 starter credits and every match result will be listed here."
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
