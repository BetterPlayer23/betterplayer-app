import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthForm } from '@/components/AuthForm';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useAuth } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import { platforms as platformOptions, type PlatformId } from '@/auth/profile';
import {
  checkAge,
  checkEmail,
  checkGamerTag,
  checkPassword,
  checkPlatforms,
} from '@/auth/validation';
import { colors, fonts } from '@/constants/theme';

type Errors = Partial<Record<'email' | 'password' | 'gamerTag' | 'platform' | 'age', string>>;

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gamerTag, setGamerTag] = useState('');
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next: Errors = {
      email: checkEmail(email) ?? undefined,
      password: checkPassword(password) ?? undefined,
      gamerTag: checkGamerTag(gamerTag) ?? undefined,
      platform: checkPlatforms(platforms) ?? undefined,
      age: checkAge(ageConfirmed) ?? undefined,
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean) ) return;

    setBusy(true);
    try {
      await signUp({ email, password, gamerTag, platforms });
      // Signed in: the app switches to the tabs by itself.
    } catch (e) {
      setFormError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <AuthForm
      title="Create your account"
      footer={
        <TextLink
          prefix="Already have an account?"
          label="Log in"
          onPress={() => router.replace('/log-in')}
        />
      }>
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
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
        error={errors.password}
        hint="At least 8 characters."
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Gamer tag"
        value={gamerTag}
        onChangeText={setGamerTag}
        error={errors.gamerTag}
        hint="Visible to other players. 3–20 letters, numbers or _."
        maxLength={20}
        autoComplete="username"
        textContentType="username"
      />
      <MultiChipSelect
        label="Platforms you play on"
        hint="Pick all that apply."
        options={platformOptions}
        value={platforms}
        onChange={setPlatforms}
        error={errors.platform}
      />
      <Checkbox
        label="I confirm I am 18 or older and live in Spain"
        checked={ageConfirmed}
        onChange={setAgeConfirmed}
        error={errors.age}
      />
      <Text style={styles.note}>
        New accounts receive <Text style={styles.noteStrong}>10 Beta Credits</Text>. Beta Credits
        have no cash value.
      </Text>
      <TextLink
        prefix="Before joining:"
        label="read the beta rules"
        onPress={() => router.push('/beta-rules')}
      />
      {formError && <FormMessage kind="error" text={formError} />}
      <Button label="Join closed beta" onPress={submit} loading={busy} />
    </AuthForm>
  );
}

const styles = StyleSheet.create({
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  noteStrong: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
});
