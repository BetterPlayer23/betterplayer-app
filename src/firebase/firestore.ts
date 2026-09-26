import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { Platform } from 'react-native';

import { app } from './app';

// Read-only from the app for credits, matches and disputes:
// those are written by Cloud Functions only (see CLAUDE.md).
//
// On the web, keep a copy of what was read in the browser (IndexedDB): the
// app paints from it straight away and, on reopening, only downloads what
// changed instead of reading everything again. Not available in React Native.
function createDb() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    // Already initialized (e.g. after a fast refresh).
    return getFirestore(app);
  }
}

export const db = createDb();
