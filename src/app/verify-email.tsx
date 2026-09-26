import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import { setFlash, useResendCooldown } from '@/auth/verification';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors, fonts } from '@/constants/theme';

const CHECK_EVERY_MS = 5_000;

// Shown until the player has clicked the verification link we emailed them
// (new players after sign-up; existing players once, at their next login).
// No button to press: the app checks every 5 seconds and whenever it comes
// back to the screen (e.g. after opening the email), and moves on by itself.
// Creating or joining a match needs a verified email.
export default function VerifyEmailScreen() {
  const { user, resendVerification, checkVerified, logOut } = useAuth();
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const created = Date.parse(user?.metadata.creationTime ?? '') || 0;
  const cooldown = useResendCooldown(created);
  const checking = useRef(false);
  // checkVerified is a new function on every render (the countdown re-renders
  // each second): keep the latest in a ref so the 5-second timer isn't reset.
  const checkRef = useRef(checkVerified);
  checkRef.current = checkVerified;

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (checking.current || !alive) return;
      checking.current = true;
      try {
        if (await checkRef.current()) setFlash('Email verified. You’re all set!');
      } catch {
        // Offline for a moment: the next check tries again.
      } finally {
        checking.current = false;
      }
    };
    const timer = setInterval(check, CHECK_EVERY_MS);
    // Back in the app (native) or back on the tab (web): check straight away.
    const appState = AppState.addEventListener('change', (s) => s === 'active' && check());
    const onVisible = () => document.visibilityState === 'visible' && check();
    if (Platform.OS === 'web') {
      window.addEventListener('focus', check);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      alive = false;
      clearInterval(timer);
      appState.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', check);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);

  async function resend() {
    setSending(true);
    setMessage(null);
    try {
      await resendVerification();
      setMessage({ kind: 'success', text: 'Email sent. Check your inbox and your spam folder.' });
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <SectionTitle>Verify your email</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.body}>
          We sent a link to <Text style={styles.email}>{user?.email ?? 'your email'}</Text>. Tap it
          to confirm it’s really you. This screen moves on by itself once it’s done.
        </Text>
        <View style={styles.waiting}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.small}>Waiting for you to tap the link…</Text>
        </View>
        <Text style={styles.small}>
          You need a verified email to create or join matches. This keeps the beta to real
          players, one account each.
        </Text>
        {message && <FormMessage kind={message.kind} text={message.text} />}
        <Button
          label={cooldown > 0 ? `Resend email (${cooldown} s)` : 'Resend email'}
          variant="outline"
          onPress={resend}
          loading={sending}
          disabled={cooldown > 0 || sending}
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
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
