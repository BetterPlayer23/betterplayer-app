import { collection, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FLAG_REASON_LABEL, type FlagReason } from '@shared/badges';

import { dismissFlag } from '@/badges/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { colors, fonts, withAlpha } from '@/constants/theme';
import { db } from '@/firebase';
import { matchError } from '@/matches/api';

type Flag = {
  id: string;
  matchId: string;
  gameName: string;
  players: { uid: string; gamerTag: string }[];
  reasons: FlagReason[];
  counted: boolean;
  createdAt?: Timestamp;
};

// Admin tab: matches that look like leaderboard farming (the same two players
// again and again, the same winner every time, a huge EA FC margin). Flags
// never move credits; they are a hint for admins. "Dismiss" hides one.
export function FlagsList() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'flags'), where('dismissed', '==', false), orderBy('createdAt', 'desc'), limit(20)),
        (snap) => setFlags(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Flag, 'id'>) }))),
        () => setError('Couldn’t load the flags.'),
      ),
    [],
  );

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!flags) return null;
  if (flags.length === 0) {
    return <EmptyState title="Nothing suspicious" message="Leaderboard farming patterns will show here." />;
  }
  return (
    <>
      {flags.map((f) => (
        <FlagCard key={f.id} flag={f} />
      ))}
    </>
  );
}

function FlagCard({ flag }: { flag: Flag }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card style={[styles.card, { borderColor: withAlpha(colors.awaiting, 0.4) }]}>
      <Text style={styles.title}>
        {flag.gameName} · {flag.players.map((p) => p.gamerTag).join(' vs ')}
      </Text>
      {flag.reasons.map((r) => (
        <Text key={r} style={styles.reason}>
          • {FLAG_REASON_LABEL[r] ?? r}
        </Text>
      ))}
      <Text style={styles.meta}>
        {flag.counted ? 'Counted on the leaderboards.' : 'Not counted on the leaderboards.'}
        {flag.createdAt ? ` ${flag.createdAt.toDate().toLocaleString('en-GB')}` : ''}
      </Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.row}>
        <Button
          label="Open match"
          variant="outline"
          size="small"
          style={styles.flex}
          onPress={() => router.push({ pathname: '/match', params: { id: flag.matchId } })}
        />
        <Button
          label="Dismiss"
          variant="tint"
          color={colors.awaiting}
          size="small"
          style={styles.flex}
          loading={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await dismissFlag(flag.id);
            } catch (e) {
              setError(matchError(e));
              setBusy(false);
            }
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  reason: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.awaiting,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  flex: {
    flex: 1,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.error,
  },
});
