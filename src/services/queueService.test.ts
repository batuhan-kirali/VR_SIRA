import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../utils/hash';
import type { RegistrationFormData } from '../utils/registration';
import {
  findActiveContactLockCodeWithDeps,
  findActiveStoredQueueCodeWithDeps,
  lookupActiveQueueWithDeps,
  parseQueueLookupInput,
  registerVisitorWithDeps,
  type QueueServiceDeps,
} from './queueService';

const SAMPLE_FORM: RegistrationFormData = {
  fullName: 'Ayşe Yılmaz',
  phone: '+90 (532) 123 45 67',
  email: ' Ayse@Example.COM ',
  kvkkAccepted: true,
  survey: {
    q1: 'İlk kez burada duyuyorum',
    q2: 'Travma ve Stres Yönetimi',
    q3: 'Teknolojiyi yakından tanımak',
  },
};

test('parseQueueLookupInput normalizes VR codes, short numbers, phones, and emails', () => {
  assert.deepEqual(parseQueueLookupInput('vr-2'), { kind: 'code', code: 'VR-02' });
  assert.deepEqual(parseQueueLookupInput('VR-02'), { kind: 'code', code: 'VR-02' });
  assert.deepEqual(parseQueueLookupInput('2'), { kind: 'code', code: 'VR-02' });
  assert.deepEqual(parseQueueLookupInput('105'), { kind: 'code', code: 'VR-105' });
  assert.deepEqual(parseQueueLookupInput('0532 123 45 67'), {
    kind: 'contact',
    normalized: '5321234567',
    contactType: 'phone',
  });
  assert.deepEqual(parseQueueLookupInput('+905321234567'), {
    kind: 'contact',
    normalized: '5321234567',
    contactType: 'phone',
  });
  assert.deepEqual(parseQueueLookupInput('  Ayse@Moodist.COM '), {
    kind: 'contact',
    normalized: 'ayse@moodist.com',
    contactType: 'email',
  });
  assert.deepEqual(parseQueueLookupInput('   '), { kind: 'invalid' });
  assert.deepEqual(parseQueueLookupInput('VR-0'), { kind: 'invalid' });
  assert.deepEqual(parseQueueLookupInput('rasgele metin'), { kind: 'invalid' });
});

test('lookupActiveQueueWithDeps finds active VR code and persists to localStorage', async () => {
  let persisted: string | null = null;
  const result = await lookupActiveQueueWithDeps('vr-2', {
    getContactLock: async () => {
      throw new Error('Should not check contact_locks for VR code lookup');
    },
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-02');
      return { exists: true, active: true, status: 'waiting', queueOrder: 2 };
    },
    persistStoredCode: (code) => {
      persisted = code;
    },
  });

  assert.deepEqual(result, { status: 'active', code: 'VR-02' });
  assert.equal(persisted, 'VR-02');
});

test('lookupActiveQueueWithDeps distinguishes completed vs not_found records', async () => {
  const completedRes = await lookupActiveQueueWithDeps('VR-04', {
    getContactLock: async () => null,
    checkActivePublicQueue: async () => ({
      exists: true,
      active: false,
      status: 'completed',
    }),
    persistStoredCode: () => {
      throw new Error('Should not persist completed code');
    },
  });
  assert.deepEqual(completedRes, { status: 'completed', code: 'VR-04' });

  const notFoundRes = await lookupActiveQueueWithDeps('VR-99', {
    getContactLock: async () => null,
    checkActivePublicQueue: async () => ({ exists: false, active: false }),
    persistStoredCode: () => {
      throw new Error('Should not persist missing code');
    },
  });
  assert.deepEqual(notFoundRes, { status: 'not_found' });
});

test('lookupActiveQueueWithDeps resolves phone/email via contact_locks SHA-256 single-doc getDoc', async () => {
  const phoneHash = await sha256Hex('5321234567');
  const emailHash = await sha256Hex('ayse@moodist.com');
  let persisted: string | null = null;

  const phoneResult = await lookupActiveQueueWithDeps('0532 123 45 67', {
    getContactLock: async (hash) => {
      assert.equal(hash, phoneHash);
      return { active: true, code: 'VR-11' };
    },
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-11');
      return { exists: true, active: true, status: 'called', queueOrder: 11 };
    },
    persistStoredCode: (code) => {
      persisted = code;
    },
  });
  assert.deepEqual(phoneResult, { status: 'active', code: 'VR-11' });
  assert.equal(persisted, 'VR-11');

  const emailCompleted = await lookupActiveQueueWithDeps('Ayse@Moodist.com', {
    getContactLock: async (hash) => {
      assert.equal(hash, emailHash);
      return { active: true, code: 'VR-12' };
    },
    checkActivePublicQueue: async () => ({
      exists: true,
      active: false,
      status: 'completed',
    }),
    persistStoredCode: () => {},
  });
  assert.deepEqual(emailCompleted, { status: 'completed', code: 'VR-12' });

  const inactiveLock = await lookupActiveQueueWithDeps('Ayse@Moodist.com', {
    getContactLock: async () => ({ active: false, code: 'VR-12' }),
    checkActivePublicQueue: async () => ({ exists: true, active: true }),
    persistStoredCode: () => {},
  });
  assert.deepEqual(inactiveLock, { status: 'not_found' });
});

test('findActiveStoredQueueCodeWithDeps returns active code without clearing storage', async () => {
  let cleared = false;
  const result = await findActiveStoredQueueCodeWithDeps({
    readStoredCode: () => 'VR-05',
    clearStoredCode: () => {
      cleared = true;
    },
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-05');
      return { exists: true, active: true, queueOrder: 5 };
    },
  });

  assert.equal(result, 'VR-05');
  assert.equal(cleared, false);
});

test('findActiveStoredQueueCodeWithDeps clears localStorage and returns null when deleted or completed', async () => {
  let cleared = false;
  const result = await findActiveStoredQueueCodeWithDeps({
    readStoredCode: () => 'VR-02',
    clearStoredCode: () => {
      cleared = true;
    },
    checkActivePublicQueue: async () => ({ exists: true, active: false, status: 'completed' }),
  });

  assert.equal(result, null);
  assert.equal(cleared, true);
});

test('findActiveContactLockCodeWithDeps skips Firestore when both phone and email are empty', async () => {
  let lockCalls = 0;
  const result = await findActiveContactLockCodeWithDeps('', '   ', {
    getContactLock: async () => {
      lockCalls += 1;
      return null;
    },
    checkActivePublicQueue: async () => ({ exists: false, active: false }),
    persistStoredCode: () => {
      throw new Error('Should not persist');
    },
  });

  assert.equal(result, null);
  assert.equal(lockCalls, 0);
});

test('findActiveContactLockCodeWithDeps finds active lock using canonical 10-digit phone hash and persists code', async () => {
  const canonicalHash = await sha256Hex('5321234567');
  let persistedCode: string | null = null;

  const result = await findActiveContactLockCodeWithDeps('0532 123 45 67', '', {
    getContactLock: async (hash) => {
      assert.equal(hash, canonicalHash);
      return { active: true, code: 'VR-09' };
    },
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-09');
      return { exists: true, active: true, queueOrder: 9 };
    },
    persistStoredCode: (code) => {
      persistedCode = code;
    },
  });

  assert.equal(result, 'VR-09');
  assert.equal(persistedCode, 'VR-09');
});

test('returns existing code immediately when localStorage code is active in public_queue', async () => {
  let lockChecks = 0;
  let counterCalls = 0;
  let writeCalls = 0;

  const deps: QueueServiceDeps = {
    readStoredCode: () => 'VR-03',
    persistStoredCode: () => {
      throw new Error('Should not overwrite already stored code');
    },
    clearStoredCode: () => {},
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-03');
      return { exists: true, active: true, queueOrder: 3 };
    },
    getContactLock: async () => {
      lockChecks += 1;
      return null;
    },
    incrementQueueCounter: async () => {
      counterCalls += 1;
      return 4;
    },
    writeRegistrationDocuments: async () => {
      writeCalls += 1;
    },
  };

  const result = await registerVisitorWithDeps(SAMPLE_FORM, deps);
  assert.deepEqual(result, { code: 'VR-03', queueOrder: 3, isExisting: true });
  assert.equal(lockChecks, 0);
  assert.equal(counterCalls, 0);
  assert.equal(writeCalls, 0);
});

test('redirects to active contact_locks match, persists code to localStorage, and skips new creation', async () => {
  const expectedPhoneHash = await sha256Hex('5321234567');
  const lookedUpHashes: string[] = [];
  let persistedCode: string | null = null;
  let counterCalls = 0;

  const deps: QueueServiceDeps = {
    readStoredCode: () => null,
    persistStoredCode: (code) => {
      persistedCode = code;
    },
    clearStoredCode: () => {},
    checkActivePublicQueue: async (code) => {
      assert.equal(code, 'VR-07');
      return { exists: true, active: true, queueOrder: 7 };
    },
    getContactLock: async (hash) => {
      lookedUpHashes.push(hash);
      if (hash === expectedPhoneHash) {
        return { active: true, code: 'VR-07' };
      }
      return null;
    },
    incrementQueueCounter: async () => {
      counterCalls += 1;
      return 8;
    },
    writeRegistrationDocuments: async () => {
      throw new Error('Should not write when existing contact lock is active');
    },
  };

  const result = await registerVisitorWithDeps(SAMPLE_FORM, deps);
  assert.deepEqual(result, { code: 'VR-07', queueOrder: 7, isExisting: true });
  assert.deepEqual(lookedUpHashes, [expectedPhoneHash]);
  assert.equal(persistedCode, 'VR-07');
  assert.equal(counterCalls, 0);
});

test('creates new entry and writes canonical contact_locks when prior localStorage/locks are completed or absent', async () => {
  const expectedPhoneHash = await sha256Hex('5321234567');
  const expectedEmailHash = await sha256Hex('ayse@example.com');
  let persistedCode: string | null = null;
  let writtenHashes: string[] = [];
  let writtenCode = '';

  const deps: QueueServiceDeps = {
    readStoredCode: () => 'VR-01',
    persistStoredCode: (code) => {
      persistedCode = code;
    },
    clearStoredCode: () => {},
    checkActivePublicQueue: async () => ({ exists: true, active: false, status: 'completed' }),
    getContactLock: async (hash) => {
      if (hash === expectedPhoneHash) {
        return { active: true, code: 'VR-02' };
      }
      return { active: false, code: 'VR-02' };
    },
    incrementQueueCounter: async () => 8,
    writeRegistrationDocuments: async (code, queueOrder, _data, contactHashes) => {
      assert.equal(queueOrder, 8);
      writtenCode = code;
      writtenHashes = contactHashes;
    },
  };

  const result = await registerVisitorWithDeps(SAMPLE_FORM, deps);
  assert.deepEqual(result, { code: 'VR-08', queueOrder: 8, isExisting: false });
  assert.equal(writtenCode, 'VR-08');
  assert.deepEqual(writtenHashes, [expectedPhoneHash, expectedEmailHash]);
  assert.equal(persistedCode, 'VR-08');
});
