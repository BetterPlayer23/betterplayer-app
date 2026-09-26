import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';
import { Badge } from '@/components/Badge';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Screen, SectionTitle } from '@/components/Screen';
import { colors, fonts, withAlpha } from '@/constants/theme';
import { markRead, useNotifications, type Notification } from '@/badges/hooks';

// Messages about badges: a tier or crown someone took from you, a season
// trophy, your Founder number. Opening this screen marks them as read.
export default function NotificationsScreen() {
  const { user } = useAuth();
  const { data, loading, error } = useNotifications(user?.uid);

  const unread = data.filter((n) => !n.read).map((n) => n.id);
  const unreadKey = unread.join(',');
  useEffect(() => {
    if (!user || !unreadKey) return;
    // Leave them highlighted for a moment, then mark them read.
    const id = setTimeout(() => markRead(user.uid, unreadKey.split(',')).catch(() => {}), 1500);
    return () => clearTimeout(id);
  }, [user, unreadKey]);

  return (
    <Screen>
      <SectionTitle>Notifications</SectionTitle>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loading} />
      ) : error ? (
        <EmptyState title="Notifications unavailable" message="Check your connection and try again." />
      ) : data.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          message="You’ll hear here when someone takes your rank or crown, and when you earn a trophy."
        />
      ) : (
        data.map((n) => <Item key={n.id} n={n} />)
      )}
    </Screen>
  );
}

function Item({ n }: { n: Notification }) {
  const kind =
    n.type === 'founder'
      ? 'founder'
      : n.type.startsWith('crown')
        ? 'crown'
        : n.type === 'trophy'
          ? 'prism'
          : ['warning', 'rejected', 'disqualified'].includes(n.type)
            ? 'carbon'
            : 'gold';
  const when = n.createdAt?.toDate().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return (
    <Card style={[styles.item, !n.read && styles.unread]}>
      <Badge kind={kind} size={40} animate={false} />
      <View style={styles.body}>
        <Text style={styles.text}>{n.text}</Text>
        {when && <Text style={styles.when}>{when}</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginVertical: 24,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  unread: {
    borderColor: withAlpha(colors.primary, 0.45),
    backgroundColor: withAlpha(colors.primary, 0.05),
  },
  body: {
    flex: 1,
    gap: 4,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  when: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
});
