import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { NOTES_MAX, checkResult, type ResultDetails } from '@shared/games';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { ImagePickerField } from '@/components/ImagePickerField';
import { TextField } from '@/components/TextField';
import { gameById } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import { matchError, submitResult } from '@/matches/api';
import type { Match } from '@/matches/types';
import { uploadResultImage, type PickedImage } from '@/matches/upload';

type Scores = Record<string, string>; // uid -> text typed

const toNumbers = (s: Scores, uids: string[]) =>
  Object.fromEntries(uids.map((u) => [u, s[u] === undefined || s[u] === '' ? NaN : Number(s[u])]));

// "Report result": winner, score fields for the game, screenshot, notes.
export function ReportResultForm({ match, uid }: { match: Match; uid: string }) {
  const game = gameById(match.game);
  const uids = match.players.map((p) => p.uid);
  const [winner, setWinner] = useState<string | null>(null);
  const [main, setMain] = useState<Scores>({});
  const [pens, setPens] = useState<Scores>({});
  const [image, setImage] = useState<PickedImage | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  if (!game) return null;

  const kind = game.resultKind;
  const mainNums = toNumbers(main, uids);
  const level = kind === 'goals' && uids.length === 2 && mainNums[uids[0]] === mainNums[uids[1]];
  const fieldLabel =
    kind === 'goals' ? 'Goals' : kind === 'crowns' ? 'Crowns (0–3)' : 'Placement (1 = best)';

  function details(): ResultDetails {
    if (kind === 'goals') {
      return { goals: mainNums, ...(level && { penalties: toNumbers(pens, uids) }) };
    }
    if (kind === 'crowns') return { crowns: mainNums };
    return { placements: mainNums };
  }

  async function submit() {
    setError(null);
    setImageError(null);
    if (!winner) return setError('Choose the winner.');
    const checked = checkResult(game!, uids, winner, details());
    if ('error' in checked) return setError(checked.error);
    if (!image) return setImageError('Add a screenshot of the final result.');
    setBusy(true);
    try {
      const screenshotPath = await uploadResultImage(match.id, uid, image);
      await submitResult({
        matchId: match.id,
        winnerUid: winner,
        details: checked.details,
        screenshotPath,
        notes: notes.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : matchError(e));
      setBusy(false);
    }
  }

  const scoreRow = (label: string, values: Scores, set: (s: Scores) => void) => (
    <View style={styles.scores}>
      <Text style={styles.label}>{label}</Text>
      {match.players.map((p) => (
        <View key={p.uid} style={styles.scoreRow}>
          <Text style={styles.player} numberOfLines={1}>
            {p.gamerTag}
            {p.uid === uid ? ' (you)' : ''}
          </Text>
          <TextInput
            accessibilityLabel={`${label} for ${p.gamerTag}`}
            value={values[p.uid] ?? ''}
            onChangeText={(v) => set({ ...values, [p.uid]: v.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            maxLength={3}
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
      </Text>
      <ChipSelect
        label="Who won?"
        options={match.players.map((p) => ({ id: p.uid, label: p.gamerTag }))}
        value={winner}
        onChange={setWinner}
      />
      {scoreRow(fieldLabel, main, setMain)}
      {level && scoreRow('Penalty shoot-out', pens, setPens)}
      <ImagePickerField
        label="Screenshot of the final result"
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
