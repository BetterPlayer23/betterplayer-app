import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { BADGE_LABEL, bestTier, currentTiers, seasonLabel, seasonOf } from '@shared/badges';

import { useBadges, useUnreadCount } from '@/badges/hooks';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { MIN_TOUCH, colors, fonts, glow, radius, withAlpha } from '@/constants/theme';

// Home: the way into the leaderboards (no tab), your best tier this season,
// and your unread notifications.
export function LeaderboardCard({ uid }: { uid: string }) {
  const { data } = useBadges(uid);
  const unread = useUnreadCount(uid);
  const season = seasonOf(new Date());
  const tier = bestTier(currentTiers(data ?? undefined, season));
  const kind = tier ?? (data?.founder ? 'founder' : null);

  return (
    <Card style={[styles.card, { borderColor: withAlpha(colors.secondary, 0.35) }]}>
      <View style={styles.top}>
        {kind ? <Badge kind={kind} size="medium" text={kind === 'founder' ? '#' + data?.founder?.number : undefined} /> : null}
        <View style={styles.text}>
          <Text style={styles.title}>Leaderboards</Text>
          <Text style={styles.sub}>
            {seasonLabel(season)} ·{' '}
            {tier ? `your best: ${BADGE_LABEL[tier]}` : 'play checked matches to get ranked'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          onPress={() => router.push('/notifications')}
          style={styles.bell}>
          <Svg width={22} height={22} viewBox="0 0 24 24">
            <Path
              d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM9.5 19a2.5 2.5 0 0 0 5 0"
              fill="none"
              stroke={unread ? colors.primary : colors.textSecondary}
              strokeWidth={1.8}
              strokeLinejoin="round"
            />
          </Svg>
          {unread > 0 && (
            <View style={styles.dot}>
              <Text style={styles.dotText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>
      <Button label="See leaderboards" variant="secondary" onPress={() => router.push('/leaderboard')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  bell: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.buttonSmall,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: glow.badge(colors.primary),
  },
  dotText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.onPrimary,
  },
});
