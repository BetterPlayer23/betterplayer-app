import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  BADGE_LABEL,
  STAT_LABEL,
  currentTiers,
  seasonOf,
  tierValue,
  type StatId,
  type Tier,
} from '@shared/badges';

import { useBadges } from '@/badges/hooks';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { gameById } from '@/constants/games';
import { badgeColors, colors, fonts } from '@/constants/theme';

type Item = { key: string; kind: Parameters<typeof Badge>[0]['kind']; ribbon?: string; caption: string; sub?: string };

// Profile / stats page: Founder, crowns, the best tier this season per game,
// and season trophies. Badges are for fun: not transferable, no cash value.
export function BadgeShowcase({ uid, mine }: { uid: string; mine: boolean }) {
  const { data, loading } = useBadges(uid);
  const season = seasonOf(new Date());

  const items: Item[] = [];
  if (data?.founder) {
    items.push({
      key: 'founder',
      kind: 'founder',
      ribbon: `Founder #${data.founder.number}`,
      caption: `Founder #${data.founder.number}`,
      sub: 'One of the first 100 players',
    });
  }
  for (const [id, c] of Object.entries(data?.crowns ?? {})) {
    items.push({ key: `crown-${id}`, kind: 'crown', ribbon: 'Record', caption: c.label, sub: `Record: ${c.value}` });
  }
  // Best tier per game (a game has several boards: keep the highest).
  const best: Record<string, { tier: Tier; stat: StatId }> = {};
  for (const [key, tier] of Object.entries(currentTiers(data ?? undefined, season))) {
    const [game, stat] = key.split('.') as [string, StatId];
    if (!best[game] || tierValue(tier) > tierValue(best[game].tier)) best[game] = { tier, stat };
  }
  for (const [game, { tier, stat }] of Object.entries(best)) {
    items.push({
      key: `tier-${game}`,
      kind: tier,
      caption: gameById(game)?.name ?? game,
      sub: `${BADGE_LABEL[tier]} · ${STAT_LABEL[stat]}`,
    });
  }
  const trophies = data?.trophies ?? [];

  return (
    <Card style={styles.card}>
      {loading ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : items.length === 0 && trophies.length === 0 ? (
        <Text style={styles.muted}>
          {mine
            ? 'No badges yet. Play checked matches this season to climb the leaderboards.'
            : 'No badges yet.'}
        </Text>
      ) : (
        <View style={styles.grid}>
          {items.map((it) => (
            <View key={it.key} style={styles.cell}>
              <Badge kind={it.kind} text={it.ribbon} size="large" />
              <Text style={[styles.caption, { color: badgeColors[it.kind].color }]} numberOfLines={2}>
                {it.caption}
              </Text>
              {it.sub && <Text style={styles.sub}>{it.sub}</Text>}
            </View>
          ))}
        </View>
      )}
      {trophies.length > 0 && (
        <View style={styles.trophies}>
          <Text style={styles.heading}>Season trophies</Text>
          {trophies.map((t) => (
            <View key={t.label} style={styles.trophy}>
              <Badge kind="prism" size="small" animate={false} />
              <Text style={styles.trophyText}>{t.label}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.note}>Badges, ranks and trophies are just for fun: not transferable, no cash value.</Text>
      {mine && <Button label="Leaderboards" variant="outline" onPress={() => router.push('/leaderboard')} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 16,
  },
  cell: {
    width: '50%',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  caption: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  trophies: {
    gap: 8,
  },
  heading: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  trophy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trophyText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
  },
});
