import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useAuth } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import { checkEmail } from '@/auth/validation';

export default function LogInScreen() {
  const { logIn, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  async function submit() {
    const eErr = checkEmail(email);
    const pErr = password ? null : 'Enter your password.';
    setEmailError(eErr);
    setPasswordError(pErr);
    setMessage(null);
    if (eErr || pErr) return;

    setBusy(true);
    try {
      await logIn(email, password);
      // Signed in: the app switches to the tabs by itself.
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
      setBusy(false);
    }
  }

  async function forgot() {
    const eErr = checkEmail(email);
    setPasswordError(null);
    if (eErr) {
      setEmailError('Type your email above first, then tap “Forgot password?” again.');
      setMessage(null);
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      await resetPassword(email);
      setMessage({
        kind: 'success',
        text: 'If an account uses this email, we’ve sent a link to reset your password. Check your inbox and spam folder.',
      });
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthForm
      title="Log in"
      subtitle="Welcome back. Log in to see your matches and credits."
      footer={
        <TextLink
          prefix="New here?"
          label="Create an account"
          onPress={() => router.replace('/sign-up')}
        />
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        password
        value={password}
        onChangeText={setPassword}
        error={passwordError}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <View style={styles.forgot}>
        <TextLink
          label={sending ? 'Sending…' : 'Forgot password?'}
          onPress={forgot}
          align="flex-end"
        />
      </View>
      {message && <FormMessage kind={message.kind} text={message.text} />}
      <Button label="Log in" onPress={submit} loading={busy} />
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  forgot: {
    marginTop: -8,
  },
});
