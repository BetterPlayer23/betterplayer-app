import {
  ChakraPetch_400Regular,
  ChakraPetch_500Medium,
  ChakraPetch_600SemiBold,
  ChakraPetch_700Bold,
} from '@expo-google-fonts/chakra-petch';
import { Exo2_800ExtraBold_Italic } from '@expo-google-fonts/exo-2';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider, router, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { AppHeader } from '@/components/AppHeader';
import { Button } from '@/components/Button';
import { colors, fonts } from '@/constants/theme';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Keep the splash screen visible until the fonts are loaded.
SplashScreen.preventAutoHideAsync();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.chrome,
    text: colors.text,
    border: colors.border,
    notification: colors.error,
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Exo2_800ExtraBold_Italic,
    ChakraPetch_400Regular,
    ChakraPetch_500Medium,
    ChakraPetch_600SemiBold,
    ChakraPetch_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Decides which screens exist: the tabs only when signed in,
// Sign up / Log in only when signed out.
function RootNavigator() {
  const { status, retry, logOut } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>We couldn’t load your profile</Text>
        <Text style={styles.errorText}>Check your internet connection and try again.</Text>
        <View style={styles.errorButtons}>
          <Button label="Try again" onPress={retry} />
          <Button label="Log out" variant="outline" onPress={logOut} />
        </View>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={status === 'signedIn'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="match"
          options={{
            headerShown: true,
            header: ({ navigation }) => (
              <AppHeader
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : router.replace('/'))}
              />
            ),
          }}
        />
        <Stack.Screen
          name="stats"
          options={{
            headerShown: true,
            header: ({ navigation }) => (
              <AppHeader
                onBack={() => (navigation.canGoBack() ? navigation.goBack() : router.replace('/'))}
              />
            ),
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsProfile'}>
        <Stack.Screen
          name="complete-profile"
          options={{ headerShown: true, header: () => <AppHeader /> }}
        />
      </Stack.Protected>
      <Stack.Protected guard={status === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === 'needsRules'}>
        <Stack.Screen
          name="accept-rules"
          options={{ headerShown: true, header: () => <AppHeader /> }}
        />
      </Stack.Protected>
      {/* Readable by everyone: from Profile and from the Sign up screen. */}
      <Stack.Screen
        name="beta-rules"
        options={{
          headerShown: true,
          header: ({ navigation }) => (
            <AppHeader
              onBack={() => (navigation.canGoBack() ? navigation.goBack() : router.replace('/'))}
            />
          ),
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.text,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorButtons: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 8,
  },
});
