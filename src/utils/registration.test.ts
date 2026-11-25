import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_REGISTRATION_DATA,
  SURVEY_STEPS,
  buildContactLockPayload,
  buildPrivateRegistrationPayload,
  buildPublicQueuePayload,
  createRegistrationRecord,
  formatFirestoreRegistrationError,
  formatTrackingCode,
  getSurveyDefinition,
  isActiveQueueStatus,
  isPersonalInfoValid,
  isStepValid,
} from './registration';

test('Step 1 validation requires both non-empty fullName and kvkkAccepted', () => {
  assert.equal(isPersonalInfoValid(INITIAL_REGISTRATION_DATA), false);

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: 'Ayşe Yılmaz',
      kvkkAccepted: false,
    }),
    false,
  );

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: '   ',
      kvkkAccepted: true,
    }),
    false,
  );

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: 'Ayşe Yılmaz',
      kvkkAccepted: true,
    }),
    true,
  );

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: 'Ayşe Yılmaz',
      phone: '0532 12',
      kvkkAccepted: true,
    }),
    false,
  );

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: 'Ayşe Yılmaz',
      email: 'gecersiz-eposta',
      kvkkAccepted: true,
    }),
    false,
  );

  assert.equal(
    isPersonalInfoValid({
      ...INITIAL_REGISTRATION_DATA,
      fullName: 'Ayşe Yılmaz',
      phone: '0532 123 45 67',
      email: 'ayse@moodist.com.tr',
      kvkkAccepted: true,
    }),
    true,
  );
});

test('Survey step validation enforces option selection per step', () => {
  assert.equal(isStepValid(2, INITIAL_REGISTRATION_DATA), false);
  assert.equal(isStepValid(3, INITIAL_REGISTRATION_DATA), false);
  assert.equal(isStepValid(4, INITIAL_REGISTRATION_DATA), false);

  const filled = {
    ...INITIAL_REGISTRATION_DATA,
    fullName: 'Mehmet Demir',
    kvkkAccepted: true,
    survey: {
      q1: SURVEY_STEPS[0].options[1],
      q2: SURVEY_STEPS[1].options[0],
      q3: SURVEY_STEPS[2].options[1],
    },
  };

  assert.equal(isStepValid(1, filled), true);
  assert.equal(isStepValid(2, filled), true);
  assert.equal(isStepValid(3, filled), true);
  assert.equal(isStepValid(4, filled), true);
});

test('SURVEY_STEPS defines all three Turkish questions and expected option counts', () => {
  assert.equal(SURVEY_STEPS.length, 3);
  assert.equal(getSurveyDefinition(2).options.length, 3);
  assert.equal(getSurveyDefinition(3).options.length, 5);
  assert.equal(getSurveyDefinition(4).options.length, 3);
  assert.equal(getSurveyDefinition(4).primaryActionLabel, 'Sıra Al');
});

test('formatTrackingCode pads numbers below 100 to 2 digits and preserves 100+', () => {
  assert.equal(formatTrackingCode(1), 'VR-01');
  assert.equal(formatTrackingCode(9), 'VR-09');
  assert.equal(formatTrackingCode(10), 'VR-10');
  assert.equal(formatTrackingCode(99), 'VR-99');
  assert.equal(formatTrackingCode(100), 'VR-100');
  assert.equal(formatTrackingCode(125), 'VR-125');
  assert.throws(() => formatTrackingCode(0));
  assert.throws(() => formatTrackingCode(-3));
});

test('isActiveQueueStatus treats completed as inactive and other states as active', () => {
  assert.equal(isActiveQueueStatus('waiting'), true);
  assert.equal(isActiveQueueStatus('called'), true);
  assert.equal(isActiveQueueStatus('in_progress'), true);
  assert.equal(isActiveQueueStatus('completed'), false);
});

test('buildPublicQueuePayload contains strictly non-PII queue fields', () => {
  const payload = buildPublicQueuePayload('VR-04', 4, 'SERVER_TS');
  assert.deepEqual(Object.keys(payload).sort(), [
    'code',
    'createdAt',
    'lastSkippedAt',
    'queueOrder',
    'skipCount',
    'status',
  ]);
  assert.equal(payload.code, 'VR-04');
  assert.equal(payload.queueOrder, 4);
  assert.equal(payload.status, 'waiting');
  assert.equal(payload.skipCount, 0);
  assert.equal(payload.lastSkippedAt, null);
});

test('buildContactLockPayload creates exact contact_locks document shape', () => {
  const payload = buildContactLockPayload('VR-09', 'SERVER_TS');
  assert.deepEqual(payload, {
    code: 'VR-09',
    active: true,
    createdAt: 'SERVER_TS',
  });
});

test('buildPrivateRegistrationPayload trims fields and defaults optional contact fields to empty strings', () => {
  const payload = buildPrivateRegistrationPayload(
    'VR-07',
    {
      fullName: '  Deniz Kaya  ',
      phone: '   ',
      email: '',
      kvkkAccepted: true,
      survey: {
        q1: 'İlk kez burada duyuyorum',
        q2: 'Travma ve Stres Yönetimi',
        q3: 'Teknolojiyi yakından tanımak',
      },
    },
    'SERVER_TS',
  );

  assert.equal(payload.code, 'VR-07');
  assert.equal(payload.fullName, 'Deniz Kaya');
  assert.equal(payload.phone, '');
  assert.equal(payload.email, '');
  assert.equal(payload.kvkkAccepted, true);
  assert.equal(payload.kvkkAcceptedAt, 'SERVER_TS');
  assert.equal(payload.createdAt, 'SERVER_TS');
  assert.equal(payload.survey.q2, 'Travma ve Stres Yönetimi');
});

test('createRegistrationRecord stores Firestore code, trimmed info, and isExisting flag', () => {
  const fixedDate = new Date('2026-11-23T12:00:00.000Z');
  const record = createRegistrationRecord(
    'VR-12',
    {
      fullName: '  Deniz Kaya  ',
      phone: '  0532 000 00 00 ',
      email: '  deniz@example.com ',
      kvkkAccepted: true,
      survey: {
        q1: 'İlk kez burada duyuyorum',
        q2: 'Travma ve Stres Yönetimi',
        q3: 'Teknolojiyi yakından tanımak',
      },
    },
    fixedDate,
    true,
  );

  assert.equal(record.code, 'VR-12');
  assert.equal(record.fullName, 'Deniz Kaya');
  assert.equal(record.phone, '0532 000 00 00');
  assert.equal(record.email, 'deniz@example.com');
  assert.equal(record.createdAtIso, '2026-11-23T12:00:00.000Z');
  assert.equal(record.isExisting, true);
});

test('formatFirestoreRegistrationError maps known Firestore error codes to Turkish messages', () => {
  assert.match(formatFirestoreRegistrationError({ code: 'permission-denied' }), /yetki/i);
  assert.match(formatFirestoreRegistrationError({ code: 'unavailable' }), /bağlantı/i);
  assert.match(formatFirestoreRegistrationError(new Error('unknown')), /hata/i);
});
