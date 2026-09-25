import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ADMIN_NOTE_MAX, ADMIN_NOTE_MIN, REVERSAL_HOURS } from '@shared/games';

import { Button } from '@/components/Button';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/constants/theme';
import { matchError, reverseAutoDecision } from '@/matches/api';
import type { AdminReview } from '@/matches/hooks';

const decisionLabels = {
  approve: 'Approved',
  override: 'Winner overridden',
  cancel_refund: 'Cancelled & refunded',
} as const;

const CANCEL = '__cancel__';

// One line in "Past decisions". Automatic decisions are labelled
// "Auto (Vision)" and can be reversed by an admin within 24 hours.
export function PastDecisionRow({
  review,
  reversed,
  adminUid,
  first,
}: {
  review: AdminReview;
  reversed: boolean; // a reversal of this decision exists
  adminUid: string | null;
  first: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auto = review.decidedBy === 'vision';
  const decidedAt = review.createdAt?.toMillis() ?? 0;
  const inTime = Date.now() - decidedAt < REVERSAL_HOURS * 3600_000;
  const playedIn = !!adminUid && !!review.players?.some((p) => p.uid === adminUid);
  const canReverse = auto && !reversed && inTime && !!review.players;

  let label: string = decisionLabels[review.decision];
  if (review.reverses) {
    label = `Reversal · ${review.decision === 'override' ? 'Winner changed' : 'Cancelled & refunded'}`;
  } else if (auto) {
    label = `Auto (Vision) · ${label}`;
  }

  async function reverse() {
    setError(null);
    if (!choice) return setError('Choose the correct winner, or Cancel & refund.');
    if (note.trim().length < ADMIN_NOTE_MIN) {
      return setError(`Add a note (at least ${ADMIN_NOTE_MIN} characters) explaining why.`);
    }
    setBusy(true);
    try {
      await reverseAutoDecision({
        matchId: review.matchId,
        decision: choice === CANCEL ? 'cancel_refund' : 'override',
        ...(choice !== CANCEL && { winnerUid: choice }),
        note: note.trim(),
      });
      setOpen(false);
    } catch (e) {
      setError(matchError(e));
    }
    setBusy(false);
  }

  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Text style={styles.text}>
        <Text style={styles.strong}>{review.gameName}</Text> ·{' '}
        <Text style={auto ? styles.auto : undefined}>{label}</Text>
        {review.draw
          ? ' · draw, refunded'
          : review.winnerGamerTag
            ? ` · ${review.winnerGamerTag} ${(review.winners?.length ?? 1) > 1 ? 'shared' : 'won'}`
            : ''}
        {review.disputed ? ' · disputed' : ''}
        {reversed ? ' · reversed' : ''}
        {'\n'}
        <Text style={styles.note}>
          {review.createdAt ? review.createdAt.toDate().toLocaleString('en-GB') : ''} — {review.note}
        </Text>
      </Text>

      {canReverse && !open && (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)}>
          <Text style={styles.link}>Reverse this decision</Text>
        </Pressable>
      )}

      {canReverse && open && (
        <View style={styles.form}>
          {playedIn ? (
            <Text style={styles.warn}>You played in this match, another admin must review it</Text>
          ) : (
            <>
              <ChipSelect
                label="What should have happened?"
                options={[
                  ...review
                    .players!.filter((p) => {
                      // Offer everyone except a sole winner (a tie or draw can go to any one player).
                      const won = review.winners ?? (review.winner ? [review.winner] : []);
                      return !(won.length === 1 && won[0] === p.uid);
                    })
                    .map((p) => ({ id: p.uid, label: `${p.gamerTag} won` })),
                  { id: CANCEL, label: 'Cancel & refund' },
                ]}
                value={choice}
                onChange={setChoice}
              />
              <TextField
                label="Note (required)"
                value={note}
                onChangeText={setNote}
                maxLength={ADMIN_NOTE_MAX}
                multiline
                autoCapitalize="sentences"
                autoCorrect
                placeholder="Why the automatic decision was wrong"
              />
              {error && <FormMessage kind="error" text={error} />}
              <Button label="Confirm reversal" onPress={reverse} loading={busy} />
            </>
          )}
          <Button label="Back" variant="outline" onPress={() => setOpen(false)} disabled={busy} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    gap: 8,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  strong: {
    fontFamily: fonts.bodySemiBold,
  },
  auto: {
    fontFamily: fonts.bodySemiBold,
    color: colors.accent,
  },
  note: {
    fontSize: 13,
    color: colors.textMuted,
  },
  link: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  form: {
    gap: 10,
  },
  warn: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.awaiting,
  },
});
