import { getStorage } from 'firebase/storage';

import { app } from './app';

// Result screenshots (results/{matchId}/{uid}/{fileName}, see storage.rules).
export const storage = getStorage(app);
