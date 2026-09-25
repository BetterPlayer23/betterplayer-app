import { useRef, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NOTES_MAX, checkResult, describeOutcome, type ResultDetails } from '@shared/games';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { CameraField } from '@/components/CameraField';
import { ResultScreenExample } from '@/components/ResultScreenExample';
import { TextField } from '@/components/TextField';
import { gameById } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import { matchError, submitResult } from '@/matches/api';
import type { Match } from '@/matches/types';
import { uploadResultImage, type PickedImage } from '@/matches/upload';

type Scores = Record<string, string>; // uid -> text typed

const SCORE_KEYS = 'score-keys'; // iOS keyboard bar with Next / Done

const toNumbers = (s: Scores, uids: string[]) =>
  Object.fromEntries(uids.map((u) => [u, s[u] === undefined || s[u] === '' ? NaN : Number(s[u])]));

// "Report result": winner, score fields for the game, screenshot, notes.
export function ReportResultForm({ match, uid }: { match: Match; uid: string }) {
  const game = gameById(match.game);
  const uids = match.players.map((p) => p.uid);
  const [winner, setWinner] = useState<string | null>(null);
  const [main, setMain] = useState<Scores>({});
  const [pens, setPens] = useState<Scores>({});
  const [dmg, setDmg] = useState<Scores>({});
  const [image, setImage] = useState<PickedImage | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // Score boxes in screen order, so "Next" can move to the following one.
  const inputs = useRef<Record<string, TextInput | null>>({});
  const [focused, setFocused] = useState<string | null>(null);
  if (!game) return null;

  const kind = game.resultKind;
  const mainNums = toNumbers(main, uids);
  const level = kind === 'goals' && uids.length === 2 && mainNums[uids[0]] === mainNums[uids[1]];
  const fieldLabel =
    kind === 'goals' ? 'Goals' : kind === 'crowns' ? 'Crowns (0–3)' : 'Eliminations';

  function details(): ResultDetails {
    if (kind === 'goals') {
      return { goals: mainNums, ...(level && { penalties: toNumbers(pens, uids) }) };
    }
    if (kind === 'crowns') return { crowns: mainNums };
    return { eliminations: mainNums, damage: toNumbers(dmg, uids) };
  }
  // Clash Royale and squads: the winner (or a tie / draw) follows from the numbers.
  const chooseWinner = kind === 'goals';
  const preview = chooseWinner ? null : checkResult(game, uids, null, details());

  async function submit() {
    if (busy) return;
    setError(null);
    setImageError(null);
    if (chooseWinner && !winner) return setError('Choose the winner.');
    const checked = checkResult(game!, uids, chooseWinner ? winner : null, details());
    if ('error' in checked) return setError(checked.error);
    if (!image) return setImageError('Add a photo of the final result screen.');
    setBusy(true);
    try {
      const screenshotPath = await uploadResultImage(match.id, uid, image);
      await submitResult({
        matchId: match.id,
        ...(chooseWinner && winner && { winnerUid: winner }),
        details: checked.details,
        screenshotPath,
        notes: notes.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : matchError(e));
      setBusy(false);
    }
  }

  const sections = ['main', ...(level ? ['pens'] : []), ...(kind === 'eliminations' ? ['dmg'] : [])];
  const order = sections.flatMap((sec) => uids.map((u) => `${sec}:${u}`));
  const isLast = (key: string | null) => !!key && order.indexOf(key) === order.length - 1;
  function focusNext(key: string) {
    const next = order[order.indexOf(key) + 1];
    if (next) inputs.current[next]?.focus();
    else Keyboard.dismiss();
  }

  const scoreRow = (
    section: string,
    label: string,
    values: Scores,
    set: (s: Scores) => void,
    max = 3,
  ) => (
    <View style={styles.scores}>
      <Text style={styles.label}>{label}</Text>
      {match.players.map((p) => (
        <View key={p.uid} style={styles.scoreRow}>
          <Text style={styles.player} numberOfLines={1}>
            {p.gamerTag}
            {p.uid === uid ? ' (you)' : ''}
          </Text>
          <TextInput
            ref={(r) => {
              inputs.current[`${section}:${p.uid}`] = r;
            }}
            accessibilityLabel={`${label} for ${p.gamerTag}`}
            value={values[p.uid] ?? ''}
            onChangeText={(v) => {
              const digits = v.replace(/[^0-9]/g, '');
              set({ ...values, [p.uid]: digits });
              // Crowns are always one digit (0–3): go straight to the next box.
              // Goals, eliminations and damage can have 2+ digits, so they wait.
              if (kind === 'crowns' && section === 'main' && digits.length === 1) {
                focusNext(`${section}:${p.uid}`);
              }
            }}
            onFocus={() => setFocused(`${section}:${p.uid}`)}
            onBlur={() => setFocused((f) => (f === `${section}:${p.uid}` ? null : f))}
            // "Next" moves to the following box, "Done" on the last one.
            enterKeyHint={isLast(`${section}:${p.uid}`) ? 'done' : 'next'}
            submitBehavior={isLast(`${section}:${p.uid}`) ? 'blurAndSubmit' : 'submit'}
            onSubmitEditing={() => focusNext(`${section}:${p.uid}`)}
            inputAccessoryViewID={Platform.OS === 'ios' ? SCORE_KEYS : undefined}
            keyboardType="number-pad"
            maxLength={max}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>
      ))}
    </View>
  );

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Report result</Text>
      <Text style={styles.help}>
        Only one report per match, and it can’t be edited. The other{' '}
        {uids.length > 2 ? 'players' : 'player'} then have 30 minutes to confirm or dispute it.
        The photo is checked automatically.
      </Text>
      {chooseWinner && (
        <ChipSelect
          label="Who won?"
          options={match.players.map((p) => ({ id: p.uid, label: p.gamerTag }))}
          value={winner}
          onChange={setWinner}
        />
      )}
      {scoreRow('main', fieldLabel, main, setMain)}
      {level && scoreRow('pens', 'Penalty shoot-out', pens, setPens)}
      {kind === 'eliminations' && scoreRow('dmg', 'Damage', dmg, setDmg, 6)}
      {Platform.OS === 'ios' && (
        // The iPhone number pad has no return key: add a Next / Done bar above it.
        <InputAccessoryView nativeID={SCORE_KEYS}>
          <View style={styles.keyBar}>
            <Pressable
              accessibilityRole="button"
              onPress={() => (focused ? focusNext(focused) : Keyboard.dismiss())}
              style={styles.keyButton}>
              <Text style={styles.keyText}>{isLast(focused) || !focused ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
      {preview && 'winners' in preview && (
        <Text style={styles.outcome}>
          Result: {describeOutcome(preview.winners, match.players)}
        </Text>
      )}
      <ResultScreenExample game={game} players={match.players} />
      <CameraField
        label={
          game.capture === 'camera_or_library' ? 'Screenshot or photo of the result' : 'Photo of the final result'
        }
        allowLibrary={game.capture === 'camera_or_library'}
        value={image}
        onChange={setImage}
        error={imageError}
      />
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        maxLength={NOTES_MAX}
        multiline
        autoCapitalize="sentences"
        autoCorrect
      />
      {error && <FormMessage kind="error" text={error} />}
      {busy && <Text style={styles.help}>Checking your photo… this can take a few seconds.</Text>}
      <Button label="Send result" onPress={submit} loading={busy} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    marginTop: -8,
  },
  scores: {
    gap: 8,
  },
  keyBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  keyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  keyText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.accent,
  },
  outcome: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.accent,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  player: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
  },
  input: {
    width: 72,
    textAlign: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    fontFamily: fonts.bodySemiBold,
    fontSize: 18,
    color: colors.text,
  },
});
