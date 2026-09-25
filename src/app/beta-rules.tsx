import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { BetaRulesText } from '@/components/BetaRulesText';
import { Screen, SectionTitle } from '@/components/Screen';
import { colors, fonts } from '@/constants/theme';

// Read-only beta rules, from Profile (and the Sign up screen).
export default function BetaRulesScreen() {
  const { profile } = useAuth();
  const accepted = profile?.acceptedAt?.toDate();

  return (
    <Screen>
      <SectionTitle>Beta rules</SectionTitle>
      {accepted && (
        <Text style={styles.accepted}>
          You accepted these rules on{' '}
          {accepted.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          .
        </Text>
      )}
      <BetaRulesText />
    </Screen>
  );
}

const styles = StyleSheet.create({
  accepted: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.success,
    marginTop: -8,
  },
});
