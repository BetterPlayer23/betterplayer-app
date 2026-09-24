// Web: the default browser persistence (IndexedDB) keeps users signed in.
import { getAuth } from 'firebase/auth';

import { app } from './app';

export const auth = getAuth(app);
