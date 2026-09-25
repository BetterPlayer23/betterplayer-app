import { StyleSheet, Text, View } from 'react-native';

import { BETA_RULES, BETA_RULES_TITLE } from '@shared/betaRules';

import { Card } from '@/components/Card';
import { colors, fonts } from '@/constants/theme';

// The beta rules & privacy text (functions/src/shared/betaRules.ts).
export function BetaRulesText() {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{BETA_RULES_TITLE}</Text>
      {BETA_RULES.map((rule, i) => (
        <View key={rule.title} style={styles.item}>
          <Text style={styles.heading}>
            {i + 1}. {rule.title}
          </Text>
          <Text style={styles.text} selectable>
            {rule.text}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
  },
  item: {
    gap: 4,
  },
  heading: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.accent,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
  },
});
