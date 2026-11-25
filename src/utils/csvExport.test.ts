import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ADMIN_CSV_HEADERS,
  UTF8_BOM,
  buildAdminCsvFilename,
  buildAdminEntriesCsv,
  escapeCsvCell,
  formatQueueStatusLabel,
  formatTurkishDateTime,
} from './csvExport.ts';
import type { AdminQueueEntry } from '../services/adminService.ts';

test('escapeCsvCell handles semicolons, double quotes, and newlines per RFC-4180', () => {
  assert.equal(escapeCsvCell('Ayşe Çelik'), 'Ayşe Çelik');
  assert.equal(escapeCsvCell('Kaygı; Fobi'), '"Kaygı; Fobi"');
  assert.equal(escapeCsvCell('Test "VR" Notu'), '"Test ""VR"" Notu"');
  assert.equal(escapeCsvCell('Satır 1\nSatır 2'), '"Satır 1\nSatır 2"');
  assert.equal(escapeCsvCell('Satır 1\r\nSatır 2'), '"Satır 1\r\nSatır 2"');
  assert.equal(escapeCsvCell(null), '');
});

test('formatQueueStatusLabel maps waiting, called, and completed to Turkish labels', () => {
  assert.equal(formatQueueStatusLabel('waiting'), 'Bekliyor');
  assert.equal(formatQueueStatusLabel('called'), 'Çağrıldı');
  assert.equal(formatQueueStatusLabel('completed'), 'Tamamlandı');
});

test('formatTurkishDateTime formats Firestore Timestamp and Date into GG.AA.YYYY SS:DD', () => {
  const localDate = new Date(2026, 4, 7, 9, 5); // 07.05.2026 09:05 local time
  assert.equal(formatTurkishDateTime(localDate), '07.05.2026 09:05');

  const fakeTimestamp = { toMillis: () => localDate.getTime() };
  assert.equal(formatTurkishDateTime(fakeTimestamp), '07.05.2026 09:05');
  assert.equal(formatTurkishDateTime(null), '');
});

test('buildAdminCsvFilename formats date as moodist-vr-kayitlar-YYYY-MM-DD.csv', () => {
  assert.equal(
    buildAdminCsvFilename(new Date(2026, 10, 5)),
    'moodist-vr-kayitlar-2026-11-05.csv',
  );
});

test('buildAdminEntriesCsv outputs UTF-8 BOM, semicolon headers, Turkish chars, and exact 12 columns', () => {
  const created = new Date(2026, 3, 18, 14, 30);
  const completed = new Date(2026, 3, 18, 14, 42);

  const entries: AdminQueueEntry[] = [
    {
      code: 'VR-01',
      queueOrder: 1,
      status: 'completed',
      skipCount: 1,
      lastSkippedAt: null,
      createdAt: { toMillis: () => created.getTime() },
      calledAt: null,
      completedAt: { toMillis: () => completed.getTime() },
      fullName: 'İsmail Şahin; "Örnek"',
      phone: '0532 111 22 33',
      email: 'ismail@example.com',
      kvkkAccepted: true,
      survey: {
        q1: 'Evet, duydum',
        q2: 'Yükseklik / Uçuş korkusu',
        q3: 'Gerçekçi deneyim\nve bilgi',
      },
    },
    {
      code: 'VR-02',
      queueOrder: 2,
      status: 'waiting',
      skipCount: 0,
      lastSkippedAt: null,
      createdAt: created.getTime(),
      calledAt: null,
      completedAt: null,
      fullName: 'Gülçin Öztürk',
      phone: '',
      email: '',
      kvkkAccepted: false,
    },
  ];

  const csv = buildAdminEntriesCsv(entries);

  assert.ok(csv.startsWith(UTF8_BOM), 'CSV must start with UTF-8 BOM');
  const withoutBom = csv.slice(1);
  const expectedHeader = ADMIN_CSV_HEADERS.join(';');
  assert.ok(withoutBom.startsWith(`${expectedHeader}\r\n`));

  const lines = withoutBom.split('\r\n');
  // Row 1 contains an embedded \n (not \r\n), so splitting by \r\n yields header + 2 rows
  assert.equal(lines.length, 3);
  assert.equal(
    lines[1],
    'VR-01;"İsmail Şahin; ""Örnek""";0532 111 22 33;ismail@example.com;Evet;Tamamlandı;1;Evet, duydum;Yükseklik / Uçuş korkusu;"Gerçekçi deneyim\nve bilgi";18.04.2026 14:30;18.04.2026 14:42',
  );
  assert.equal(
    lines[2],
    'VR-02;Gülçin Öztürk;;;Hayır;Bekliyor;0;;;;18.04.2026 14:30;',
  );
});
