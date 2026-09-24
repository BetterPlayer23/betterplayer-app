import { Tabs } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { CreateTabButton } from '@/components/CreateTabButton';
import { colors, fonts } from '@/constants/theme';

function TabIcon({ name, color }: { name: SymbolViewProps['name']; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={24} />;
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // A little taller than the default so the labels are not cut off.
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
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
              name={{ ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' }}
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
    </Tabs>
  );
}
