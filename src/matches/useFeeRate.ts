import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { DEFAULT_FEE_RATE, readFeeRate } from '@shared/games';

import { db } from '@/firebase';

// The current fee rate for new matches (Firestore config/fees.rate, set by
// hand; 10% when it isn't set). A match's own page uses the rate stored on
// that match instead (feeRateOf), so older matches keep their numbers.
export function useFeeRate(): number {
  const [rate, setRate] = useState(DEFAULT_FEE_RATE);
  useEffect(
    () =>
      onSnapshot(
        doc(db, 'config', 'fees'),
        (snap) => setRate(readFeeRate(snap.get('rate'))),
        () => setRate(DEFAULT_FEE_RATE),
      ),
    [],
  );
  return rate;
}
