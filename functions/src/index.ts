import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/firestore';
import { setGlobalOptions } from 'firebase-functions/options';

import { grantStarterCredits } from './starterGrant';

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

initializeApp();

// When a player's profile (users/{uid}) is created, give them their starter
// credits. Safe to retry: the grant happens at most once per player.
export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', retry: true },
  async (event) => {
    const { uid } = event.params;
    const granted = await grantStarterCredits(getFirestore(), uid);
    logger.info(granted ? 'Starter credits granted' : 'Starter credits already granted', { uid });
  },
);
