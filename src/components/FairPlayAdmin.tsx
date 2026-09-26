import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ADMIN_NOTE_MAX, ADMIN_NOTE_MIN } from '@shared/games';
import { STAT_LABEL, type StatId } from '@shared/badges';

import {
  getAntiCheatSettings,
  integrityAction,
  setAntiCheatSettings,
  useAuditLog,
  useOpenItems,
  type AdminItem,
  type IntegrityAction,
} from '@/admin/hooks';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { SectionTitle } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { colors, fonts, withAlpha } from '@/constants/theme';
import { matchError } from '@/matches/api';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const when = (i: AdminItem) => i.createdAt?.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) ?? '';

// One item with a required note and its action buttons.
function ActionCard({
  children,
  color,
  actions,
  target,
}: {
  children: React.ReactNode;
  color: string;
  actions: { label: string; action: IntegrityAction; variant?: 'primary' | 'outline' | 'danger' | 'success' }[];
  target: Omit<Parameters<typeof integrityAction>[0], 'action' | 'note'>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<IntegrityAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function run(action: IntegrityAction) {
    setError(null);
    if (note.trim().length < ADMIN_NOTE_MIN) return setError(`Add a note (at least ${ADMIN_NOTE_MIN} characters).`);
    setBusy(action);
    try {
      await integrityAction({ ...target, action, note: note.trim() });
      // The item leaves the list by itself.
    } catch (e) {
      setError(matchError(e));
      setBusy(null);
    }
  }
  return (
    <Card style={[styles.card, { borderColor: withAlpha(color, 0.4) }]}>
      {children}
      <TextField
        label="Note (required)"
        value={note}
        onChangeText={setNote}
        maxLength={ADMIN_NOTE_MAX}
        multiline
        autoCapitalize="sentences"
        autoCorrect
        placeholder="What you checked and why"
      />
      {error && <FormMessage kind="error" text={error} />}
      <View style={styles.actions}>
        {actions.map((a) => (
          <Button
            key={a.action}
            label={a.label}
            size="small"
            variant={a.variant ?? 'outline'}
            style={styles.action}
            loading={busy === a.action}
            disabled={!!busy}
            onPress={() => run(a.action)}
          />
        ))}
      </View>
    </Card>
  );
}

function List({ state, empty, render }: { state: ReturnType<typeof useOpenItems>; empty: string; render: (i: AdminItem) => React.ReactNode }) {
  if (state.error) return <FormMessage kind="error" text="Couldn’t load this list." />;
  if (state.loading) return null;
  if (!state.data.length) return <EmptyState title="Nothing here" message={empty} />;
  return <>{state.data.map(render)}</>;
}

export function SpotChecks() {
  const state = useOpenItems('spotChecks', 'open');
  return (
    <List
      state={state}
      empty="A random share of settled matches shows up here, even when everything looks fine."
      render={(i) => (
        <ActionCard
          key={i.id}
          color={colors.primary}
          target={{ spotId: i.id }}
          actions={[
            { label: 'Looks OK', action: 'spot_ok', variant: 'success' },
            { label: 'Reject (fake)', action: 'reject', variant: 'danger' },
          ]}>
          <Text style={styles.title}>
            {str(i.gameName)} · {((i.players as { gamerTag: string }[]) ?? []).map((p) => p.gamerTag).join(' vs ')}
          </Text>
          <Text style={styles.meta}>
            {i.decidedBy === 'vision' ? 'Approved automatically' : 'Decided by an admin'} · {when(i)}
          </Text>
          <Button label="Open match" variant="outline" size="small" onPress={() => router.push({ pathname: '/match', params: { id: i.id } })} />
          <Text style={styles.small}>Reject takes the result off the leaderboards and counts as a proven fake for the reporter.</Text>
        </ActionCard>
      )}
    />
  );
}

export function HeldResults() {
  const state = useOpenItems('heldResults', 'held');
  return (
    <List
      state={state}
      empty="Results above a limit wait here before they count on the leaderboards. Credits are already paid."
      render={(i) => {
        const c = (i.contribution ?? {}) as Record<string, number>;
        return (
          <ActionCard
            key={i.id}
            color={colors.awaiting}
            target={{ heldId: i.id }}
            actions={[
              { label: 'Release', action: 'release', variant: 'success' },
              { label: 'Reject (fake)', action: 'reject', variant: 'danger' },
            ]}>
            <Text style={styles.title}>
              {str(i.gamerTag)} · {str(i.gameName)}
            </Text>
            {((i.reasons as string[]) ?? []).map((r) => (
              <Text key={r} style={[styles.meta, { color: colors.awaiting }]}>
                • {r}
              </Text>
            ))}
            <Text style={styles.meta}>
              {c.elims ?? 0} eliminations · {c.damage ?? 0} damage · {when(i)}
            </Text>
            <Button
              label="Open match"
              variant="outline"
              size="small"
              onPress={() => router.push({ pathname: '/match', params: { id: str(i.matchId) } })}
            />
          </ActionCard>
        );
      }}
    />
  );
}

export function PlayerReports() {
  const state = useOpenItems('playerReports', 'open');
  return (
    <List
      state={state}
      empty="Reports players send from leaderboard rows show up here."
      render={(i) => (
        <ActionCard
          key={i.id}
          color={colors.secondary}
          target={{ reportId: i.id }}
          actions={[
            { label: 'Dismiss', action: 'dismiss' },
            { label: 'Warn', action: 'warn' },
            { label: 'Disqualify', action: 'disqualify', variant: 'danger' },
            { label: 'Deactivate', action: 'deactivate', variant: 'danger' },
          ]}>
          <Text style={styles.title}>
            {str(i.targetTag)} · {str(i.gameName)} · {STAT_LABEL[i.stat as StatId] ?? str(i.stat)}
          </Text>
          <Text style={styles.meta}>
            Reported by {str(i.reporterTag)} · {when(i)}
          </Text>
          <Text style={styles.reason}>“{str(i.reason)}”</Text>
          <Button
            label="See their stats"
            variant="outline"
            size="small"
            onPress={() => router.push({ pathname: '/stats', params: { uid: str(i.targetUid) } })}
          />
          <Text style={styles.small}>
            Disqualify removes this season’s stats, badges and trophies in that game. Deactivate blocks the account.
          </Text>
        </ActionCard>
      )}
    />
  );
}

// The secret settings: read and changed through server functions, which also
// send the labels (the app's own code is public and holds none of this).
type Field = { key: string; label: string; value: number };

export function AntiCheatSettings() {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [values, setValues] = useState<Record<string, string> | null>(null);
  const show = (d: { fields?: Field[] }) => {
    setFields(d.fields ?? []);
    setValues(Object.fromEntries((d.fields ?? []).map((f) => [f.key, String(f.value)])));
  };
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      show(await getAntiCheatSettings());
    } catch (e) {
      setMsg({ kind: 'error', text: matchError(e) });
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!values) return;
    if (note.trim().length < ADMIN_NOTE_MIN) return setMsg({ kind: 'error', text: `Add a note (at least ${ADMIN_NOTE_MIN} characters).` });
    setBusy(true);
    setMsg(null);
    try {
      const settings = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v.replace(',', '.'))]));
      show(await setAntiCheatSettings({ settings, note: note.trim() }));
      setNote('');
      setMsg({ kind: 'success', text: 'Saved. The new settings apply from the next result.' });
    } catch (e) {
      setMsg({ kind: 'error', text: matchError(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card style={styles.card}>
      <Text style={styles.small}>
        Secret: never shown to players. The app’s code is public, so change the starting values once to your own.
      </Text>
      {values && fields ? (
        <>
          {fields.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={values[f.key]}
              onChangeText={(v) => setValues({ ...values, [f.key]: v })}
              keyboardType="decimal-pad"
            />
          ))}
          <TextField label="Note (required)" value={note} onChangeText={setNote} maxLength={ADMIN_NOTE_MAX} placeholder="Why you changed them" />
          <Button label="Save settings" onPress={save} loading={busy} />
        </>
      ) : (
        <Button label="Show settings" variant="outline" loading={busy} onPress={load} />
      )}
      {msg && <FormMessage kind={msg.kind} text={msg.text} />}
    </Card>
  );
}

export function AuditLog() {
  const items = useAuditLog(20);
  if (!items.length) return <EmptyState title="No actions yet" message="Every fair-play action is recorded here." />;
  return (
    <Card style={styles.card}>
      {items.map((i) => (
        <View key={i.id} style={styles.log}>
          <Text style={styles.logHead}>
            {str(i.action)} · {when(i)}
            {i.detail ? ` · ${str(i.detail)}` : ''}
          </Text>
          <Text style={styles.meta}>{str(i.note)}</Text>
        </View>
      ))}
    </Card>
  );
}

// All fair-play sections of the Admin tab.
export function FairPlayAdmin() {
  return (
    <>
      <SectionTitle>Held results</SectionTitle>
      <HeldResults />
      <SectionTitle>Spot checks</SectionTitle>
      <SpotChecks />
      <SectionTitle>Reports</SectionTitle>
      <PlayerReports />
      <SectionTitle>Check settings</SectionTitle>
      <AntiCheatSettings />
      <SectionTitle>Audit log</SectionTitle>
      <AuditLog />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  meta: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  small: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  reason: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  action: {
    flexGrow: 1,
  },
  setting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingKey: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  settingValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  log: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  logHead: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
});
