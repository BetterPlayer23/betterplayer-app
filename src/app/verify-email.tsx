import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors, fonts } from '@/constants/theme';

// Shown until the player has clicked the verification link we emailed them
// (new players after sign-up; existing players once, at their next login).
// Creating or joining a match needs a verified email.
export default function VerifyEmailScreen() {
  const { user, resendVerification, checkVerified, logOut } = useAuth();
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState<null | 'check' | 'resend'>(null);

  async function check() {
    setBusy('check');
    setMessage(null);
    try {
      const ok = await checkVerified();
      // Verified: the app moves on by itself.
      if (!ok) {
        setMessage({
          kind: 'error',
          text: 'Not verified yet. Open the email and tap the link, then try again.',
        });
      }
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    setBusy('resend');
    setMessage(null);
    try {
      await resendVerification();
      setMessage({ kind: 'success', text: 'Email sent. Check your inbox and your spam folder.' });
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <SectionTitle>Verify your email</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.body}>
          We sent a link to <Text style={styles.email}>{user?.email ?? 'your email'}</Text>. Tap it
          to confirm it’s really you, then come back here.
        </Text>
        <Text style={styles.small}>
          You need a verified email to create or join matches. This keeps the beta to real
          players, one account each.
        </Text>
        {message && <FormMessage kind={message.kind} text={message.text} />}
        <Button label="I’ve clicked the link" onPress={check} loading={busy === 'check'} />
        <Button
          label="Send the email again"
          variant="outline"
          onPress={resend}
          loading={busy === 'resend'}
        />
      </Card>
      <TextLink label="Log out" onPress={logOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  email: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
