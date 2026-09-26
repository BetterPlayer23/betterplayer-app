import { router, useLocalSearchParams } from 'expo-router';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth, type AuthStatus } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import { checkEmail, checkPassword } from '@/auth/validation';
import { setFlash, useResendCooldown } from '@/auth/verification';
import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/constants/theme';
import { auth } from '@/firebase';

// /auth/action?mode=…&oobCode=… — the page Firebase's emails link to (set as
// the "action URL" in Firebase console → Authentication → Templates):
// - verifyEmail:   confirms the email, then goes straight to Home.
// - resetPassword: a "new password" form.
// - recoverEmail:  undoes a change of sign-in email.
// Expired or already-used links get a clear message and a way to get a new one.
// Reachable whether signed in or not (outside the sign-in gates).

type Mode = 'verifyEmail' | 'resetPassword' | 'recoverEmail';
type Phase =
  | { step: 'working' }
  | { step: 'error'; text: string }
  | { step: 'verified'; signedIn: boolean }
  | { step: 'newPassword'; email: string }
  | { step: 'passwordChanged' }
  | { step: 'recovered'; email: string };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// Results by link code. While the account loads after verifying, the app
// briefly shows a loading screen and this page is rebuilt: it then picks up
// the result instead of using the (now spent) link a second time.
const done = new Map<string, Phase>();

// Where a signed-in player belongs once their email is verified.
function nextScreen(status: AuthStatus): '/' | '/accept-rules' | '/complete-profile' | null {
  if (status === 'signedIn') return '/';
  if (status === 'needsRules') return '/accept-rules';
  if (status === 'needsProfile') return '/complete-profile';
  return null;
}

export default function AuthActionScreen() {
  const params = useLocalSearchParams<{ mode?: string; oobCode?: string }>();
  const mode = one(params.mode) as Mode | '';
  const code = one(params.oobCode);
  const { status, checkVerified } = useAuth();
  const [phase, setPhaseState] = useState<Phase>(() => done.get(code) ?? { step: 'working' });
  const setPhase = (p: Phase) => {
    if (code) done.set(code, p);
    setPhaseState(p);
  };
  const started = useRef(done.has(code));

  useEffect(() => {
    if (started.current || status === 'loading') return;
    started.current = true;
    (async () => {
      if (!code || !['verifyEmail', 'resetPassword', 'recoverEmail'].includes(mode)) {
        setPhase({
          step: 'error',
          text: 'This link is incomplete. Open it again from the email, or ask for a new one below.',
        });
        return;
      }
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, code);
          const signedIn = !!auth.currentUser;
          if (signedIn) await checkVerified();
          setFlash('Email verified. You’re all set!');
          setPhase({ step: 'verified', signedIn });
        } else if (mode === 'resetPassword') {
          const email = await verifyPasswordResetCode(auth, code);
          setPhase({ step: 'newPassword', email });
        } else {
          const info = await checkActionCode(auth, code);
          await applyActionCode(auth, code);
          if (auth.currentUser) await auth.currentUser.reload().catch(() => undefined);
          setPhase({ step: 'recovered', email: info.data.email ?? '' });
        }
      } catch (e) {
        // A verification link opened twice: fine if the email is verified now.
        if (mode === 'verifyEmail' && auth.currentUser && (await checkVerified().catch(() => false))) {
          setFlash('Your email is already verified.');
          setPhase({ step: 'verified', signedIn: true });
          return;
        }
        setPhase({ step: 'error', text: friendlyError(e) });
      }
    })();
  }, [status, mode, code]);

  // Verified on this device while signed in: straight on to Home (or the next
  // step the player still has to do, e.g. accepting the beta rules).
  useEffect(() => {
    if (phase.step !== 'verified' || !phase.signedIn) return;
    const next = nextScreen(status);
    if (next) router.replace(next);
  }, [phase, status]);

  const title =
    mode === 'resetPassword' ? 'Reset your password' : mode === 'recoverEmail' ? 'Undo email change' : 'Verify your email';

  return (
    <AuthForm title={title}>
      {phase.step === 'working' && (
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.body}>Checking your link…</Text>
        </View>
      )}

      {phase.step === 'verified' &&
        (phase.signedIn ? (
          <View style={styles.row}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.body}>Email verified. Opening Betterplayer…</Text>
          </View>
        ) : (
          <>
            <FormMessage kind="success" text="Email verified." />
            <Text style={styles.body}>
              If Betterplayer is open on another screen, it continues by itself. Otherwise, log in
              here to start playing.
            </Text>
            <Button label="Log in" onPress={() => router.replace('/log-in')} />
          </>
        ))}

      {phase.step === 'newPassword' && (
        <NewPasswordForm
          code={code}
          email={phase.email}
          onDone={() => setPhase({ step: 'passwordChanged' })}
        />
      )}

      {phase.step === 'passwordChanged' && (
        <>
          <FormMessage kind="success" text="Password changed." />
          {status === 'signedOut' ? (
            <Button label="Log in with your new password" onPress={() => router.replace('/log-in')} />
          ) : (
            <Button label="Go to Home" onPress={() => router.replace('/')} />
          )}
        </>
      )}

      {phase.step === 'recovered' && <Recovered email={phase.email} />}

      {phase.step === 'error' && <LinkError mode={mode} text={phase.text} />}
    </AuthForm>
  );
}

function NewPasswordForm({ code, email, onDone }: { code: string; email: string; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ password?: string | null; again?: string | null }>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const next = {
      password: checkPassword(password),
      again: again === password ? null : 'The two passwords don’t match.',
    };
    setErrors(next);
    setMessage(null);
    if (next.password || next.again) return;
    setBusy(true);
    try {
      await confirmPasswordReset(auth, code, password);
      onDone();
    } catch (e) {
      setMessage(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={styles.body}>
        Choose a new password for <Text style={styles.strong}>{email}</Text>.
      </Text>
      <TextField
        label="New password"
        password
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        hint="At least 8 characters."
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="New password again"
        password
        value={again}
        onChangeText={setAgain}
        error={errors.again}
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={save}
      />
      {message && <FormMessage kind="error" text={message} />}
      <Button label="Save new password" onPress={save} loading={busy} />
    </>
  );
}

// The sign-in email was changed back. Suggest a new password in case someone
// else changed it.
function Recovered({ email }: { email: string }) {
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function reset() {
    setBusy(true);
    setMessage(null);
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage({ kind: 'success', text: `We sent a password reset link to ${email}.` });
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <FormMessage kind="success" text={`Your sign-in email is ${email || 'your old email'} again.`} />
      <Text style={styles.body}>
        If you didn’t ask for the change, someone else may know your password. Reset it to be safe.
      </Text>
      {message && <FormMessage kind={message.kind} text={message.text} />}
      <Button label="Reset my password" onPress={reset} loading={busy} disabled={!email} />
      <Button label="Log in" variant="outline" onPress={() => router.replace('/log-in')} />
    </>
  );
}

// Expired, already used or broken link: say so and offer a new one.
function LinkError({ mode, text }: { mode: Mode | ''; text: string }) {
  const { user, status, resendVerification } = useAuth();
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useResendCooldown();

  async function send(action: () => Promise<void>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'success', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  let action;
  if (mode === 'resetPassword') {
    action = (
      <>
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
        <Button
          label="Send a new link"
          loading={busy}
          onPress={() => {
            const err = checkEmail(email);
            setEmailError(err);
            if (!err) {
              send(
                () => sendPasswordResetEmail(auth, email.trim()),
                'If an account uses this email, we’ve sent a new link. Check your inbox and spam folder.',
              );
            }
          }}
        />
      </>
    );
  } else if (mode === 'recoverEmail') {
    action = (
      <>
        <Text style={styles.body}>
          This link can’t be sent again. Log in and use “Forgot password?” if you need to, or email
          Better.player.one@gmail.com.
        </Text>
        <Button label="Log in" onPress={() => router.replace('/log-in')} />
      </>
    );
  } else if (user && status === 'needsEmail') {
    action = (
      <Button
        label={cooldown > 0 ? `Send a new link (${cooldown} s)` : 'Send a new link'}
        loading={busy}
        disabled={cooldown > 0 || busy}
        onPress={() => send(resendVerification, `New link sent to ${user.email}. Check your inbox and spam folder.`)}
      />
    );
  } else if (user) {
    action = <Button label="Go to Home" onPress={() => router.replace('/')} />;
  } else {
    action = (
      <>
        <Text style={styles.body}>Log in and we’ll offer to send you a new link.</Text>
        <Button label="Log in to get a new link" onPress={() => router.replace('/log-in')} />
      </>
    );
  }

  return (
    <>
      <FormMessage kind="error" text={text} />
      {message && <FormMessage kind={message.kind} text={message.text} />}
      {action}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
    flexShrink: 1,
  },
  strong: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
});
