// firebase/auth ships getReactNativePersistence only in its React Native build,
// but its public type definitions leave it out. This declares it for TypeScript.
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
