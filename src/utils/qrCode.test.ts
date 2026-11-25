import assert from 'node:assert/strict';
import test from 'node:test';
import {
  STAND_QR_FILENAME,
  generateStandQrDataUrl,
  normalizeStandUrl,
} from './qrCode.ts';

test('normalizeStandUrl strips trailing /admin and #/admin segments cleanly', () => {
  assert.equal(normalizeStandUrl('https://moodist-vr-sira.web.app/admin'), 'https://moodist-vr-sira.web.app');
  assert.equal(normalizeStandUrl('https://moodist-vr-sira.web.app/admin/'), 'https://moodist-vr-sira.web.app');
  assert.equal(normalizeStandUrl('https://moodist-vr-sira.web.app/#/admin'), 'https://moodist-vr-sira.web.app');
  assert.equal(normalizeStandUrl('https://moodist-vr-sira.web.app/#/admin/'), 'https://moodist-vr-sira.web.app');
  assert.equal(normalizeStandUrl('  https://moodist-vr-sira.web.app/  '), 'https://moodist-vr-sira.web.app');
  assert.equal(normalizeStandUrl(''), '');
});

test('generateStandQrDataUrl produces a valid PNG data URL client-side and rejects empty input', async () => {
  const dataUrl = await generateStandQrDataUrl('https://moodist-vr-sira.web.app');
  assert.ok(dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(dataUrl.length > 500, 'Expected high-resolution QR PNG payload');
  assert.equal(STAND_QR_FILENAME, 'moodist-vr-stand-qr.png');

  await assert.rejects(() => generateStandQrDataUrl('   '));
});
