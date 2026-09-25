import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { CreateTabButton } from '@/components/CreateTabButton';
import { colors, fonts, glow } from '@/constants/theme';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={24} />;
}

// Tab label; the active tab also gets a small glowing cyan dot under it.
function TabLabel({
  focused,
  color,
  children,
}: {
  focused: boolean;
  color: ColorValue;
  children: string;
}) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {children}
      </Text>
      <View style={[styles.dot, focused && styles.dotOn]} />
    </View>
  );
}

const styles = StyleSheet.create({
  labelWrap: {
    alignItems: 'center',
    gap: 3,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotOn: {
    backgroundColor: colors.primary,
    boxShadow: glow.badge(colors.primary),
  },
});

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { isAdmin } = useAuth();

  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.chrome,
          borderTopColor: colors.border,
          // Taller than the default: room for the label and the active dot.
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
        },
        tabBarLabel: ({ focused, color, children }) => (
          <TabLabel focused={focused} color={color}>
            {children}
          </TabLabel>
        ),
        sceneStyle: { backgroundColor: colors.background },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: 'house.fill', android: 'home', web: 'home' }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{
                ios: 'gamecontroller.fill',
                android: 'sports_esports',
                web: 'sports_esports',
              }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarButton: (props) => <CreateTabButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{
                ios: 'wallet.pass.fill',
                android: 'account_balance_wallet',
                web: 'account_balance_wallet',
              }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'person.crop.circle.fill', android: 'person', web: 'person' }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          // Only admins (admins/{uid} exists) see this tab.
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: 'checkmark.shield.fill', android: 'shield', web: 'shield' }}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
