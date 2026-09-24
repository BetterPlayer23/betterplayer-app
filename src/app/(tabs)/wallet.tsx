import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { colors, fonts } from '@/constants/theme';
import {
  formatCredits,
  formatDate,
  formatSignedCredits,
  ledgerLabel,
} from '@/wallet/format';
import { useLedger, useWallet, type LedgerEntry } from '@/wallet/useWallet';

export default function WalletScreen() {
  const wallet = useWallet();
  const ledger = useLedger();

  return (
    <Screen>
      <SectionTitle>Your credits</SectionTitle>
      <View style={styles.row}>
        <StatCard
          label="Available credits"
          value={wallet.loading ? '…' : formatCredits(wallet.data.available)}
          color={colors.accent}
        />
        <StatCard
          label="Locked credits"
          value={wallet.loading ? '…' : formatCredits(wallet.data.locked)}
        />
      </View>
      <Text style={styles.note}>
        Beta Credits have no cash value. Locked credits are held for matches in progress.
      </Text>
      {wallet.error && <FormMessage kind="error" text={wallet.error} />}

      <SectionTitle>History</SectionTitle>
      {ledger.error ? (
        <FormMessage kind="error" text={ledger.error} />
      ) : ledger.loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : ledger.data.length === 0 ? (
        <EmptyState
          title="No credit activity yet"
          message="Your 10 starter credits will appear here a few seconds after you join."
        />
      ) : (
        <Card style={styles.list}>
          {ledger.data.map((entry, i) => (
            <HistoryRow key={entry.id} entry={entry} first={i === 0} />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function HistoryRow({ entry, first }: { entry: LedgerEntry; first: boolean }) {
  const positive = entry.amount > 0;
  const label = ledgerLabel(entry.type, entry.description);
  // Skip the description when it would just repeat the label.
  const detail = entry.description && entry.description !== label ? entry.description : null;

  return (
    <View style={[styles.item, !first && styles.itemBorder]}>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel}>{label}</Text>
        {detail && <Text style={styles.itemDetail}>{detail}</Text>}
        <Text style={styles.itemDate}>
          {entry.createdAt ? formatDate(entry.createdAt.toDate()) : 'Just now'}
        </Text>
      </View>
      <Text style={[styles.amount, { color: positive ? colors.success : colors.text }]}>
        {formatSignedCredits(entry.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  loading: {
    marginVertical: 24,
  },
  list: {
    paddingVertical: 4,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  itemBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
    color: colors.text,
  },
  itemDetail: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
  },
  itemDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  amount: {
    fontFamily: fonts.heading,
    fontSize: 22,
  },
});
