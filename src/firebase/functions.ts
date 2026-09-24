import { getFunctions } from 'firebase/functions';

import { app } from './app';

// Callable Cloud Functions live in europe-west1 (see functions/src/index.ts).
export const functions = getFunctions(app, 'europe-west1');
