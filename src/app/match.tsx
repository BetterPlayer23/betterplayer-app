import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ENTRY_CREDITS, LOBBY_CODE_MAX } from '@shared/games';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { MoneySummary } from '@/components/MoneySummary';
import { ReportResultForm } from '@/components/ReportResultForm';
import { ReportView } from '@/components/ReportView';
import { RespondPanel } from '@/components/RespondPanel';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatusPill } from '@/components/StatusPill';
import { StatusStepper } from '@/components/StatusStepper';
import { TextField } from '@/components/TextField';
import { gameById } from '@/constants/games';
import { colors, fonts } from '@/constants/theme';
import {
  cancelMatch,
  joinMatch,
  leaveMatch,
  matchError,
  setLobbyCode,
  startMatch,
} from '@/matches/api';
import { useDisputes, useMatch, useReports } from '@/matches/hooks';
import type { Match } from '@/matches/types';
import { formatCredits } from '@/wallet/format';

export default function MatchRoomScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data: match, loading, error } = useMatch(typeof id === 'string' ? id : undefined);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  if (error) {
    return (
      <Screen>
        <FormMessage kind="error" text={error} />
      </Screen>
    );
  }
  if (!match) {
    return (
      <Screen>
        <EmptyState
          title="Match not found"
          message="This match doesn’t exist. Check the link or the share code."
        />
      </Screen>
    );
  }
  return <Room match={match} />;
}

function Room({ match }: { match: Match }) {
  const { user, isAdmin } = useAuth();
  const uid = user?.uid ?? '';
  const game = gameById(match.game);
  const color = game?.color ?? colors.accent;
  const isHost = match.hostUid === uid;
  const isPlayer = match.playerUids.includes(uid);
  const beforeStart = match.status === 'open' || match.status === 'full';
  // Reports and disputes are readable by players of the match and admins only.
  const canSeeResult = (isPlayer || isAdmin) && !!match.reportedByUid;
  const reports = useReports(match.id, canSeeResult);
  const disputes = useDisputes(match.id, canSeeResult && !!match.disputed);
  const report = reports.data.find((r) => r.uid === match.reportedByUid) ?? reports.data[0];
  const winnerTag = match.players.find((p) => p.uid === match.winnerUid)?.gamerTag;

  const [busy, setBusy] = useState<null | 'start' | 'cancel' | 'leave' | 'join'>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<unknown>, ok?: string) {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ kind: 'success', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: matchError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      <View style={styles.titleRow}>
        <Text style={[styles.game, { color }]}>{match.gameName}</Text>
        <StatusPill status={match.status} />
      </View>
      {match.title && <Text style={styles.title}>{match.title}</Text>}

      <Card style={styles.card}>
        <Text style={styles.format}>{game?.format}</Text>
        <Text style={styles.body}>{game?.rules}</Text>
      </Card>

      {match.status === 'cancelled' ? (
        <FormMessage
          kind="error"
          text={
            match.cancelReason === 'expired'
              ? 'This match was cancelled: it didn’t fill up within 15 minutes. No credits were used.'
              : match.cancelReason === 'admin_refund'
                ? `A Betterplayer admin cancelled this match. Every player got their ${ENTRY_CREDITS} credits back.`
                : 'The host cancelled this match. No credits were used.'
          }
        />
      ) : (
        <Card>
          <StatusStepper status={match.status} />
        </Card>
      )}

      {match.status === 'completed' && (
        <Card style={[styles.card, styles.winnerCard]}>
          <Text style={styles.label}>Winner</Text>
          <Text style={styles.winner}>{winnerTag ?? '—'}</Text>
          <Text style={styles.body}>
            {match.decidedBy === 'vision'
              ? 'Approved automatically after the photo check.'
              : 'Checked by a Betterplayer admin.'}{' '}
            {winnerTag} got {formatCredits(match.winnerGets)}{' '}
            credits.{match.winnerUid === uid ? ' Well played!' : ''}
          </Text>
        </Card>
      )}

      {match.status === 'started' && isPlayer && (
        <>
          <Text style={styles.small}>
            The match has started and {ENTRY_CREDITS} credits are locked from each player. Play your
            game, then report the result here.
          </Text>
          <ReportResultForm match={match} uid={uid} />
        </>
      )}

      {match.status === 'under_review' && (
        <FormMessage
          kind="success"
          text={
            match.disputed
              ? 'The result was disputed. A Betterplayer admin is checking it and will decide.'
              : 'Result confirmed. The automatic check couldn’t approve it, so a Betterplayer admin is checking it before any credits move.'
          }
        />
      )}

      {canSeeResult && report && (
        <>
          <SectionTitle>Result</SectionTitle>
          <ReportView
            report={report}
            disputes={match.disputed ? disputes.data : []}
            players={match.players}
          />
        </>
      )}

      {match.status === 'awaiting_result' && isPlayer && <RespondPanel match={match} uid={uid} />}

      <SectionTitle>
        Players {match.players.length}/{match.maxPlayers}
      </SectionTitle>
      <Card style={styles.list}>
        {match.players.map((p, i) => (
          <View key={p.uid} style={[styles.player, i > 0 && styles.divider]}>
            <View style={styles.playerText}>
              <Text style={styles.playerName}>
                {p.gamerTag}
                {p.uid === uid ? ' (you)' : ''}
              </Text>
              <Text style={styles.playerId}>
                {game?.gameIdLabel}: {p.gameId}
              </Text>
            </View>
            {p.uid === match.hostUid && <Text style={styles.hostBadge}>HOST</Text>}
          </View>
        ))}
        {beforeStart &&
          Array.from({ length: match.maxPlayers - match.players.length }, (_, i) => (
            <View key={`seat-${i}`} style={[styles.player, styles.divider]}>
              <Text style={styles.waiting}>Waiting for a player…</Text>
            </View>
          ))}
      </Card>

      {beforeStart && (
        <ShareCode
          code={match.code}
          expiresAt={match.status === 'open' ? match.expiresAt?.toMillis() : undefined}
        />
      )}
      {['open', 'full', 'started'].includes(match.status) && (
        <LobbyCode match={match} isHost={isHost} isPlayer={isPlayer} />
      )}

      <SectionTitle>Credits</SectionTitle>
      <Card>
        <MoneySummary players={match.maxPlayers} />
      </Card>

      {message && <FormMessage kind={message.kind} text={message.text} />}

      {isHost && beforeStart && (
        <View style={styles.actions}>
          <Button
            label="Start match"
            onPress={() => run('start', () => startMatch(match.id))}
            loading={busy === 'start'}
            disabled={match.status !== 'full' || !!busy}
          />
          <Text style={styles.small}>
            {match.status === 'full'
              ? `Starting locks ${ENTRY_CREDITS} credits from every player.`
              : 'You can start once every seat is filled.'}
          </Text>
          <Button
            label="Cancel match"
            variant="outline"
            onPress={() => run('cancel', () => cancelMatch(match.id))}
            loading={busy === 'cancel'}
            disabled={!!busy}
          />
        </View>
      )}

      {!isHost && isPlayer && beforeStart && (
        <Button
          label="Leave match"
          variant="outline"
          onPress={() => run('leave', () => leaveMatch(match.id))}
          loading={busy === 'leave'}
        />
      )}

      {!isPlayer && match.status === 'open' && (
        <Button
          label="Join match"
          variant="success"
          onPress={() => run('join', () => joinMatch({ matchId: match.id }))}
          loading={busy === 'join'}
        />
      )}
    </Screen>
  );
}

function ShareCode({ code, expiresAt }: { code: string; expiresAt?: number }) {
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  async function copy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutesLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 60_000)) : null;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>Share code</Text>
      <View style={styles.codeRow}>
        <Text style={styles.code} selectable>
          {code}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy share code"
          onPress={copy}
          style={({ pressed }) => [styles.copy, pressed && { opacity: 0.8 }]}>
          <Text style={styles.copyText}>{copied ? 'Copied!' : 'Copy'}</Text>
        </Pressable>
      </View>
      <Text style={styles.small}>
        Send this code to your rival. They can type it in Matches → Join with code.
        {minutesLeft !== null && ` This match closes in ${minutesLeft} min if it doesn’t fill up.`}
      </Text>
    </Card>
  );
}

function LobbyCode({
  match,
  isHost,
  isPlayer,
}: {
  match: Match;
  isHost: boolean;
  isPlayer: boolean;
}) {
  const [value, setValue] = useState(match.lobbyCode ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (!editing) setValue(match.lobbyCode ?? '');
  }, [match.lobbyCode, editing]);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await setLobbyCode(match.id, value);
      setEditing(false);
      setMessage({ kind: 'success', text: 'Lobby code saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: matchError(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!isPlayer) return null;
  const canEdit = isHost && ['open', 'full', 'started'].includes(match.status);

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>In-game lobby code</Text>
      {canEdit && (editing || !match.lobbyCode) ? (
        <>
          <TextField
            label="Code from your game’s private lobby"
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setEditing(true);
            }}
            placeholder="Paste or type it here"
            maxLength={LOBBY_CODE_MAX}
          />
          <Button label="Save lobby code" onPress={save} loading={busy} />
        </>
      ) : (
        <View style={styles.codeRow}>
          <Text style={match.lobbyCode ? styles.code : styles.waiting} selectable>
            {match.lobbyCode ?? 'The host hasn’t added it yet.'}
          </Text>
          {canEdit && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(true)}
              style={styles.copy}>
              <Text style={styles.copyText}>Edit</Text>
            </Pressable>
          )}
        </View>
      )}
      {message && <FormMessage kind={message.kind} text={message.text} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  game: {
    fontFamily: fonts.heading,
    fontSize: 32,
    flexShrink: 1,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    color: colors.text,
    marginTop: -8,
  },
  card: {
    gap: 8,
  },
  format: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.accent,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  list: {
    paddingVertical: 4,
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  playerText: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  playerId: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  hostBadge: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  waiting: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    flex: 1,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.textMuted,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  code: {
    fontFamily: fonts.heading,
    fontSize: 30,
    letterSpacing: 3,
    color: colors.text,
    flexShrink: 1,
  },
  copy: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  copyText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accent,
  },
  actions: {
    gap: 10,
  },
  winnerCard: {
    borderColor: colors.success,
  },
  winner: {
    fontFamily: fonts.heading,
    fontSize: 30,
    color: colors.success,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
});
