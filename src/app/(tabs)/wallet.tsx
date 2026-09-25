import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ENTRY_CREDITS, percent } from '@shared/games';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { FormMessage } from '@/components/FormMessage';
import { Screen, SectionTitle } from '@/components/Screen';
import { StatCard } from '@/components/StatCard';
import { colors, fonts } from '@/constants/theme';
import { useFeeRate } from '@/matches/useFeeRate';
import { formatCredits, formatDate, historyAmount, isLock, ledgerLabel } from '@/wallet/format';
import { useLedger, useWallet, type LedgerEntry } from '@/wallet/useWallet';

export default function WalletScreen() {
  const wallet = useWallet();
  const ledger = useLedger();
  const feeRate = useFeeRate();

  return (
    <Screen>
      <SectionTitle>Your credits</SectionTitle>
      <View style={styles.row}>
        <StatCard
          label="Available credits"
          value={wallet.loading ? '…' : formatCredits(wallet.data.available)}
          color={colors.primary}
          glow
          big
        />
        <StatCard
          label="Locked credits"
          value={wallet.loading ? '…' : formatCredits(wallet.data.locked)}
          color={colors.awaiting}
        />
      </View>
      <Text style={styles.note}>
        Beta Credits have no cash value. Locked credits are held for matches in progress.
        Each player enters {ENTRY_CREDITS} credits; Betterplayer keeps {percent(feeRate)} of the
        pot and the winner gets {percent(1 - feeRate)} (shared equally on a tie).
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
        <View style={styles.list}>
          {ledger.data.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </View>
      )}
    </Screen>
  );
}

// Each ledger line is its own card: wins in green, entries and fees muted.
function HistoryRow({ entry }: { entry: LedgerEntry }) {
  const lock = isLock(entry.type);
  const label = ledgerLabel(entry.type, entry.description);
  const amount = historyAmount(entry.type, entry.amount);
  // Descriptions look like "Winnings: EA FC match"; show the part after the label.
  const rest = entry.description.split(': ').slice(1).join(': ');
  const detail = lock
    ? 'Moved from available to locked until the result is confirmed'
    : entry.description && entry.description !== label
      ? rest || entry.description
      : null;

  return (
    <Card style={styles.item}>
      <View style={styles.itemText}>
        <Text style={styles.itemLabel}>{label}</Text>
        {detail && <Text style={styles.itemDetail}>{detail}</Text>}
        <Text style={styles.itemDate}>
          {entry.createdAt ? formatDate(entry.createdAt.toDate()) : 'Just now'}
        </Text>
      </View>
      <Text
        style={[
          styles.amount,
          lock && styles.lockAmount,
          {
            color:
              amount.tone === 'gain' ? colors.success : colors.textMuted,
          },
        ]}>
        {amount.text}
      </Text>
    </Card>
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
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
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
  lockAmount: {
    fontSize: 16,
  },
});
