// iOS/Android: store the session in AsyncStorage so users stay signed in
// after closing the app.
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';

import { app } from './app';

function createAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } catch {
    // Already initialized (e.g. after a fast refresh).
    return getAuth(app);
  }
}

export const auth = createAuth();
