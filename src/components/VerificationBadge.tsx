import { StyleSheet, Text, View } from 'react-native';

import type { MatchReview } from '@/admin/hooks';
import { colors, fonts, glow, withAlpha } from '@/constants/theme';

const look = {
  match: { label: 'MATCH', color: colors.success },
  mismatch: { label: 'MISMATCH', color: colors.error },
  unreadable: { label: 'UNREADABLE', color: colors.awaiting },
} as const;

// Admins: the automatic check's verdict on the result photo, what was changed
// after the photo was read, and why the match came to an admin. Everything
// comes from matchReview/{id} (admins only); older matches kept the verdict
// on the match itself (`legacy`).
export function VerificationBadge({ review, legacy }: { review: MatchReview | null; legacy?: MatchReview }) {
  const r = review ?? legacy ?? null;
  const verification = r?.verification;
  const base = verification ? look[verification.status] : null;
  const v = base;
  const why = (r?.reasonLabels ?? []).join(' · ');
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Text style={styles.title}>Automatic check</Text>
        {v ? (
          <Text
            style={[
              styles.badge,
              {
                color: v.color,
                borderColor: v.color,
                backgroundColor: withAlpha(v.color, 0.08),
                boxShadow: glow.badge(v.color),
              },
            ]}>
            {v.label} · {Math.round((verification!.confidence ?? 0) * 100)}%
          </Text>
        ) : (
          <Text style={[styles.badge, styles.none]}>NOT CHECKED</Text>
        )}
      </View>
      {verification?.reason ? <Text style={styles.text}>{verification.reason}</Text> : null}
      {verification?.similarTo ? (
        <Text style={[styles.text, { color: colors.awaiting }]}>The photo looks like an earlier result photo.</Text>
      ) : null}
      {r?.manual ? <Text style={[styles.text, { color: colors.awaiting }]}>Entered by hand: the photo couldn’t be read.</Text> : null}
      {(r?.editLabels ?? []).map((e) => (
        <Text key={e} style={[styles.text, { color: colors.awaiting }]}>
          Changed after the photo check: {e}
        </Text>
      ))}
      {why ? <Text style={styles.why}>Needs review: {why}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  badge: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  none: {
    color: colors.textMuted,
    borderColor: colors.textMuted,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  why: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
});
