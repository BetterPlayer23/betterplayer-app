import { useState } from 'react';

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
import { checkAge, checkGamerTag, checkPlatforms } from '@/auth/validation';

// Shown when someone is signed in but their profile was never saved
// (for example, the connection dropped during sign-up).
export default function CompleteProfileScreen() {
  const { createProfile, logOut } = useAuth();
  const [gamerTag, setGamerTag] = useState('');
  const [platforms, setPlatforms] = useState<PlatformId[]>([]);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next = {
      gamerTag: checkGamerTag(gamerTag),
      platform: checkPlatforms(platforms),
      age: checkAge(ageConfirmed),
    };
    setErrors(next);
    setFormError(null);
    if (Object.values(next).some(Boolean) ) return;

    setBusy(true);
    try {
      await createProfile(gamerTag, platforms);
    } catch (e) {
      setFormError(friendlyError(e));
      setBusy(false);
    }
  }

  return (
    <AuthForm
      title="Finish your profile"
      subtitle="Your account exists, but your profile wasn’t saved. Add these details to continue."
      footer={<TextLink label="Log out" onPress={logOut} />}>
      <TextField
        label="Gamer tag"
        value={gamerTag}
        onChangeText={setGamerTag}
        error={errors.gamerTag}
        hint="Visible to other players. 3–20 letters, numbers or _."
        maxLength={20}
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
      {formError && <FormMessage kind="error" text={formError} />}
      <Button label="Save and continue" onPress={submit} loading={busy} />
    </AuthForm>
  );
}
