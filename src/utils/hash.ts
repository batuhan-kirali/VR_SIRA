const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strips all non-digit characters and normalizes Turkish mobile numbers
 * to a canonical 10-digit format (e.g. "5321234567"):
 * - 12 digits starting with "90" -> strips leading "90"
 * - 11 digits starting with "0"  -> strips leading "0"
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 12 && digits.startsWith('90')) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }

  return digits;
}

/**
 * Formats phone input live while immediately stripping letters and special characters:
 * - Pasted 12-digit "90..." numbers convert to 10-digit "5XX XXX XX XX"
 * - Starting with "0": max 11 digits formatted as "05XX XXX XX XX"
 * - Starting with "5": max 10 digits formatted as "5XX XXX XX XX"
 * - Any other leading digit: max 10 digits (digits only)
 */
export function formatPhoneDisplay(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.length >= 12 && digits.startsWith('90')) {
    digits = digits.slice(2, 12);
  }

  if (digits.startsWith('0')) {
    const capped = digits.slice(0, 11);
    if (capped.length <= 4) return capped;
    if (capped.length <= 7) return `${capped.slice(0, 4)} ${capped.slice(4)}`;
    if (capped.length <= 9) {
      return `${capped.slice(0, 4)} ${capped.slice(4, 7)} ${capped.slice(7)}`;
    }
    return `${capped.slice(0, 4)} ${capped.slice(4, 7)} ${capped.slice(7, 9)} ${capped.slice(9)}`;
  }

  if (digits.startsWith('5')) {
    const capped = digits.slice(0, 10);
    if (capped.length <= 3) return capped;
    if (capped.length <= 6) return `${capped.slice(0, 3)} ${capped.slice(3)}`;
    if (capped.length <= 8) {
      return `${capped.slice(0, 3)} ${capped.slice(3, 6)} ${capped.slice(6)}`;
    }
    return `${capped.slice(0, 3)} ${capped.slice(3, 6)} ${capped.slice(6, 8)} ${capped.slice(8)}`;
  }

  return digits.slice(0, 10);
}

/**
 * Optional phone validation: blank is valid; if entered, normalized value must be
 * 10 digits starting with "5" (standard Turkish GSM format).
 */
export function isPhoneValidOptional(raw: string): boolean {
  if (raw.trim().length === 0) {
    return true;
  }
  const normalized = normalizePhone(raw);
  return normalized.length === 10 && normalized.startsWith('5');
}

/**
 * Removes all whitespace and converts an email address to lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.replace(/\s+/g, '').toLowerCase();
}

/**
 * Optional email validation: blank is valid; if entered, must match standard email syntax.
 */
export function isEmailValidOptional(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return true;
  }
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Computes a lowercase hexadecimal SHA-256 hash using the browser Web Crypto API.
 */
export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) kullanılamıyor.');
  }

  const encoded = new TextEncoder().encode(value);
  const digestBuffer = await globalThis.crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(digestBuffer);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Builds deduplicated SHA-256 contact hashes from optional phone and email inputs.
 */
export async function buildContactHashes(
  phone: string,
  email: string,
): Promise<string[]> {
  const normalizedValues: string[] = [];

  const cleanPhone = normalizePhone(phone);
  if (cleanPhone.length > 0) {
    normalizedValues.push(cleanPhone);
  }

  const cleanEmail = normalizeEmail(email);
  if (cleanEmail.length > 0) {
    normalizedValues.push(cleanEmail);
  }

  const hashes = await Promise.all(normalizedValues.map((item) => sha256Hex(item)));
  return Array.from(new Set(hashes));
}
