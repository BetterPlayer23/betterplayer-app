import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { friendlyError } from '@/auth/errors';
import {
  gameIdFields,
  platforms as platformOptions,
  platformsOf,
  type GameIdKey,
  type GameIds,
  type PlatformId,
} from '@/auth/profile';
import {
  checkGamerTag,
  checkGameId,
  checkPlatforms,
  normalizeGameId,
  GAME_ID_MAX,
} from '@/auth/validation';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { MultiChipSelect } from '@/components/MultiChipSelect';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatsCard } from '@/components/StatsCard';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/constants/theme';

type Message = { kind: 'error' | 'success'; text: string } | null;

export default function ProfileScreen() {
  const { profile, user, isAdmin, updateGamerTag, updateGameIds, updatePlatforms, logOut } =
    useAuth();

  // Gamer tag editing
  const [editingTag, setEditingTag] = useState(false);
  const [tag, setTag] = useState(profile?.gamerTag ?? '');
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagMessage, setTagMessage] = useState<Message>(null);
  const [savingTag, setSavingTag] = useState(false);

  // Game IDs
  const [ids, setIds] = useState<Record<GameIdKey, string>>(() => toForm(profile?.gameIds));
  const [idErrors, setIdErrors] = useState<Partial<Record<GameIdKey, string | null>>>({});
  const [idsMessage, setIdsMessage] = useState<Message>(null);
  const [savingIds, setSavingIds] = useState(false);

  // Platforms
  const savedPlatforms = profile ? platformsOf(profile) : [];
  const [plats, setPlats] = useState<PlatformId[]>(savedPlatforms);
  const [platsMessage, setPlatsMessage] = useState<Message>(null);
  const [savingPlats, setSavingPlats] = useState(false);
  const platsChanged = plats.join() !== savedPlatforms.join();

  // Keep the form in step with the saved profile when not editing.
  useEffect(() => {
    if (!editingTag) setTag(profile?.gamerTag ?? '');
  }, [profile?.gamerTag, editingTag]);

  if (!profile || !user) return null;

  async function saveTag() {
    const err = checkGamerTag(tag);
    setTagError(err);
    setTagMessage(null);
    if (err) return;
    setSavingTag(true);
    try {
      await updateGamerTag(tag);
      setEditingTag(false);
      setTagMessage({ kind: 'success', text: 'Gamer tag saved.' });
    } catch (e) {
      setTagMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSavingTag(false);
    }
  }

  async function savePlatforms() {
    const err = checkPlatforms(plats);
    setPlatsMessage(err ? { kind: 'error', text: err } : null);
    if (err) return;
    setSavingPlats(true);
    try {
      await updatePlatforms(plats);
      setPlatsMessage({ kind: 'success', text: 'Platforms saved.' });
    } catch (e) {
      setPlatsMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSavingPlats(false);
    }
  }

  async function saveIds() {
    const errors: Partial<Record<GameIdKey, string | null>> = {};
    const cleaned: GameIds = {};
    for (const f of gameIdFields) {
      errors[f.key] = checkGameId(f.key, ids[f.key]);
      const v = normalizeGameId(f.key, ids[f.key]);
      if (v) cleaned[f.key] = v;
    }
    setIdErrors(errors);
    setIdsMessage(null);
    if (Object.values(errors).some(Boolean)) return;
    setSavingIds(true);
    try {
      await updateGameIds(cleaned);
      setIds(toForm(cleaned));
      setIdsMessage({ kind: 'success', text: 'Game IDs saved.' });
    } catch (e) {
      setIdsMessage({ kind: 'error', text: friendlyError(e) });
    } finally {
      setSavingIds(false);
    }
  }

  return (
    <Screen>
      <SectionTitle>Profile</SectionTitle>
      <Card style={styles.card}>
        {editingTag ? (
          <>
            <TextField
              label="Gamer tag"
              value={tag}
              onChangeText={setTag}
              error={tagError}
              hint="Visible to other players. 3–20 letters, numbers or _."
              maxLength={20}
            />
            <View style={styles.row}>
              <Button
                label="Cancel"
                variant="outline"
                style={styles.flex}
                onPress={() => {
                  setEditingTag(false);
                  setTagError(null);
                }}
              />
              <Button label="Save" style={styles.flex} onPress={saveTag} loading={savingTag} />
            </View>
          </>
        ) : (
          <View style={styles.tagRow}>
            <Info label="Gamer tag" value={profile.gamerTag} big />
            <Button
              label="Edit"
              variant="outline"
              style={styles.editButton}
              onPress={() => {
                setEditingTag(true);
                setTagMessage(null);
              }}
            />
          </View>
        )}
        {tagMessage && <FormMessage kind={tagMessage.kind} text={tagMessage.text} />}
        <Info label="Email" value={user.email ?? '—'} />
      </Card>

      <SectionTitle>Stats</SectionTitle>
      <StatsCard uid={user.uid} />

      <SectionTitle>Platforms</SectionTitle>
      <Card style={styles.card}>
        <MultiChipSelect
          label="Platforms you play on"
          hint="Pick all that apply (at least one)."
          options={platformOptions}
          value={plats}
          onChange={(v) => {
            setPlats(v);
            setPlatsMessage(null);
          }}
        />
        {platsMessage && <FormMessage kind={platsMessage.kind} text={platsMessage.text} />}
        {(platsChanged || !profile.platforms) && (
          <Button label="Save platforms" onPress={savePlatforms} loading={savingPlats} />
        )}
      </Card>

      <SectionTitle>Game IDs</SectionTitle>
      <Card style={styles.card}>
        <Text style={styles.help}>
          Add the name you use in each game so rivals can find you. Leave a box empty if you don’t
          play that game.
        </Text>
        {gameIdFields.map((f) => (
          <TextField
            key={f.key}
            label={`${f.label} · ${f.game}`}
            placeholder={f.placeholder}
            value={ids[f.key]}
            onChangeText={(v) => setIds((prev) => ({ ...prev, [f.key]: v }))}
            error={idErrors[f.key]}
            maxLength={GAME_ID_MAX + 1}
          />
        ))}
        {idsMessage && <FormMessage kind={idsMessage.kind} text={idsMessage.text} />}
        <Button label="Save game IDs" onPress={saveIds} loading={savingIds} />
      </Card>

      <Button
        label="Beta rules & privacy"
        variant="outline"
        onPress={() => router.push('/beta-rules')}
        style={styles.logout}
      />
      {isAdmin && (
        <Button
          label="Admin: review matches"
          onPress={() => router.navigate('/admin')}
          style={styles.logout}
        />
      )}
      <Button label="Log out" variant="outline" onPress={logOut} style={styles.logout} />
    </Screen>
  );
}

function toForm(gameIds: GameIds | undefined): Record<GameIdKey, string> {
  return {
    eaId: gameIds?.eaId ?? '',
    activisionId: gameIds?.activisionId ?? '',
    epicName: gameIds?.epicName ?? '',
    clashRoyaleTag: gameIds?.clashRoyaleTag ?? '',
  };
}

function Info({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, big && styles.infoValueBig]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  editButton: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    minHeight: 44,
  },
  info: {
    flexShrink: 1,
    gap: 2,
  },
  infoLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textMuted,
  },
  infoValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  infoValueBig: {
    fontFamily: fonts.heading,
    fontSize: 26,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  logout: {
    marginTop: 8,
  },
});
