import type { DocumentSnapshot } from 'firebase/firestore';

import type { Match } from './types';

// Shape of every live (onSnapshot) value in the app.
export type Live<T> = { data: T; loading: boolean; error: string | null };

export function toMatch(snap: DocumentSnapshot): Match {
  return { id: snap.id, ...(snap.data() as Omit<Match, 'id'>) };
}
