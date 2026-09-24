import { getFirestore } from 'firebase/firestore';

import { app } from './app';

// Read-only from the app for credits, matches and disputes:
// those are written by Cloud Functions only (see CLAUDE.md).
export const db = getFirestore(app);
