import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ADMIN_NOTE_MAX, ADMIN_NOTE_MIN } from '@shared/games';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChipSelect } from '@/components/ChipSelect';
import { FormMessage } from '@/components/FormMessage';
import { ReportView } from '@/components/ReportView';
import { TextField } from '@/components/TextField';
import { VerificationBadge } from '@/components/VerificationBadge';
import { gameById } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import { adminDecide, matchError, type Decision } from '@/matches/api';
import { useDisputes, useReports } from '@/matches/hooks';
import { describeOutcome, winnersOf } from '@/matches/format';
import type { Match } from '@/matches/types';
import { formatCredits } from '@/wallet/format';

// One match in the admin queue, with Approve / Override winner / Cancel & refund.
export function AdminReviewCard({ match }: { match: Match }) {
  const reports = useReports(match.id);
  const disputes = useDisputes(match.id, !!match.disputed);
  const report = reports.data[0];
  const game = gameById(match.game);
  const { user } = useAuth();
  // Admins can't review a match they played in (the server refuses it too).
  const playedIn = !!user && match.playerUids.includes(user.uid);
  const [note, setNote] = useState('');
  const [overrideTo, setOverrideTo] = useState<string | null>(null);
  const [mode, setMode] = useState<'idle' | 'override'>('idle');
  const [busy, setBusy] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: Decision) {
    setError(null);
    if (playedIn) return;
    if (note.trim().length < ADMIN_NOTE_MIN) {
      return setError(
        `Add a note (at least ${ADMIN_NOTE_MIN} characters) explaining your decision.`,
      );
    }
    if (decision === 'override' && !overrideTo) return setError('Choose the real winner.');
    setBusy(decision);
    try {
      await adminDecide({
        matchId: match.id,
        decision,
        note: note.trim(),
        ...(decision === 'override' && overrideTo && { winnerUid: overrideTo }),
      });
      // The match leaves the queue by itself once it's decided.
    } catch (e) {
      setError(matchError(e));
      setBusy(null);
    }
  }

  return (
    <Card style={[styles.card, { borderLeftColor: game?.color ?? colors.accent }]}>
      <View style={styles.top}>
        <Text style={[styles.game, { color: game?.color ?? colors.accent }]}>{match.gameName}</Text>
        <Text style={[styles.badge, match.disputed ? styles.disputed : styles.confirmed]}>
          {match.disputed ? 'DISPUTED' : 'CONFIRMED'}
        </Text>
      </View>
      <Text style={styles.meta}>
        Players: {match.players.map((p) => p.gamerTag).join(', ')} · Pot {formatCredits(match.pot)}{' '}
        · Winner gets {formatCredits(match.winnerGets)}
      </Text>

      <VerificationBadge verification={match.verification} reasons={match.reviewReasons} />

      {report ? (
        <ReportView report={report} disputes={disputes.data} players={match.players} />
      ) : (
        <Text style={styles.meta}>{reports.loading ? 'Loading report…' : 'No report found.'}</Text>
      )}

      <TextField
        label="Note (required)"
        value={note}
        onChangeText={setNote}
        maxLength={ADMIN_NOTE_MAX}
        multiline
        autoCapitalize="sentences"
        autoCorrect
        placeholder="Why you decided this"
      />

      {playedIn && (
        <View style={styles.ownMatch}>
          <Text style={styles.ownMatchText}>
            You played in this match, another admin must review it
          </Text>
        </View>
      )}

      {mode === 'override' && !playedIn ? (
        <>
          <ChipSelect
            label="Real winner"
            options={match.players
              .filter((p) => !(report && winnersOf(report).length === 1 && winnersOf(report)[0] === p.uid))
              .map((p) => ({ id: p.uid, label: p.gamerTag }))}
            value={overrideTo}
            onChange={setOverrideTo}
          />
          <Button
            label="Confirm new winner"
            onPress={() => decide('override')}
            loading={busy === 'override'}
            disabled={!!busy}
          />
          <Button label="Back" variant="outline" onPress={() => setMode('idle')} />
        </>
      ) : (
        <View style={styles.actions}>
          <Button
            label={report ? `Approve (${describeOutcome(winnersOf(report), match.players)})` : 'Approve'}
            variant="success"
            onPress={() => decide('approve')}
            loading={busy === 'approve'}
            disabled={!!busy || !report || playedIn}
          />
          <Button
            label="Override winner"
            onPress={() => setMode('override')}
            disabled={!!busy || playedIn}
          />
          <Button
            label="Cancel & refund"
            variant="outline"
            onPress={() => decide('cancel_refund')}
            loading={busy === 'cancel_refund'}
            disabled={!!busy || playedIn}
          />
        </View>
      )}
      {error && <FormMessage kind="error" text={error} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    borderLeftWidth: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  game: {
    fontFamily: fonts.heading,
    fontSize: 22,
    flexShrink: 1,
  },
  badge: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  disputed: {
    color: colors.error,
    borderColor: colors.error,
  },
  confirmed: {
    color: colors.success,
    borderColor: colors.success,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
  ownMatch: {
    borderWidth: 1,
    borderColor: colors.awaiting,
    borderRadius: 12,
    padding: 12,
    backgroundColor: `${colors.awaiting}1A`,
  },
  ownMatchText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.awaiting,
  },
  actions: {
    gap: 10,
  },
});
