import { collection, doc, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useState } from 'react';

import type { Verification } from '@shared/games';

import { db, functions } from '@/firebase';

// Admin-only data (firestore.rules: admins read, nobody writes from the app).
// The rules for checking results are NOT in the app: the server sends admins
// readable labels, and the settings through getAntiCheatSettings.

// matchReview/{matchId}: the photo check's verdict, edits and review reasons.
export type MatchReview = {
  verification?: Verification & { model?: string };
  reasonLabels?: string[];
  editLabels?: string[];
  manual?: boolean;
  clean?: boolean;
};

export function useMatchReview(matchId: string, enabled = true) {
  const [data, setData] = useState<MatchReview | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return onSnapshot(
      doc(db, 'matchReview', matchId),
      (snap) => setData((snap.data() as MatchReview | undefined) ?? null),
      () => setData(null),
    );
  }, [matchId, enabled]);
  return data;
}

export type AdminItem = { id: string; createdAt?: Timestamp; [k: string]: unknown };

// Open items of an admin list, newest first (spotChecks / heldResults / playerReports).
export function useOpenItems(name: 'spotChecks' | 'heldResults' | 'playerReports', status: string) {
  const [state, setState] = useState<{ data: AdminItem[]; loading: boolean; error: boolean }>({
    data: [],
    loading: true,
    error: false,
  });
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, name), where('status', '==', status), orderBy('createdAt', 'desc'), limit(30)),
        (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: false }),
        () => setState({ data: [], loading: false, error: true }),
      ),
    [name, status],
  );
  return state;
}

export function useAuditLog(max = 20) {
  const [data, setData] = useState<AdminItem[]>([]);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(max)),
        (snap) => setData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => setData([]),
      ),
    [max],
  );
  return data;
}

export type IntegrityAction = 'release' | 'reject' | 'spot_ok' | 'dismiss' | 'disqualify' | 'warn' | 'deactivate';

export async function integrityAction(input: {
  action: IntegrityAction;
  note: string;
  heldId?: string;
  spotId?: string;
  reportId?: string;
  targetUid?: string;
  game?: string;
}) {
  const { data } = await httpsCallable<typeof input, { ok: boolean; strikes?: number }>(functions, 'integrityAction')(input);
  return data;
}

export async function getAntiCheatSettings() {
  const { data } = await httpsCallable<Record<string, never>, { fields: { key: string; label: string; value: number }[] }>(functions, 'getAntiCheatSettings')({});
  return data;
}

export async function setAntiCheatSettings(input: { settings: Record<string, number>; note: string }) {
  const { data } = await httpsCallable<typeof input, { fields: { key: string; label: string; value: number }[] }>(functions, 'setAntiCheatSettings')(input);
  return data;
}
