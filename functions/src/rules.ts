import { FieldValue, type Firestore } from 'firebase-admin/firestore';

import { fail } from './matches/common';
import { BETA_RULES_VERSION } from './shared/betaRules';

/**
 * acceptRules({ version }): records that the player accepted the current beta
 * rules on users/{uid} (acceptedRulesVersion + acceptedAt, server time).
 * Only the current version can be accepted. Accepting again keeps the
 * original acceptedAt.
 */
export async function acceptRules(
  db: Firestore,
  uid: string,
  data: Record<string, unknown> | undefined | null,
) {
  if (data?.version !== BETA_RULES_VERSION) {
    throw fail('failed-precondition', 'The beta rules were updated. Reload the app to see them.');
  }
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(ref);
    if (!profile.exists) throw fail('failed-precondition', 'Finish your profile first.');
    if (profile.get('acceptedRulesVersion') === BETA_RULES_VERSION) return; // already done
    tx.update(ref, {
      acceptedRulesVersion: BETA_RULES_VERSION,
      acceptedAt: FieldValue.serverTimestamp(),
    });
  });
  return { version: BETA_RULES_VERSION };
}
