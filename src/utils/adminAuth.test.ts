import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdminLocation } from './routing.ts';
import { formatFirebaseAuthError, validateAdminCredentials } from './adminAuth.ts';

test('isAdminLocation matches /admin, /admin/, #/admin, and #/admin/ case-insensitively', () => {
  assert.equal(isAdminLocation('/admin', ''), true);
  assert.equal(isAdminLocation('/admin/', ''), true);
  assert.equal(isAdminLocation('/ADMIN', ''), true);
  assert.equal(isAdminLocation('/', '#/admin'), true);
  assert.equal(isAdminLocation('/', '#/admin/'), true);
  assert.equal(isAdminLocation('/index.html', '#/ADMIN'), true);
});

test('isAdminLocation returns false for visitor routes', () => {
  assert.equal(isAdminLocation('/', ''), false);
  assert.equal(isAdminLocation('/', '#/'), false);
  assert.equal(isAdminLocation('/admin/extra', ''), false);
  assert.equal(isAdminLocation('/administrator', ''), false);
});

test('validateAdminCredentials validates email and non-empty password', () => {
  assert.equal(validateAdminCredentials('', '123456').valid, false);
  assert.equal(validateAdminCredentials('not-an-email', '123456').valid, false);
  assert.equal(validateAdminCredentials('staff@moodist.com', '').valid, false);
  assert.deepEqual(validateAdminCredentials(' staff@moodist.com ', 'secret123'), {
    valid: true,
    errorMessage: null,
  });
});

test('formatFirebaseAuthError maps Firebase Auth codes to short Turkish messages', () => {
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/invalid-credential' }),
    'E-posta veya şifre hatalı.',
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/wrong-password' }),
    'E-posta veya şifre hatalı.',
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/user-not-found' }),
    'E-posta veya şifre hatalı.',
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/too-many-requests' }),
    'Çok fazla başarısız deneme yapıldı. Lütfen kısa süre sonra tekrar deneyin.',
  );
  assert.equal(
    formatFirebaseAuthError({ code: 'auth/unknown' }),
    'Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.',
  );
});
