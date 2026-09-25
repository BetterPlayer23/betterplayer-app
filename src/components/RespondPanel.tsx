import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DISPUTE_REASON_MAX, DISPUTE_REASON_MIN } from '@shared/games';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { CameraField } from '@/components/CameraField';
import { TextField } from '@/components/TextField';
import { colors, fonts, textGlow } from '@/constants/theme';
import { confirmResult, disputeResult, matchError } from '@/matches/api';
import type { Match } from '@/matches/types';
import { uploadResultImage, type PickedImage } from '@/matches/upload';

export function useCountdown(deadlineMs: number | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineMs) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);
  if (!deadlineMs) return null;
  const left = Math.max(0, deadlineMs - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Countdown plus Confirm / Dispute for players who didn't report.
export function RespondPanel({ match, uid }: { match: Match; uid: string }) {
  const deadline = match.responseDeadline?.toMillis();
  const countdown = useCountdown(deadline);
  const expired = !!deadline && deadline <= Date.now();
  const reporter = match.reportedByUid === uid;
  const confirmed = match.confirmedUids?.includes(uid);
  const [mode, setMode] = useState<'idle' | 'dispute'>('idle');
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<PickedImage | null>(null);
  const [busy, setBusy] = useState<null | 'confirm' | 'dispute'>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy('confirm');
    setError(null);
    try {
      await confirmResult(match.id);
    } catch (e) {
      setError(matchError(e));
    } finally {
      setBusy(null);
    }
  }

  async function dispute() {
    const r = reason.trim();
    if (r.length < DISPUTE_REASON_MIN) {
      return setError(`Explain what’s wrong in at least ${DISPUTE_REASON_MIN} characters.`);
    }
    setBusy('dispute');
    setError(null);
    try {
      const evidencePath = evidence ? await uploadResultImage(match.id, uid, evidence) : undefined;
      await disputeResult(match.id, r, evidencePath);
    } catch (e) {
      setError(e instanceof Error && !('code' in e) ? e.message : matchError(e));
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.timerRow}>
        <Text style={styles.label}>Time to confirm or dispute</Text>
        <Text style={[styles.timer, expired && { color: colors.textMuted }]}>
          {expired ? 'Time’s up' : countdown}
        </Text>
      </View>
      {reporter ? (
        <Text style={styles.body}>
          You reported this result. Waiting for the other{' '}
          {match.players.length > 2 ? 'players' : 'player'} to confirm. If nobody disputes it in
          time, it goes to a Betterplayer admin as confirmed.
        </Text>
      ) : confirmed ? (
        <Text style={styles.body}>You confirmed this result. Waiting for the others.</Text>
      ) : expired ? (
        <Text style={styles.body}>The time to respond is over. An admin will check it.</Text>
      ) : mode === 'dispute' ? (
        <>
          <TextField
            label="What’s wrong with this result?"
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={DISPUTE_REASON_MAX}
            hint={`${DISPUTE_REASON_MIN}–${DISPUTE_REASON_MAX} characters. An admin will read it.`}
            autoCapitalize="sentences"
            autoCorrect
          />
          <CameraField
            label="Your photo (optional)"
            value={evidence}
            onChange={setEvidence}
          />
          <Button label="Send dispute" onPress={dispute} loading={busy === 'dispute'} />
          <Button label="Back" variant="outline" onPress={() => setMode('idle')} />
        </>
      ) : (
        <>
          <Text style={styles.body}>
            Check the result and screenshot. If nobody responds in time, it counts as confirmed.
          </Text>
          <Button
            label="Confirm result"
            variant="primary"
            onPress={confirm}
            loading={busy === 'confirm'}
          />
          <Button label="Dispute" variant="danger" onPress={() => setMode('dispute')} />
        </>
      )}
      {error && <FormMessage kind="error" text={error} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderColor: colors.awaiting,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  timer: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.awaiting,
    ...textGlow(colors.awaiting),
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
});
