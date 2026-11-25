import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { buildContactHashes } from '../utils/hash';
import {
  DEFAULT_SYSTEM_STATUS,
  normalizePublicQueueItem,
  normalizeSystemStatus,
  parseTimestampToMillis,
  sortPublicQueueItems,
  type PublicQueueItem,
  type SystemStatus,
} from '../utils/liveQueue';

export interface PrivateRegistrationItem {
  code: string;
  fullName: string;
  phone: string;
  email: string;
  kvkkAccepted: boolean;
  survey?: {
    q1?: string;
    q2?: string;
    q3?: string;
  };
  createdAt: unknown;
}

export interface AdminQueueEntry extends PublicQueueItem {
  fullName: string;
  phone: string;
  email: string;
  kvkkAccepted: boolean;
  calledAt: unknown;
  completedAt: unknown;
  survey?: {
    q1?: string;
    q2?: string;
    q3?: string;
  };
}

export interface AdminQueueBuckets {
  called: AdminQueueEntry[];
  waiting: AdminQueueEntry[];
  completed: AdminQueueEntry[];
  all: AdminQueueEntry[];
}

export interface AdminActionDeps {
  updatePublicQueue: (code: string, payload: Record<string, unknown>) => Promise<void>;
  deactivateContactLock: (hash: string) => Promise<void>;
  nowToken: () => unknown;
}

export function normalizePrivateRegistration(
  docId: string,
  data: Record<string, unknown> | undefined,
): PrivateRegistrationItem {
  const code =
    typeof data?.code === 'string' && data.code.trim().length > 0
      ? data.code.trim()
      : docId;
  const fullName = typeof data?.fullName === 'string' ? data.fullName.trim() : '';
  const phone = typeof data?.phone === 'string' ? data.phone.trim() : '';
  const email = typeof data?.email === 'string' ? data.email.trim() : '';
  const kvkkAccepted = data?.kvkkAccepted === true;

  let survey: PrivateRegistrationItem['survey'];
  if (typeof data?.survey === 'object' && data.survey !== null) {
    const rawSurvey = data.survey as Record<string, unknown>;
    survey = {
      q1: typeof rawSurvey.q1 === 'string' ? rawSurvey.q1 : undefined,
      q2: typeof rawSurvey.q2 === 'string' ? rawSurvey.q2 : undefined,
      q3: typeof rawSurvey.q3 === 'string' ? rawSurvey.q3 : undefined,
    };
  }

  return {
    code,
    fullName,
    phone,
    email,
    kvkkAccepted,
    survey,
    createdAt: data?.createdAt ?? null,
  };
}

export interface RawPublicQueueRecord extends PublicQueueItem {
  calledAt: unknown;
  completedAt: unknown;
}

export function normalizeAdminPublicQueueRecord(
  docId: string,
  data: Record<string, unknown> | undefined,
): RawPublicQueueRecord {
  const base = normalizePublicQueueItem(docId, data);
  return {
    ...base,
    calledAt: data?.calledAt ?? null,
    completedAt: data?.completedAt ?? null,
  };
}

/**
 * Joins public_queue records with private_registrations by code,
 * sorts client-side by queueOrder (avoiding Firestore composite indexes),
 * and partitions into called / waiting / completed buckets.
 */
export function mergeAdminQueueEntries(
  publicItems: readonly RawPublicQueueRecord[],
  privateByCode: ReadonlyMap<string, PrivateRegistrationItem>,
): AdminQueueBuckets {
  const sortedPublic = sortPublicQueueItems(publicItems) as RawPublicQueueRecord[];

  const merged: AdminQueueEntry[] = sortedPublic.map((pub) => {
    const priv = privateByCode.get(pub.code);
    return {
      ...pub,
      createdAt: pub.createdAt ?? priv?.createdAt ?? null,
      fullName: priv?.fullName ?? '',
      phone: priv?.phone ?? '',
      email: priv?.email ?? '',
      kvkkAccepted: priv?.kvkkAccepted === true,
      survey: priv?.survey,
    };
  });

  const called = merged.filter((item) => item.status === 'called');
  const waiting = merged.filter((item) => item.status === 'waiting');
  const completed = merged
    .filter((item) => item.status === 'completed')
    .sort((a, b) => {
      const aTime = parseTimestampToMillis(a.completedAt) ?? -1;
      const bTime = parseTimestampToMillis(b.completedAt) ?? -1;
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return b.queueOrder - a.queueOrder;
    });

  return {
    called,
    waiting,
    completed,
    all: merged,
  };
}

/**
 * Computes the new queueOrder placing a skipped participant behind the 3rd waiting person:
 * - >= 4 waiting: midpoint between waiting[2] and waiting[3]
 * - 1..3 waiting: last waiting queueOrder + 1
 * - 0 waiting: preserve current queueOrder
 */
export function computeSkippedQueueOrder(
  entry: Pick<PublicQueueItem, 'code' | 'queueOrder'>,
  sortedWaitingList: readonly Pick<PublicQueueItem, 'code' | 'queueOrder' | 'status'>[],
): number {
  const waiting = [...sortedWaitingList]
    .filter((item) => item.code !== entry.code && item.status === 'waiting')
    .sort((a, b) => {
      if (a.queueOrder !== b.queueOrder) {
        return a.queueOrder - b.queueOrder;
      }
      return a.code.localeCompare(b.code);
    });

  if (waiting.length >= 4) {
    return (waiting[2].queueOrder + waiting[3].queueOrder) / 2;
  }

  if (waiting.length >= 1) {
    return waiting[waiting.length - 1].queueOrder + 1;
  }

  return entry.queueOrder;
}

export async function callParticipantWithDeps(
  code: string,
  deps: AdminActionDeps,
): Promise<void> {
  await deps.updatePublicQueue(code, {
    status: 'called',
    calledAt: deps.nowToken(),
  });
}

export async function completeParticipantWithDeps(
  entry: Pick<AdminQueueEntry, 'code' | 'phone' | 'email'>,
  deps: AdminActionDeps,
): Promise<void> {
  await deps.updatePublicQueue(entry.code, {
    status: 'completed',
    completedAt: deps.nowToken(),
  });

  try {
    const hashes = await buildContactHashes(entry.phone, entry.email);
    await Promise.all(
      hashes.map(async (hash) => {
        try {
          await deps.deactivateContactLock(hash);
        } catch {
          // Ignore missing lock docs or permission errors so completion never fails.
        }
      }),
    );
  } catch {
    // Ignore hashing failures so completion never fails.
  }
}

export async function skipParticipantWithDeps(
  entry: Pick<AdminQueueEntry, 'code' | 'queueOrder' | 'skipCount'>,
  sortedWaitingList: readonly Pick<PublicQueueItem, 'code' | 'queueOrder' | 'status'>[],
  deps: AdminActionDeps,
): Promise<number> {
  const nextQueueOrder = computeSkippedQueueOrder(entry, sortedWaitingList);
  const nextSkipCount = (entry.skipCount || 0) + 1;

  await deps.updatePublicQueue(entry.code, {
    status: 'waiting',
    queueOrder: nextQueueOrder,
    skipCount: nextSkipCount,
    lastSkippedAt: deps.nowToken(),
  });

  return nextQueueOrder;
}

function createFirestoreAdminDeps(): AdminActionDeps {
  if (!db) {
    throw new Error('Firebase veritabanı bağlantısı bulunamadı.');
  }
  const firestore = db;

  return {
    updatePublicQueue: async (code, payload) => {
      await updateDoc(doc(firestore, 'public_queue', code), payload);
    },
    deactivateContactLock: async (hash) => {
      await updateDoc(doc(firestore, 'contact_locks', hash), { active: false });
    },
    nowToken: () => serverTimestamp(),
  };
}

export async function callParticipant(code: string): Promise<void> {
  return callParticipantWithDeps(code, createFirestoreAdminDeps());
}

export async function completeParticipant(
  entry: Pick<AdminQueueEntry, 'code' | 'phone' | 'email'>,
): Promise<void> {
  return completeParticipantWithDeps(entry, createFirestoreAdminDeps());
}

export async function skipParticipant(
  entry: Pick<AdminQueueEntry, 'code' | 'queueOrder' | 'skipCount'>,
  sortedWaitingList: readonly Pick<PublicQueueItem, 'code' | 'queueOrder' | 'status'>[],
): Promise<number> {
  return skipParticipantWithDeps(entry, sortedWaitingList, createFirestoreAdminDeps());
}

export interface ChargingStatusDeps {
  setSystemStatusDoc: (payload: Record<string, unknown>) => Promise<void>;
  nowMs: () => number;
  nowToken: () => unknown;
}

export async function startChargingBreakWithDeps(
  minutes: number,
  deps: ChargingStatusDeps,
): Promise<number> {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 15;
  const chargingEndTime = deps.nowMs() + safeMinutes * 60_000;

  await deps.setSystemStatusDoc({
    isCharging: true,
    chargingEndTime,
    updatedAt: deps.nowToken(),
  });

  return chargingEndTime;
}

export async function endChargingBreakWithDeps(deps: ChargingStatusDeps): Promise<void> {
  await deps.setSystemStatusDoc({
    isCharging: false,
    chargingEndTime: null,
    updatedAt: deps.nowToken(),
  });
}

function createFirestoreChargingDeps(): ChargingStatusDeps {
  if (!db) {
    throw new Error('Firebase veritabanı bağlantısı bulunamadı.');
  }
  const firestore = db;

  return {
    setSystemStatusDoc: async (payload) => {
      await setDoc(doc(firestore, 'system_status', 'main'), payload, { merge: true });
    },
    nowMs: () => Date.now(),
    nowToken: () => serverTimestamp(),
  };
}

export async function startChargingBreak(minutes: number): Promise<number> {
  return startChargingBreakWithDeps(minutes, createFirestoreChargingDeps());
}

export async function endChargingBreak(): Promise<void> {
  return endChargingBreakWithDeps(createFirestoreChargingDeps());
}

/**
 * Live-subscribes to system_status/main using the exact same normalization as LiveQueueScreen.
 * Defaults to { isCharging: false, chargingEndTimeMs: null } when the document does not exist yet.
 */
export function subscribeSystemStatus(
  onData: (status: SystemStatus) => void,
  onError?: (message: string) => void,
): () => void {
  if (!db) {
    onData(DEFAULT_SYSTEM_STATUS);
    return () => {};
  }

  return onSnapshot(
    doc(db, 'system_status', 'main'),
    (docSnap) => {
      if (!docSnap.exists()) {
        onData(DEFAULT_SYSTEM_STATUS);
        return;
      }
      onData(normalizeSystemStatus(docSnap.data() as Record<string, unknown>));
    },
    () => {
      onData(DEFAULT_SYSTEM_STATUS);
      onError?.('Şarj molası durumu okunamadı.');
    },
  );
}

/**
 * Live-subscribes to both public_queue and private_registrations (no where/orderBy queries)
 * and emits client-side merged and sorted AdminQueueBuckets.
 */
export function subscribeAdminQueue(
  onData: (buckets: AdminQueueBuckets) => void,
  onError: (message: string) => void,
): () => void {
  if (!db) {
    onError('Firebase veritabanı bağlantısı bulunamadı.');
    return () => {};
  }

  let publicItems: RawPublicQueueRecord[] = [];
  let hasPublicSnapshot = false;
  let privateMap = new Map<string, PrivateRegistrationItem>();

  const emitMerged = () => {
    if (!hasPublicSnapshot) {
      return;
    }
    onData(mergeAdminQueueEntries(publicItems, privateMap));
  };

  const unsubscribePublic = onSnapshot(
    collection(db, 'public_queue'),
    (snapshot) => {
      publicItems = snapshot.docs.map((docSnap) =>
        normalizeAdminPublicQueueRecord(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        ),
      );
      hasPublicSnapshot = true;
      emitMerged();
    },
    () => {
      onError('Canlı sıra listesi okunamadı. Yetkinizi veya bağlantınızı kontrol edin.');
    },
  );

  const unsubscribePrivate = onSnapshot(
    collection(db, 'private_registrations'),
    (snapshot) => {
      const nextMap = new Map<string, PrivateRegistrationItem>();
      snapshot.docs.forEach((docSnap) => {
        const parsed = normalizePrivateRegistration(
          docSnap.id,
          docSnap.data() as Record<string, unknown>,
        );
        nextMap.set(parsed.code, parsed);
      });
      privateMap = nextMap;
      emitMerged();
    },
    () => {
      onError('Katılımcı detay kayıtları okunamadı. Görevli yetkinizi kontrol edin.');
    },
  );

  return () => {
    unsubscribePublic();
    unsubscribePrivate();
  };
}
