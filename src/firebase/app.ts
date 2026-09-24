import { getApp, getApps, initializeApp } from 'firebase/app';

import { firebaseConfig } from './config';

// Reuse the existing app on fast refresh instead of initializing twice.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
