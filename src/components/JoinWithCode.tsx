import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormMessage } from '@/components/FormMessage';
import { openMatchRoom } from '@/components/MatchCard';
import { TextField } from '@/components/TextField';
import { joinMatch, matchError } from '@/matches/api';

export function JoinWithCode() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const { matchId } = await joinMatch({ code: code.trim().toUpperCase() });
      setCode('');
      openMatchRoom(matchId);
    } catch (e) {
      setError(matchError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label="Join with code"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="K7PX2M"
            maxLength={6}
            autoCapitalize="characters"
            onSubmitEditing={join}
          />
        </View>
        <Button
          label="Join"
          variant="success"
          onPress={join}
          loading={busy}
          disabled={code.trim().length === 0}
          style={styles.button}
        />
      </View>
      {error && <FormMessage kind="error" text={error} />}
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
  field: {
    flex: 1,
  },
  button: {
    paddingHorizontal: 22,
  },
});
