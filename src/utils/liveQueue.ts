export type QueueStatus = 'waiting' | 'called' | 'completed' | (string & {});

export interface PublicQueueItem {
  code: string;
  queueOrder: number;
  status: QueueStatus;
  skipCount: number;
  lastSkippedAt: unknown;
  createdAt: unknown;
}

export interface SystemStatus {
  isCharging: boolean;
  chargingEndTimeMs: number | null;
}

export interface LiveQueueMetrics {
  myEntry: PublicQueueItem | null;
  peopleAhead: number;
  remainingChargingMinutes: number;
  estimatedWaitMinutes: number;
  waitTimeLabel: string;
  chargingBannerText: string | null;
}

export const MINUTES_PER_PERSON = 7;

export const DEFAULT_SYSTEM_STATUS: SystemStatus = {
  isCharging: false,
  chargingEndTimeMs: null,
};

/**
 * Safely converts Firestore Timestamp, serialized timestamp object, Date, epoch ms,
 * or ISO date string into epoch milliseconds.
 */
export function parseTimestampToMillis(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'object') {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof maybeTimestamp.toMillis === 'function') {
      const ms = maybeTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }

    if (typeof maybeTimestamp.seconds === 'number') {
      const nanos =
        typeof maybeTimestamp.nanoseconds === 'number' ? maybeTimestamp.nanoseconds : 0;
      const ms = maybeTimestamp.seconds * 1000 + Math.floor(nanos / 1_000_000);
      return Number.isFinite(ms) ? ms : null;
    }
  }

  return null;
}

export function normalizePublicQueueItem(
  docId: string,
  data: Record<string, unknown> | undefined,
): PublicQueueItem {
  const code =
    typeof data?.code === 'string' && data.code.trim().length > 0
      ? data.code.trim()
      : docId;
  const queueOrder =
    typeof data?.queueOrder === 'number' && Number.isFinite(data.queueOrder)
      ? data.queueOrder
      : Number.MAX_SAFE_INTEGER;
  const status =
    typeof data?.status === 'string' && data.status.trim().length > 0
      ? data.status.trim()
      : 'waiting';
  const skipCount =
    typeof data?.skipCount === 'number' &&
    Number.isFinite(data.skipCount) &&
    data.skipCount > 0
      ? Math.floor(data.skipCount)
      : 0;

  return {
    code,
    queueOrder,
    status,
    skipCount,
    lastSkippedAt: data?.lastSkippedAt ?? null,
    createdAt: data?.createdAt ?? null,
  };
}

export function normalizeSystemStatus(
  data: Record<string, unknown> | undefined,
): SystemStatus {
  if (!data) {
    return DEFAULT_SYSTEM_STATUS;
  }

  const isCharging = data.isCharging === true;
  const chargingEndTimeMs = parseTimestampToMillis(data.chargingEndTime);

  return {
    isCharging,
    chargingEndTimeMs,
  };
}

export function sortPublicQueueItems(items: readonly PublicQueueItem[]): PublicQueueItem[] {
  return [...items].sort((a, b) => {
    if (a.queueOrder !== b.queueOrder) {
      return a.queueOrder - b.queueOrder;
    }
    return a.code.localeCompare(b.code);
  });
}

export function computeRemainingChargingMinutes(
  isCharging: boolean,
  chargingEndTimeMs: number | null,
  nowMs: number,
): number {
  if (!isCharging || chargingEndTimeMs === null) {
    return 0;
  }

  const rawRemaining = Math.ceil((chargingEndTimeMs - nowMs) / 60000);
  return rawRemaining > 0 ? rawRemaining : 0;
}

export function computeLiveQueueMetrics(
  items: readonly PublicQueueItem[],
  myCode: string,
  systemStatus: SystemStatus,
  nowMs: number,
): LiveQueueMetrics {
  const sortedItems = sortPublicQueueItems(items);
  const myEntry = sortedItems.find((item) => item.code === myCode) ?? null;

  const peopleAhead = myEntry
    ? sortedItems.filter(
        (item) =>
          item.code !== myEntry.code &&
          (item.status === 'called' ||
            (item.status === 'waiting' && item.queueOrder < myEntry.queueOrder)),
      ).length
    : 0;

  const remainingChargingMinutes = computeRemainingChargingMinutes(
    systemStatus.isCharging,
    systemStatus.chargingEndTimeMs,
    nowMs,
  );

  const baseWaitMinutes = peopleAhead * MINUTES_PER_PERSON;
  const estimatedWaitMinutes =
    systemStatus.isCharging && remainingChargingMinutes > 0
      ? baseWaitMinutes + remainingChargingMinutes
      : baseWaitMinutes;

  const waitTimeLabel =
    estimatedWaitMinutes === 0 ? 'Sıradaki sizsiniz' : `~${estimatedWaitMinutes} dk`;

  let chargingBannerText: string | null = null;
  if (systemStatus.isCharging) {
    chargingBannerText =
      remainingChargingMinutes > 0
        ? `VR gözlüğü şu an şarj ediliyor (Tahmini kalan: ${remainingChargingMinutes} dk). Sıranız korunuyor.`
        : 'Şarj tamamlanmak üzere, kısa süre içinde devam edilecek.';
  }

  return {
    myEntry,
    peopleAhead,
    remainingChargingMinutes,
    estimatedWaitMinutes,
    waitTimeLabel,
    chargingBannerText,
  };
}
