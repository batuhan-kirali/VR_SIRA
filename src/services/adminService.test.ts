import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callParticipantWithDeps,
  completeParticipantWithDeps,
  computeSkippedQueueOrder,
  endChargingBreakWithDeps,
  mergeAdminQueueEntries,
  skipParticipantWithDeps,
  startChargingBreakWithDeps,
  type AdminActionDeps,
  type ChargingStatusDeps,
  type PrivateRegistrationItem,
  type RawPublicQueueRecord,
} from './adminService.ts';
import {
  computeRemainingChargingMinutes,
  normalizeSystemStatus,
} from '../utils/liveQueue.ts';
import { normalizeEmail, normalizePhone, sha256Hex } from '../utils/hash.ts';

function makePublic(
  code: string,
  queueOrder: number,
  status: 'waiting' | 'called' | 'completed',
  skipCount = 0,
  completedAt: unknown = null,
): RawPublicQueueRecord {
  return {
    code,
    queueOrder,
    status,
    skipCount,
    lastSkippedAt: null,
    createdAt: null,
    calledAt: null,
    completedAt,
  };
}

test('mergeAdminQueueEntries joins public_queue and private_registrations by code and sorts client-side', () => {
  const publicItems: RawPublicQueueRecord[] = [
    makePublic('VR-03', 3, 'waiting', 1),
    makePublic('VR-01', 1, 'completed', 0, 1000),
    makePublic('VR-04', 4, 'completed', 0, 2000),
    makePublic('VR-02', 2, 'called', 0),
    makePublic('VR-05', 2.5, 'waiting', 2),
  ];

  const privateMap = new Map<string, PrivateRegistrationItem>([
    [
      'VR-02',
      {
        code: 'VR-02',
        fullName: 'Ayşe Yılmaz',
        phone: '0532 111 22 33',
        email: 'ayse@example.com',
        kvkkAccepted: true,
        createdAt: null,
      },
    ],
    [
      'VR-05',
      {
        code: 'VR-05',
        fullName: 'Mehmet Demir',
        phone: '5334445566',
        email: '',
        kvkkAccepted: true,
        createdAt: null,
      },
    ],
  ]);

  const result = mergeAdminQueueEntries(publicItems, privateMap);

  assert.deepEqual(
    result.called.map((x) => ({ code: x.code, fullName: x.fullName, phone: x.phone })),
    [{ code: 'VR-02', fullName: 'Ayşe Yılmaz', phone: '0532 111 22 33' }],
  );

  // Waiting sorted ascending by queueOrder (2.5 before 3)
  assert.deepEqual(
    result.waiting.map((x) => x.code),
    ['VR-05', 'VR-03'],
  );
  assert.equal(result.waiting[0].fullName, 'Mehmet Demir');
  assert.equal(result.waiting[1].fullName, '');

  // Completed sorted most recently completed first
  assert.deepEqual(
    result.completed.map((x) => x.code),
    ['VR-04', 'VR-01'],
  );
});

test('computeSkippedQueueOrder places participant behind 3rd waiting person across all queue sizes', () => {
  const entry = makePublic('VR-01', 1, 'called', 0);

  // >= 4 waiting: midpoint between waiting[2] and waiting[3]
  const fourWaiting = [
    makePublic('VR-02', 2, 'waiting'),
    makePublic('VR-03', 3, 'waiting'),
    makePublic('VR-04', 4, 'waiting'),
    makePublic('VR-05', 5, 'waiting'),
  ];
  assert.equal(computeSkippedQueueOrder(entry, fourWaiting), 4.5);

  // 1..3 waiting: last waiting queueOrder + 1
  const twoWaiting = [
    makePublic('VR-02', 2, 'waiting'),
    makePublic('VR-03', 6, 'waiting'),
  ];
  assert.equal(computeSkippedQueueOrder(entry, twoWaiting), 7);

  // 0 waiting: preserve current queueOrder
  assert.equal(computeSkippedQueueOrder(entry, []), 1);
});

test('callParticipantWithDeps updates status to called with serverTimestamp token', async () => {
  const updates: Array<{ code: string; payload: Record<string, unknown> }> = [];
  const deps: AdminActionDeps = {
    updatePublicQueue: async (code, payload) => {
      updates.push({ code, payload });
    },
    deactivateContactLock: async () => {},
    nowToken: () => 'SERVER_TS',
  };

  await callParticipantWithDeps('VR-07', deps);
  assert.deepEqual(updates, [
    { code: 'VR-07', payload: { status: 'called', calledAt: 'SERVER_TS' } },
  ]);
});

test('completeParticipantWithDeps marks completed and silently tolerates failing contact_locks updates', async () => {
  const updates: Array<{ code: string; payload: Record<string, unknown> }> = [];
  const deactivated: string[] = [];

  const deps: AdminActionDeps = {
    updatePublicQueue: async (code, payload) => {
      updates.push({ code, payload });
    },
    deactivateContactLock: async (hash) => {
      deactivated.push(hash);
      if (deactivated.length === 1) {
        throw new Error('not-found');
      }
    },
    nowToken: () => 'SERVER_TS',
  };

  await completeParticipantWithDeps(
    { code: 'VR-02', phone: '+90 532 111 22 33', email: ' Ayse@Example.COM ' },
    deps,
  );

  assert.deepEqual(updates, [
    { code: 'VR-02', payload: { status: 'completed', completedAt: 'SERVER_TS' } },
  ]);

  const expectedPhoneHash = await sha256Hex(normalizePhone('+90 532 111 22 33'));
  const expectedEmailHash = await sha256Hex(normalizeEmail(' Ayse@Example.COM '));
  assert.deepEqual(new Set(deactivated), new Set([expectedPhoneHash, expectedEmailHash]));
});

test('skipParticipantWithDeps increments skipCount, sets status waiting, and updates queueOrder', async () => {
  const updates: Array<{ code: string; payload: Record<string, unknown> }> = [];
  const deps: AdminActionDeps = {
    updatePublicQueue: async (code, payload) => {
      updates.push({ code, payload });
    },
    deactivateContactLock: async () => {},
    nowToken: () => 'SERVER_TS',
  };

  const waitingList = [
    makePublic('VR-02', 2, 'waiting'),
    makePublic('VR-03', 3, 'waiting'),
    makePublic('VR-04', 4, 'waiting'),
    makePublic('VR-05', 5, 'waiting'),
  ];

  const nextOrder = await skipParticipantWithDeps(
    { code: 'VR-01', queueOrder: 1, skipCount: 1 },
    waitingList,
    deps,
  );

  assert.equal(nextOrder, 4.5);
  assert.deepEqual(updates, [
    {
      code: 'VR-01',
      payload: {
        status: 'waiting',
        queueOrder: 4.5,
        skipCount: 2,
        lastSkippedAt: 'SERVER_TS',
      },
    },
  ]);
});

test('startChargingBreakWithDeps writes LiveQueueScreen-compatible system_status/main payload', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const baseNow = 1_700_000_000_000;
  const deps: ChargingStatusDeps = {
    setSystemStatusDoc: async (payload) => {
      writes.push(payload);
    },
    nowMs: () => baseNow,
    nowToken: () => 'SERVER_TS',
  };

  const endTime = await startChargingBreakWithDeps(20, deps);

  assert.equal(endTime, baseNow + 20 * 60_000);
  assert.deepEqual(writes, [
    {
      isCharging: true,
      chargingEndTime: baseNow + 20 * 60_000,
      updatedAt: 'SERVER_TS',
    },
  ]);

  // Verify exact round-trip compatibility with LiveQueueScreen normalizer + remaining minutes
  const normalized = normalizeSystemStatus(writes[0]);
  assert.equal(normalized.isCharging, true);
  assert.equal(normalized.chargingEndTimeMs, baseNow + 20 * 60_000);
  assert.equal(
    computeRemainingChargingMinutes(
      normalized.isCharging,
      normalized.chargingEndTimeMs,
      baseNow + 5 * 60_000,
    ),
    15,
  );
  assert.equal(
    computeRemainingChargingMinutes(
      normalized.isCharging,
      normalized.chargingEndTimeMs,
      baseNow + 25 * 60_000,
    ),
    0,
  );
});

test('endChargingBreakWithDeps clears charging flag and chargingEndTime', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const deps: ChargingStatusDeps = {
    setSystemStatusDoc: async (payload) => {
      writes.push(payload);
    },
    nowMs: () => 1_700_000_000_000,
    nowToken: () => 'SERVER_TS',
  };

  await endChargingBreakWithDeps(deps);

  assert.deepEqual(writes, [
    {
      isCharging: false,
      chargingEndTime: null,
      updatedAt: 'SERVER_TS',
    },
  ]);
});
