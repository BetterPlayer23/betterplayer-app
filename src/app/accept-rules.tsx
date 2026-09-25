import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { BETA_RULES_CHECKBOX } from '@shared/betaRules';

import { useAuth } from '@/auth/AuthProvider';
import { BetaRulesText } from '@/components/BetaRulesText';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors, fonts } from '@/constants/theme';
import { matchError } from '@/matches/api';

// Shown after sign-up, and once to existing players, until they accept the
// current beta rules. The app switches to the tabs by itself afterwards.
export default function AcceptRulesScreen() {
  const { acceptRules, logOut } = useAuth();
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    setError(null);
    if (!ticked) return setError('Tick the box to continue.');
    setBusy(true);
    try {
      await acceptRules();
    } catch (e) {
      setError(matchError(e));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SectionTitle>Beta rules</SectionTitle>
      <Text style={styles.intro}>
        Please read the closed beta rules. You need to accept them to continue.
      </Text>
      <BetaRulesText />
      <Checkbox
        label={BETA_RULES_CHECKBOX}
        checked={ticked}
        onChange={setTicked}
        error={error && !ticked ? error : null}
      />
      {error && ticked && <FormMessage kind="error" text={error} />}
      <Button label="Continue" onPress={accept} loading={busy} disabled={!ticked} />
      <TextLink label="Log out" onPress={logOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
    marginTop: -8,
  },
});
