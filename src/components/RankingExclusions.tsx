import { collection, limit, onSnapshot, orderBy, query, type Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { setRankingExclusion } from '@/badges/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { colors, fonts } from '@/constants/theme';
import { db } from '@/firebase';
import { matchError } from '@/matches/api';

type Exclusion = { uid: string; gamerTag: string; reason: string; at?: Timestamp };

// Admin tab: admin and test accounts left out of leaderboards, crowns, tiers
// and Founder numbers. They still play and settle matches normally.
export function RankingExclusions() {
  const [list, setList] = useState<Exclusion[] | null>(null);
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'rankingExclusions'), orderBy('at', 'desc'), limit(50)),
        (snap) => setList(snap.docs.map((d) => d.data() as Exclusion)),
        () => setMessage({ kind: 'error', text: 'Couldn’t load the list.' }),
      ),
    [],
  );

  async function run(key: string, input: { gamerTag: string } | { uid: string }, exclude: boolean) {
    setBusy(key);
    setMessage(null);
    try {
      const r = await setRankingExclusion({ ...input, exclude });
      setMessage({ kind: 'ok', text: `${r.gamerTag} is now ${exclude ? 'left out of' : 'back in'} rankings.` });
      if (exclude) setTag('');
    } catch (e) {
      setMessage({ kind: 'error', text: matchError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Gamer tag" value={tag} onChangeText={setTag} placeholder="e.g. GOD" />
        </View>
        <Button
          label="Exclude"
          variant="danger"
          size="small"
          style={styles.button}
          disabled={!tag.trim()}
          loading={busy === 'add'}
          onPress={() => run('add', { gamerTag: tag.trim() }, true)}
        />
      </View>
      {message && <Text style={[styles.message, message.kind === 'error' && { color: colors.error }]}>{message.text}</Text>}
      {list === null ? null : list.length === 0 ? (
        <Text style={styles.muted}>Nobody is excluded.</Text>
      ) : (
        list.map((x) => (
          <View key={x.uid} style={styles.item}>
            <View style={styles.flex}>
              <Text style={styles.tag}>{x.gamerTag}</Text>
              <Text style={styles.muted}>{x.reason}</Text>
            </View>
            <Button
              label="Include again"
              variant="outline"
              size="small"
              loading={busy === x.uid}
              onPress={() => run(x.uid, { uid: x.uid }, false)}
            />
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  button: {
    marginBottom: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  tag: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.success,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
});
