import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/constants/theme';

// Scrollable page body with consistent padding.
export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  section: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
    marginTop: 8,
  },
});
