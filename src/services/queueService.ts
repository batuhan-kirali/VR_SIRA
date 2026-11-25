import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  buildContactHashes,
  normalizeEmail,
  normalizePhone,
  sha256Hex,
} from '../utils/hash';
import {
  MOODIST_VR_CODE_STORAGE_KEY,
  buildContactLockPayload,
  buildPrivateRegistrationPayload,
  buildPublicQueuePayload,
  formatTrackingCode,
  isActiveQueueStatus,
  type RegistrationFormData,
} from '../utils/registration';

export interface QueueRegistrationResult {
  code: string;
  queueOrder?: number;
  isExisting: boolean;
}

export interface PublicQueueCheckResult {
  exists: boolean;
  active: boolean;
  status?: string;
  queueOrder?: number;
}

export interface ContactLockRecord {
  active: boolean;
  code?: string;
}

export type ParsedQueueLookupInput =
  | { kind: 'code'; code: string }
  | { kind: 'contact'; normalized: string; contactType: 'email' | 'phone' }
  | { kind: 'invalid' };

export type QueueLookupResult =
  | { status: 'active'; code: string }
  | { status: 'completed'; code: string }
  | { status: 'not_found' }
  | { status: 'invalid' };

export interface QueueServiceDeps {
  readStoredCode: () => string | null;
  persistStoredCode: (code: string) => void;
  clearStoredCode: () => void;
  checkActivePublicQueue: (code: string) => Promise<PublicQueueCheckResult>;
  getContactLock: (hash: string) => Promise<ContactLockRecord | null>;
  incrementQueueCounter: () => Promise<number>;
  writeRegistrationDocuments: (
    code: string,
    queueOrder: number,
    data: RegistrationFormData,
    contactHashes: string[],
  ) => Promise<void>;
}

const VR_CODE_PATTERN = /^vr[\s-]*0*(\d{1,4})$/i;
const SHORT_NUMBER_PATTERN = /^0*(\d{1,4})$/;

/**
 * Classifies a visitor lookup input into:
 * - Tracking code ("vr-2", "VR-02", "2" -> "VR-02")
 * - Email (contains "@") -> normalized lowercase email
 * - Phone -> canonical 10-digit normalized Turkish mobile number
 */
export function parseQueueLookupInput(raw: string): ParsedQueueLookupInput {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: 'invalid' };
  }

  const vrMatch = VR_CODE_PATTERN.exec(trimmed);
  if (vrMatch) {
    const num = Number.parseInt(vrMatch[1], 10);
    if (Number.isInteger(num) && num >= 1) {
      return { kind: 'code', code: formatTrackingCode(num) };
    }
    return { kind: 'invalid' };
  }

  const numMatch = SHORT_NUMBER_PATTERN.exec(trimmed);
  if (numMatch) {
    const num = Number.parseInt(numMatch[1], 10);
    if (Number.isInteger(num) && num >= 1) {
      return { kind: 'code', code: formatTrackingCode(num) };
    }
    return { kind: 'invalid' };
  }

  if (trimmed.includes('@')) {
    const normalizedEmail = normalizeEmail(trimmed);
    if (normalizedEmail.length > 3) {
      return { kind: 'contact', normalized: normalizedEmail, contactType: 'email' };
    }
    return { kind: 'invalid' };
  }

  const normalizedPhone = normalizePhone(trimmed);
  if (normalizedPhone.length >= 10 && normalizedPhone.startsWith('5')) {
    return { kind: 'contact', normalized: normalizedPhone, contactType: 'phone' };
  }

  return { kind: 'invalid' };
}

export function readStoredTrackingCode(): string | null {
  try {
    const raw = window.localStorage.getItem(MOODIST_VR_CODE_STORAGE_KEY);
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}

export function persistTrackingCode(code: string): void {
  try {
    window.localStorage.setItem(MOODIST_VR_CODE_STORAGE_KEY, code);
  } catch {
    // Ignore storage quota or private-mode restriction errors.
  }
}

export function clearStoredTrackingCode(): void {
  try {
    window.localStorage.removeItem(MOODIST_VR_CODE_STORAGE_KEY);
  } catch {
    // Ignore storage restriction errors in private browsing modes.
  }
}

function createFirestoreDeps(firestore: Firestore): QueueServiceDeps {
  return {
    readStoredCode: readStoredTrackingCode,
    persistStoredCode: persistTrackingCode,
    clearStoredCode: clearStoredTrackingCode,

    async checkActivePublicQueue(code: string): Promise<PublicQueueCheckResult> {
      const queueSnap = await getDoc(doc(firestore, 'public_queue', code));
      if (!queueSnap.exists()) {
        return { exists: false, active: false };
      }

      const entryData = queueSnap.data();
      const status = typeof entryData?.status === 'string' ? entryData.status : 'waiting';
      const active = isActiveQueueStatus(status);

      return {
        exists: true,
        active,
        status,
        queueOrder:
          typeof entryData?.queueOrder === 'number' ? entryData.queueOrder : undefined,
      };
    },

    async getContactLock(hash: string): Promise<ContactLockRecord | null> {
      // Strictly single-document getDoc() lookup — never list/query contact_locks.
      const lockSnap = await getDoc(doc(firestore, 'contact_locks', hash));
      if (!lockSnap.exists()) {
        return null;
      }

      const lockData = lockSnap.data();
      return {
        active: lockData?.active === true,
        code: typeof lockData?.code === 'string' ? lockData.code : undefined,
      };
    },

    async incrementQueueCounter(): Promise<number> {
      const counterRef = doc(firestore, 'queue_meta', 'counter');
      return runTransaction(firestore, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);

        if (!counterSnap.exists()) {
          transaction.set(counterRef, { lastNumber: 1 });
          return 1;
        }

        const rawLastNumber = counterSnap.data()?.lastNumber;
        const current =
          typeof rawLastNumber === 'number' &&
          Number.isInteger(rawLastNumber) &&
          rawLastNumber >= 0
            ? rawLastNumber
            : 0;
        const updated = current + 1;

        transaction.update(counterRef, { lastNumber: updated });
        return updated;
      });
    },

    async writeRegistrationDocuments(
      code: string,
      queueOrder: number,
      data: RegistrationFormData,
      contactHashes: string[],
    ): Promise<void> {
      const publicQueueRef = doc(firestore, 'public_queue', code);
      const privateRegistrationRef = doc(firestore, 'private_registrations', code);

      const publicPayload = buildPublicQueuePayload(code, queueOrder, serverTimestamp());
      const privatePayload = buildPrivateRegistrationPayload(code, data, serverTimestamp());

      await Promise.all([
        setDoc(publicQueueRef, publicPayload),
        setDoc(privateRegistrationRef, privatePayload),
        ...contactHashes.map((hash) =>
          setDoc(
            doc(firestore, 'contact_locks', hash),
            buildContactLockPayload(code, serverTimestamp()),
          ),
        ),
      ]);
    },
  };
}

/**
 * Checks localStorage ("moodist_vr_code") against public_queue/{code} on startup.
 */
export async function findActiveStoredQueueCodeWithDeps(
  deps: Pick<QueueServiceDeps, 'readStoredCode' | 'clearStoredCode' | 'checkActivePublicQueue'>,
): Promise<string | null> {
  const storedCode = deps.readStoredCode();
  if (!storedCode) {
    return null;
  }

  const check = await deps.checkActivePublicQueue(storedCode);
  if (check.active) {
    return storedCode;
  }

  deps.clearStoredCode();
  return null;
}

export async function findActiveStoredQueueCode(): Promise<string | null> {
  if (!db) {
    return null;
  }
  return findActiveStoredQueueCodeWithDeps(createFirestoreDeps(db));
}

/**
 * Early Step-1 duplicate check via single-doc contact_locks/{hash} getDoc().
 */
export async function findActiveContactLockCodeWithDeps(
  phone: string,
  email: string,
  deps: Pick<QueueServiceDeps, 'getContactLock' | 'checkActivePublicQueue' | 'persistStoredCode'>,
): Promise<string | null> {
  const contactHashes = await buildContactHashes(phone, email);
  if (contactHashes.length === 0) {
    return null;
  }

  for (const hash of contactHashes) {
    const lockRecord = await deps.getContactLock(hash);
    if (!lockRecord || lockRecord.active !== true) {
      continue;
    }

    const lockedCode = lockRecord.code?.trim() ?? '';
    if (lockedCode.length > 0) {
      const existingCheck = await deps.checkActivePublicQueue(lockedCode);
      if (existingCheck.active) {
        deps.persistStoredCode(lockedCode);
        return lockedCode;
      }
    }
  }

  return null;
}

export async function findActiveContactLockCode(
  phone: string,
  email: string,
): Promise<string | null> {
  if (!db) {
    throw new Error('Firebase veritabanı bağlantısı yapılandırılmamış.');
  }
  return findActiveContactLockCodeWithDeps(phone, email, createFirestoreDeps(db));
}

/**
 * "Kaçıncı Sıradayım" single-document lookup by tracking code, phone, or email.
 * Never performs collection queries — uses strictly single-document getDoc() calls.
 */
export async function lookupActiveQueueWithDeps(
  input: string,
  deps: Pick<QueueServiceDeps, 'getContactLock' | 'checkActivePublicQueue' | 'persistStoredCode'>,
): Promise<QueueLookupResult> {
  const parsed = parseQueueLookupInput(input);
  if (parsed.kind === 'invalid') {
    return { status: 'invalid' };
  }

  if (parsed.kind === 'code') {
    const check = await deps.checkActivePublicQueue(parsed.code);
    if (!check.exists) {
      return { status: 'not_found' };
    }
    if (!check.active) {
      return { status: 'completed', code: parsed.code };
    }
    deps.persistStoredCode(parsed.code);
    return { status: 'active', code: parsed.code };
  }

  // Contact lookup: email or phone -> SHA-256 -> single-doc getDoc(contact_locks/{hash})
  const hash = await sha256Hex(parsed.normalized);
  const lockRecord = await deps.getContactLock(hash);
  if (!lockRecord || lockRecord.active !== true) {
    return { status: 'not_found' };
  }

  const lockedCode = lockRecord.code?.trim() ?? '';
  if (lockedCode.length === 0) {
    return { status: 'not_found' };
  }

  const check = await deps.checkActivePublicQueue(lockedCode);
  if (!check.exists) {
    return { status: 'not_found' };
  }
  if (!check.active) {
    return { status: 'completed', code: lockedCode };
  }

  deps.persistStoredCode(lockedCode);
  return { status: 'active', code: lockedCode };
}

export async function lookupActiveQueue(input: string): Promise<QueueLookupResult> {
  if (!db) {
    throw new Error('Firebase veritabanı bağlantısı yapılandırılmamış.');
  }
  return lookupActiveQueueWithDeps(input, createFirestoreDeps(db));
}

/**
 * Pure orchestration flow for duplicate lock checking and queue registration.
 */
export async function registerVisitorWithDeps(
  data: RegistrationFormData,
  deps: QueueServiceDeps,
): Promise<QueueRegistrationResult> {
  // a) Check localStorage ("moodist_vr_code") against public_queue/{code}
  const storedCode = deps.readStoredCode();
  if (storedCode) {
    const existingCheck = await deps.checkActivePublicQueue(storedCode);
    if (existingCheck.active) {
      return {
        code: storedCode,
        queueOrder: existingCheck.queueOrder,
        isExisting: true,
      };
    }
  }

  // b) Check contact_locks/{hash} via single-doc getDoc() for normalized phone/email
  const contactHashes = await buildContactHashes(data.phone, data.email);
  for (const hash of contactHashes) {
    const lockRecord = await deps.getContactLock(hash);
    if (!lockRecord || lockRecord.active !== true) {
      continue;
    }

    const lockedCode = lockRecord.code?.trim() ?? '';
    if (lockedCode.length > 0) {
      const existingCheck = await deps.checkActivePublicQueue(lockedCode);
      if (existingCheck.active) {
        deps.persistStoredCode(lockedCode);
        return {
          code: lockedCode,
          queueOrder: existingCheck.queueOrder,
          isExisting: true,
        };
      }
    }
  }

  // c) No active record found — increment counter and persist split collections + contact_locks
  const nextNumber = await deps.incrementQueueCounter();
  const code = formatTrackingCode(nextNumber);

  await deps.writeRegistrationDocuments(code, nextNumber, data, contactHashes);
  deps.persistStoredCode(code);

  return {
    code,
    queueOrder: nextNumber,
    isExisting: false,
  };
}

/**
 * Registers a visitor in Firestore using the Moodist VR Terapi queue schema.
 */
export async function registerVisitorInQueue(
  data: RegistrationFormData,
): Promise<QueueRegistrationResult> {
  if (!db) {
    throw new Error('Firebase veritabanı bağlantısı yapılandırılmamış.');
  }

  return registerVisitorWithDeps(data, createFirestoreDeps(db));
}
