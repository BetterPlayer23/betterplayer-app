import { Stack } from 'expo-router';

import { AppHeader } from '@/components/AppHeader';
import { colors } from '@/constants/theme';

export const unstable_settings = {
  initialRouteName: 'sign-up',
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader />,
        contentStyle: { backgroundColor: colors.background },
        animation: 'fade',
      }}>
      <Stack.Screen name="sign-up" options={{ title: 'Create your account' }} />
      <Stack.Screen name="log-in" options={{ title: 'Log in' }} />
    </Stack>
  );
}
