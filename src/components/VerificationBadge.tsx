import { StyleSheet, Text, View } from 'react-native';

import { REVIEW_REASON_LABELS, type ReviewReason, type Verification } from '@shared/games';

import { colors, fonts, glow, withAlpha } from '@/constants/theme';

const look = {
  match: { label: 'MATCH', color: colors.success },
  mismatch: { label: 'MISMATCH', color: colors.error },
  unreadable: { label: 'UNREADABLE', color: colors.awaiting },
} as const;

// The automatic check's verdict on the result photo, with its confidence and
// reason, and why the match came to an admin.
export function VerificationBadge({
  verification,
  reasons,
}: {
  verification?: Verification | null;
  reasons?: ReviewReason[];
}) {
  const base = verification ? look[verification.status] : null;
  // A "match" below the confidence threshold shows amber (low confidence).
  const v =
    base && verification?.status === 'match' && reasons?.includes('low_confidence')
      ? { ...base, color: colors.awaiting }
      : base;
  const why = (reasons ?? []).map((r) => REVIEW_REASON_LABELS[r] ?? r).join(' · ');
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
        <Text style={[styles.text, { color: colors.awaiting }]}>
          The photo looks like an earlier result photo.
        </Text>
      ) : null}
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
