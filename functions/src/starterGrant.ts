import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export const STARTER_CREDITS = 10;

/**
 * Gives a new player their 10 starter credits, exactly once.
 *
 * In one transaction:
 * - if ledger/grant_{uid} already exists, do nothing (so running twice never
 *   grants twice);
 * - otherwise write that ledger entry and update wallets/{uid}.
 *
 * The ledger is the source of truth and is append-only. wallets/{uid} is a
 * server-only summary kept in step with the ledger inside the same transaction.
 *
 * Returns true if credits were granted, false if they had been already.
 */
export async function grantStarterCredits(db: Firestore, uid: string): Promise<boolean> {
  const grantRef = db.collection('ledger').doc(`grant_${uid}`);
  const walletRef = db.collection('wallets').doc(uid);

  return db.runTransaction(async (tx) => {
    const [grant, wallet] = await Promise.all([tx.get(grantRef), tx.get(walletRef)]);
    if (grant.exists) return false;

    tx.create(grantRef, {
      uid,
      type: 'starter_grant',
      amount: STARTER_CREDITS,
      description: 'Welcome to the closed beta',
      createdAt: FieldValue.serverTimestamp(),
    });

    if (wallet.exists) {
      // Not expected for a brand-new player, but never wipe an existing balance.
      tx.update(walletRef, {
        available: FieldValue.increment(STARTER_CREDITS),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(walletRef, {
        available: STARTER_CREDITS,
        locked: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return true;
  });
}
