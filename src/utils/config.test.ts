import test from 'node:test';
import assert from 'node:assert/strict';
import { isFirebaseConfigReady, resolveLogoLoadState } from './config';

test('isFirebaseConfigReady returns false for empty placeholder config', () => {
  assert.equal(
    isFirebaseConfigReady({
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
    }),
    false,
  );
});

test('isFirebaseConfigReady returns false for whitespace-only or partial config', () => {
  assert.equal(
    isFirebaseConfigReady({
      apiKey: '   ',
      authDomain: 'moodist.firebaseapp.com',
      projectId: 'moodist-vr',
      storageBucket: '',
      messagingSenderId: '',
      appId: '1:123:web:abc',
    }),
    false,
  );
});

test('isFirebaseConfigReady returns true when required fields are provided', () => {
  assert.equal(
    isFirebaseConfigReady({
      apiKey: 'AIzaExampleKeyValue',
      authDomain: 'moodist-vr.firebaseapp.com',
      projectId: 'moodist-vr',
      storageBucket: 'moodist-vr.firebasestorage.app',
      messagingSenderId: '1234567890',
      appId: '1:1234567890:web:abcdef123456',
    }),
    true,
  );
});

test('resolveLogoLoadState returns loaded only for valid image dimensions', () => {
  assert.equal(resolveLogoLoadState(240, 64), 'loaded');
  assert.equal(resolveLogoLoadState(0, 0), 'fallback');
  assert.equal(resolveLogoLoadState(0, 48), 'fallback');
});
