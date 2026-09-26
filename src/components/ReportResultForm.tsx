import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { NOTES_MAX, checkResult, describeOutcome, type ResultDetails } from '@shared/games';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CameraField } from '@/components/CameraField';
import { Checkbox } from '@/components/Checkbox';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { ResultScreenExample } from '@/components/ResultScreenExample';
import { TextField } from '@/components/TextField';
import { gameById } from '@/constants/games';
import { colors, fonts, radius, withAlpha } from '@/constants/theme';
import { matchError, readResultPhoto, submitResult, type PhotoReading } from '@/matches/api';
import type { Match, MatchPrivate } from '@/matches/types';
import { uploadResultImage, type PickedImage } from '@/matches/upload';

type Scores = Record<string, string>; // uid -> text typed
type Step = 'photo' | 'winner' | 'numbers';
const DRAW = '__draw__';

const SCORE_KEYS = 'score-keys'; // iOS keyboard bar with Next / Done

const toNumbers = (s: Scores, uids: string[]) =>
  Object.fromEntries(uids.map((u) => [u, s[u] === undefined || s[u] === '' ? NaN : Number(s[u])]));
const toText = (m: Record<string, number> | undefined): Scores =>
  Object.fromEntries(Object.entries(m ?? {}).map(([u, n]) => [u, String(n)]));

// What to photograph, per game.
const FRAME_GUIDE = {
  goals: 'Full-time score, both names visible',
  crowns: 'Battle result, both names and crowns visible',
  eliminations: 'Final scoreboard, every name visible',
} as const;

// Steps slide in from the right (not with "reduce motion").
function SlideIn({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, reduce]);
  return (
    <Animated.View
      style={{ gap: 16, opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// "Reading your result…": a line sweeping over the photo frame.
function Reading() {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, reduce]);
  return (
    <View style={styles.reading} accessibilityLiveRegion="polite">
      <View style={styles.scanBox}>
        {reduce ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }) }] }]}
          />
        )}
      </View>
      <Text style={styles.readingText}>Reading your result…</Text>
    </View>
  );
}

// A number box appearing a moment after the one before it.
function FillIn({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 220, delay: 80 * index, useNativeDriver: true }).start();
  }, [v, reduce, index]);
  return (
    <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

// Report result in three steps: 1 photo (read automatically), 2 winner,
// 3 numbers (pre-filled from the photo; edited ones are highlighted).
export function ReportResultForm({
  match,
  uid,
  priv,
}: {
  match: Match;
  uid: string;
  priv?: MatchPrivate | null;
}) {
  const game = gameById(match.game);
  const uids = match.players.map((p) => p.uid);
  const tag = (u: string) => match.players.find((p) => p.uid === u)?.gamerTag ?? 'Player';
  const [step, setStep] = useState<Step>('photo');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [reading, setReading] = useState<'idle' | 'reading' | 'unreadable'>('idle');
  const [prefill, setPrefill] = useState<PhotoReading | null>(null);
  const [manual, setManual] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [main, setMain] = useState<Scores>({});
  const [pens, setPens] = useState<Scores>({});
  const [dmg, setDmg] = useState<Scores>({});
  const [real, setReal] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, TextInput | null>>({});
  const [focused, setFocused] = useState<string | null>(null);
  if (!game) return null;

  const kind = game.resultKind;
  const mainKey = kind === 'goals' ? 'goals' : kind === 'crowns' ? 'crowns' : 'eliminations';

  // ---- step 1: photo → upload → read
  async function readPhoto(img: PickedImage) {
    setError(null);
    setReading('reading');
    try {
      const p = await uploadResultImage(match.id, uid, img);
      setPath(p);
      const r = await readResultPhoto(match.id, p);
      if (!r.readable) {
        setReading('unreadable');
        return;
      }
      setPrefill(r);
      setManual(false);
      setMain(toText(r.details[mainKey]));
      setDmg(toText(r.details.damage));
      setWinner(r.winnerUids === null ? null : r.winnerUids.length === 1 ? r.winnerUids[0] : r.winnerUids.length ? null : DRAW);
      setReading('idle');
      setStep('winner');
    } catch (e) {
      setReading('idle');
      setImage(null);
      setError(e instanceof Error && !('code' in e) ? e.message : matchError(e));
    }
  }
  function retake() {
    setImage(null);
    setPath(null);
    setReading('idle');
  }
  function enterManually() {
    setManual(true);
    setPrefill(null);
    setMain({});
    setDmg({});
    setWinner(null);
    setReading('idle');
    setStep('winner');
  }

  // ---- step 3 values
  const mainNums = toNumbers(main, uids);
  const level = kind === 'goals' && uids.length === 2 && mainNums[uids[0]] === mainNums[uids[1]];
  function details(): ResultDetails {
    if (kind === 'goals') return { goals: mainNums, ...(level && { penalties: toNumbers(pens, uids) }) };
    if (kind === 'crowns') return { crowns: mainNums };
    return { eliminations: mainNums, damage: toNumbers(dmg, uids) };
  }
  const readValue = (section: string, u: string) => {
    const m = section === 'main' ? prefill?.details[mainKey] : section === 'dmg' ? prefill?.details.damage : undefined;
    return m?.[u];
  };

  async function submit() {
    if (busy) return;
    setError(null);
    if (!real) return setError('Tick “I confirm these numbers are real” first.');
    const chosen = winner === DRAW ? null : winner;
    const checked = checkResult(game!, uids, kind === 'goals' ? chosen : null, details());
    if ('error' in checked) return setError(checked.error);
    // Clash Royale and squads: the winner follows from the numbers.
    if (kind !== 'goals' && winner) {
      const same = winner === DRAW ? checked.winners.length === 0 : checked.winners.includes(winner);
      if (!same) {
        return setError(
          `The numbers say: ${describeOutcome(checked.winners, match.players)}. Check the numbers or go back and change the winner.`,
        );
      }
    }
    if (!path) return setError('Take the photo first.');
    setBusy(true);
    try {
      await submitResult({
        matchId: match.id,
        ...(kind === 'goals' && chosen && { winnerUid: chosen }),
        details: checked.details,
        screenshotPath: path,
        notes: notes.trim() || undefined,
        confirmReal: true,
        ...(manual && { manual: true }),
      });
    } catch (e) {
      setError(matchError(e));
      setBusy(false);
    }
  }

  // ---- number boxes (Next / Done moves between them)
  const sections = ['main', ...(level ? ['pens'] : []), ...(kind === 'eliminations' ? ['dmg'] : [])];
  const order = sections.flatMap((sec) => uids.map((u) => `${sec}:${u}`));
  const isLast = (key: string | null) => !!key && order.indexOf(key) === order.length - 1;
  function focusNext(key: string) {
    const next = order[order.indexOf(key) + 1];
    if (next) inputs.current[next]?.focus();
    else Keyboard.dismiss();
  }
  const scoreRow = (section: string, label: string, values: Scores, set: (s: Scores) => void, max = 3, offset = 0) => (
    <View style={styles.scores}>
      <Text style={styles.label}>{label}</Text>
      {match.players.map((p, i) => {
        const read = readValue(section, p.uid);
        const edited = read !== undefined && values[p.uid] !== String(read);
        return (
          <FillIn key={p.uid} index={offset + i}>
            <View style={styles.scoreRow}>
              <View style={styles.flex}>
                <Text style={styles.player} numberOfLines={1}>
                  {p.gamerTag}
                  {p.uid === uid ? ' (you)' : ''}
                </Text>
                {read !== undefined && (
                  <Text style={[styles.source, edited && styles.sourceEdited]}>
                    {edited ? `Edited · photo shows ${read}` : 'Read from photo'}
                  </Text>
                )}
              </View>
              <TextInput
                ref={(r) => {
                  inputs.current[`${section}:${p.uid}`] = r;
                }}
                accessibilityLabel={`${label} for ${p.gamerTag}`}
                value={values[p.uid] ?? ''}
                onChangeText={(v) => {
                  const digits = v.replace(/[^0-9]/g, '');
                  set({ ...values, [p.uid]: digits });
                  if (kind === 'crowns' && section === 'main' && digits.length === 1) focusNext(`${section}:${p.uid}`);
                }}
                onFocus={() => setFocused(`${section}:${p.uid}`)}
                onBlur={() => setFocused((f) => (f === `${section}:${p.uid}` ? null : f))}
                enterKeyHint={isLast(`${section}:${p.uid}`) ? 'done' : 'next'}
                submitBehavior={isLast(`${section}:${p.uid}`) ? 'blurAndSubmit' : 'submit'}
                onSubmitEditing={() => focusNext(`${section}:${p.uid}`)}
                inputAccessoryViewID={Platform.OS === 'ios' ? SCORE_KEYS : undefined}
                keyboardType="number-pad"
                maxLength={max}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, read !== undefined && styles.inputRead, edited && styles.inputEdited]}
              />
            </View>
          </FillIn>
        );
      })}
    </View>
  );

  const stepNo = step === 'photo' ? 1 : step === 'winner' ? 2 : 3;
  const stepTitle = step === 'photo' ? 'Photo' : step === 'winner' ? 'Winner' : 'Numbers';
  const shown = prefill?.winnerUids;
  const photoSays =
    !prefill || shown === null || shown === undefined
      ? null
      : shown.length === 0
        ? 'The photo shows a draw'
        : shown.length === 1
          ? `The photo shows ${tag(shown[0])} won`
          : `The photo shows a tie: ${shown.map(tag).join(' & ')}`;
  const winnerOptions = [
    ...match.players.map((p) => ({ id: p.uid, label: p.gamerTag })),
    ...(kind === 'crowns' ? [{ id: DRAW, label: 'Draw' }] : []),
  ];

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>Report result</Text>
        <Text style={styles.stepNo}>
          Step {stepNo} of 3 · {stepTitle}
        </Text>
      </View>
      <View style={styles.dots}>
        {[1, 2, 3].map((n) => (
          <View key={n} style={[styles.dot, n <= stepNo && styles.dotOn]} />
        ))}
      </View>

      {step === 'photo' && (
        <SlideIn key="photo">
          <Text style={styles.help}>
            Only one report per match. The other {uids.length > 2 ? 'players' : 'player'} then have 30 minutes to
            confirm or dispute it.
          </Text>
          <View style={styles.frame}>
            <Text style={styles.frameText}>{FRAME_GUIDE[kind]}</Text>
            <ResultScreenExample game={game} players={match.players} priv={priv} />
          </View>
          {reading === 'reading' ? (
            <Reading />
          ) : reading === 'unreadable' ? (
            <>
              <FormMessage kind="error" text="We couldn’t read this photo. Retake it with every name and number in the frame, or enter the result by hand (an admin will check it)." />
              <Button label="Retake photo" onPress={retake} />
              <Button label="Enter manually" variant="outline" onPress={enterManually} />
            </>
          ) : (
            <CameraField
              label={game.capture === 'camera_or_library' ? 'Screenshot or photo of the result' : 'Photo of the final result'}
              allowLibrary={game.capture === 'camera_or_library'}
              value={image}
              onChange={(img) => {
                setImage(img);
                if (img) readPhoto(img);
              }}
            />
          )}
        </SlideIn>
      )}

      {step === 'winner' && (
        <SlideIn key="winner">
          {photoSays ? (
            <Text style={styles.says}>{photoSays}</Text>
          ) : (
            <Text style={styles.help}>{manual ? 'Enter the result by hand. An admin will check it.' : 'Who won?'}</Text>
          )}
          <ChipSelect
            label={photoSays ? 'Confirm, or pick another player' : 'Who won?'}
            options={winnerOptions}
            value={winner}
            onChange={setWinner}
          />
          {kind === 'eliminations' && (
            <Text style={styles.help}>
              Most eliminations wins; a tie goes to the most damage. If still tied, pick either tied player.
            </Text>
          )}
          <Button
            label="Confirm"
            disabled={!winner}
            onPress={() => {
              setError(null);
              setStep('numbers');
            }}
          />
          <Button label="Back" variant="outline" onPress={() => setStep('photo')} />
        </SlideIn>
      )}

      {step === 'numbers' && (
        <SlideIn key="numbers">
          {scoreRow('main', kind === 'goals' ? 'Goals' : kind === 'crowns' ? 'Crowns (0–3)' : 'Eliminations', main, setMain)}
          {level && scoreRow('pens', 'Penalty shoot-out', pens, setPens, 3, uids.length)}
          {kind === 'eliminations' && scoreRow('dmg', 'Damage', dmg, setDmg, 6, uids.length)}
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
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            maxLength={NOTES_MAX}
            multiline
            autoCapitalize="sentences"
            autoCorrect
          />
          <Text style={styles.warning}>
            Results are checked automatically and randomly reviewed by admins. Fake results lead to account
            deactivation.
          </Text>
          <Checkbox label="I confirm these numbers are real" checked={real} onChange={setReal} />
          {error && <FormMessage kind="error" text={error} />}
          <Button label="Submit result" onPress={submit} loading={busy} disabled={!real} />
          <Button label="Back" variant="outline" onPress={() => setStep('winner')} disabled={busy} />
        </SlideIn>
      )}
      {step !== 'numbers' && error && <FormMessage kind="error" text={error} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  head: {
    gap: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  stepNo: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.primary,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: -6,
  },
  dot: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.fieldBorder,
  },
  dotOn: {
    backgroundColor: colors.primary,
  },
  help: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  frame: {
    gap: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: withAlpha(colors.primary, 0.6),
    borderRadius: radius.cardSmall,
    padding: 10,
  },
  frameText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.primary,
    textAlign: 'center',
  },
  reading: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  scanBox: {
    width: 160,
    height: 100,
    borderWidth: 1.5,
    borderColor: withAlpha(colors.primary, 0.6),
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary,
    boxShadow: `0 0 12px ${withAlpha(colors.primary, 0.8)}`,
  },
  readingText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  says: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.primary,
  },
  warning: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
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
  flex: {
    flex: 1,
  },
  player: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
  },
  source: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.primary,
  },
  sourceEdited: {
    color: colors.awaiting,
  },
  input: {
    width: 80,
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
  inputRead: {
    borderColor: withAlpha(colors.primary, 0.5),
  },
  inputEdited: {
    borderColor: colors.awaiting,
    borderWidth: 2,
    backgroundColor: withAlpha(colors.awaiting, 0.1),
  },
});
