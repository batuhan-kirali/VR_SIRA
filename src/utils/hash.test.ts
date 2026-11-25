import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContactHashes,
  formatPhoneDisplay,
  isEmailValidOptional,
  isPhoneValidOptional,
  normalizeEmail,
  normalizePhone,
  sha256Hex,
} from './hash';

test('normalizePhone converts 05XX, 5XX, and +905XX variants to identical 10-digit number', () => {
  assert.equal(normalizePhone('+90 (532) 123-45 67'), '5321234567');
  assert.equal(normalizePhone('905321234567'), '5321234567');
  assert.equal(normalizePhone('0532 123 45 67'), '5321234567');
  assert.equal(normalizePhone('532 123 45 67'), '5321234567');
  assert.equal(normalizePhone('   '), '');
});

test('all Turkish phone variants produce the exact same SHA-256 hash', async () => {
  const h1 = await buildContactHashes('0532 123 45 67', '');
  const h2 = await buildContactHashes('5321234567', '');
  const h3 = await buildContactHashes('+90 532 123 45 67', '');
  assert.deepEqual(h1, h2);
  assert.deepEqual(h2, h3);
  assert.equal(h1[0], await sha256Hex('5321234567'));
});

test('formatPhoneDisplay strips non-digits and formats 0-prefixed (11 max) and 5-prefixed (10 max)', () => {
  assert.equal(formatPhoneDisplay('abc0532-123!456789'), '0532 123 45 67');
  assert.equal(formatPhoneDisplay('0532123'), '0532 123');
  assert.equal(formatPhoneDisplay('5321234567899'), '532 123 45 67');
  assert.equal(formatPhoneDisplay('532123'), '532 123');
  assert.equal(formatPhoneDisplay('+905321234567'), '532 123 45 67');
  assert.equal(formatPhoneDisplay('abc!@#'), '');
});

test('isPhoneValidOptional accepts empty or valid 10-digit 5XX numbers and rejects partial/non-5 numbers', () => {
  assert.equal(isPhoneValidOptional(''), true);
  assert.equal(isPhoneValidOptional('   '), true);
  assert.equal(isPhoneValidOptional('0532 123 45 67'), true);
  assert.equal(isPhoneValidOptional('532 123 45 67'), true);
  assert.equal(isPhoneValidOptional('+90 532 123 45 67'), true);
  assert.equal(isPhoneValidOptional('0532 123'), false);
  assert.equal(isPhoneValidOptional('0212 123 45 67'), false);
  assert.equal(isPhoneValidOptional('1234567890'), false);
});

test('isEmailValidOptional accepts empty or standard emails and rejects malformed values', () => {
  assert.equal(isEmailValidOptional(''), true);
  assert.equal(isEmailValidOptional('   '), true);
  assert.equal(isEmailValidOptional('ayse@moodist.com.tr'), true);
  assert.equal(isEmailValidOptional('ayse@moodist'), false);
  assert.equal(isEmailValidOptional('ayse.moodist.com'), false);
  assert.equal(isEmailValidOptional('ayse @moodist.com'), false);
});

test('normalizeEmail removes whitespace and lowercases characters', () => {
  assert.equal(normalizeEmail('  Ayse.Yilmaz@Example.COM  '), 'ayse.yilmaz@example.com');
  assert.equal(normalizeEmail(' user @ moodist.com '), 'user@moodist.com');
  assert.equal(normalizeEmail('   '), '');
});

test('sha256Hex produces standard lowercase 64-char SHA-256 hex digest', async () => {
  const digest = await sha256Hex('abc');
  assert.equal(
    digest,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(digest.length, 64);
});

test('buildContactHashes hashes non-empty normalized phone and email values', async () => {
  const empty = await buildContactHashes('   ', '  ');
  assert.deepEqual(empty, []);

  const both = await buildContactHashes('(0532) 111-22-33', ' Test@Moodist.com ');
  assert.equal(both.length, 2);
  assert.equal(both[0], await sha256Hex('5321112233'));
  assert.equal(both[1], await sha256Hex('test@moodist.com'));
});
