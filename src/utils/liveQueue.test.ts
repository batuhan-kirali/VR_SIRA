import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SYSTEM_STATUS,
  computeLiveQueueMetrics,
  computeRemainingChargingMinutes,
  normalizePublicQueueItem,
  normalizeSystemStatus,
  parseTimestampToMillis,
  sortPublicQueueItems,
  type PublicQueueItem,
} from './liveQueue';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');

function makeItem(
  code: string,
  queueOrder: number,
  status: PublicQueueItem['status'],
  skipCount: number = 0,
): PublicQueueItem {
  return {
    code,
    queueOrder,
    status,
    skipCount,
    lastSkippedAt: null,
    createdAt: null,
  };
}

test('sortPublicQueueItems orders entries ascending by queueOrder client-side', () => {
  const sorted = sortPublicQueueItems([
    makeItem('VR-05', 5, 'waiting'),
    makeItem('VR-02', 2, 'called'),
    makeItem('VR-03', 3, 'waiting'),
  ]);
  assert.deepEqual(
    sorted.map((item) => item.code),
    ['VR-02', 'VR-03', 'VR-05'],
  );
});

test('peopleAhead counts other called users plus waiting users with lower queueOrder', () => {
  const items: PublicQueueItem[] = [
    makeItem('VR-01', 1, 'completed'), // completed -> excluded
    makeItem('VR-02', 2, 'called'), // called -> counted (1)
    makeItem('VR-03', 3, 'waiting'), // waiting & order < 5 -> counted (2)
    makeItem('VR-04', 4, 'waiting'), // waiting & order < 5 -> counted (3)
    makeItem('VR-05', 5, 'waiting'), // self -> excluded
    makeItem('VR-06', 6, 'waiting'), // waiting & order > 5 -> excluded
    makeItem('VR-07', 7, 'called'), // called even with higher order -> counted (4)
  ];

  const metrics = computeLiveQueueMetrics(items, 'VR-05', DEFAULT_SYSTEM_STATUS, NOW);
  assert.equal(metrics.peopleAhead, 4);
  assert.equal(metrics.estimatedWaitMinutes, 28);
  assert.equal(metrics.waitTimeLabel, '~28 dk');
  assert.equal(metrics.chargingBannerText, null);
});

test('shows Sıradaki sizsiniz when 0 people are ahead and not charging', () => {
  const items: PublicQueueItem[] = [
    makeItem('VR-01', 1, 'completed'),
    makeItem('VR-02', 2, 'waiting'),
    makeItem('VR-03', 3, 'waiting'),
  ];

  const metrics = computeLiveQueueMetrics(items, 'VR-02', DEFAULT_SYSTEM_STATUS, NOW);
  assert.equal(metrics.peopleAhead, 0);
  assert.equal(metrics.estimatedWaitMinutes, 0);
  assert.equal(metrics.waitTimeLabel, 'Sıradaki sizsiniz');
});

test('adds remaining charging minutes and shows amber countdown banner when charging > 0 min', () => {
  const items: PublicQueueItem[] = [
    makeItem('VR-01', 1, 'called'),
    makeItem('VR-02', 2, 'waiting'),
    makeItem('VR-03', 3, 'waiting'),
  ];

  // 8 minutes and 10 seconds remaining -> Math.ceil -> 9 dk
  const chargingEndTimeMs = NOW + (8 * 60 + 10) * 1000;
  const metrics = computeLiveQueueMetrics(
    items,
    'VR-03',
    { isCharging: true, chargingEndTimeMs },
    NOW,
  );

  assert.equal(metrics.peopleAhead, 2);
  assert.equal(metrics.remainingChargingMinutes, 9);
  assert.equal(metrics.estimatedWaitMinutes, 2 * 7 + 9);
  assert.equal(metrics.waitTimeLabel, '~23 dk');
  assert.equal(
    metrics.chargingBannerText,
    'VR gözlüğü şu an şarj ediliyor (Tahmini kalan: 9 dk). Sıranız korunuyor.',
  );
});

test('clamps expired charging time to 0 without negative wait and shows finishing banner', () => {
  const items: PublicQueueItem[] = [
    makeItem('VR-01', 1, 'waiting'),
    makeItem('VR-02', 2, 'waiting'),
  ];

  // Charging end time was 5 minutes ago -> should not go negative
  const chargingEndTimeMs = NOW - 5 * 60 * 1000;
  const metrics = computeLiveQueueMetrics(
    items,
    'VR-02',
    { isCharging: true, chargingEndTimeMs },
    NOW,
  );

  assert.equal(computeRemainingChargingMinutes(true, chargingEndTimeMs, NOW), 0);
  assert.equal(metrics.peopleAhead, 1);
  assert.equal(metrics.remainingChargingMinutes, 0);
  assert.equal(metrics.estimatedWaitMinutes, 7);
  assert.equal(metrics.waitTimeLabel, '~7 dk');
  assert.equal(
    metrics.chargingBannerText,
    'Şarj tamamlanmak üzere, kısa süre içinde devam edilecek.',
  );
});

test('parseTimestampToMillis and normalizeSystemStatus handle Firestore Timestamps and missing docs', () => {
  assert.deepEqual(normalizeSystemStatus(undefined), DEFAULT_SYSTEM_STATUS);
  assert.equal(parseTimestampToMillis({ toMillis: () => 1700000000000 }), 1700000000000);
  assert.equal(parseTimestampToMillis({ seconds: 1700000000, nanoseconds: 0 }), 1700000000000);
  assert.equal(parseTimestampToMillis(new Date('2026-11-24T12:00:00.000Z')), NOW);

  const normalized = normalizeSystemStatus({
    isCharging: true,
    chargingEndTime: { toMillis: () => NOW + 600000 },
  });
  assert.equal(normalized.isCharging, true);
  assert.equal(normalized.chargingEndTimeMs, NOW + 600000);

  const item = normalizePublicQueueItem('VR-09', {
    code: 'VR-09',
    queueOrder: 9,
    status: 'waiting',
    skipCount: 2,
  });
  assert.equal(item.skipCount, 2);
});
