import type { AdminQueueEntry } from '../services/adminService';
import { parseTimestampToMillis } from './liveQueue';

export const UTF8_BOM = '\uFEFF';
export const CSV_DELIMITER = ';';

export const ADMIN_CSV_HEADERS = [
  'Takip Kodu',
  'Ad Soyad',
  'Telefon',
  'E-posta',
  'KVKK Onayı',
  'Durum',
  'Pas Sayısı',
  'VR Terapi Farkındalığı',
  'İlgi Alanı',
  'Beklenti',
  'Kayıt Zamanı',
  'Tamamlanma Zamanı',
] as const;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Escapes a single CSV cell according to RFC-4180 using semicolon as delimiter.
 * Wraps the cell in double quotes whenever it contains quotes, semicolons, or newlines.
 */
export function escapeCsvCell(rawValue: string | number | null | undefined): string {
  const value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (
    value.includes('"') ||
    value.includes(CSV_DELIMITER) ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formats Firestore Timestamp / Date / epoch ms into Turkish GG.AA.YYYY SS:DD format.
 */
export function formatTurkishDateTime(timestamp: unknown): string {
  const millis = parseTimestampToMillis(timestamp);
  if (millis === null) {
    return '';
  }

  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());

  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

export function formatQueueStatusLabel(status: string): string {
  switch (status) {
    case 'waiting':
      return 'Bekliyor';
    case 'called':
      return 'Çağrıldı';
    case 'completed':
      return 'Tamamlandı';
    default:
      return status;
  }
}

export function buildAdminCsvFilename(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  return `moodist-vr-kayitlar-${year}-${month}-${day}.csv`;
}

/**
 * Serializes merged admin queue entries into a Turkish Windows Excel-compatible CSV string
 * (UTF-8 BOM + semicolon delimiter + RFC-4180 escaping).
 */
export function buildAdminEntriesCsv(entries: readonly AdminQueueEntry[]): string {
  const headerLine = ADMIN_CSV_HEADERS.map((header) => escapeCsvCell(header)).join(
    CSV_DELIMITER,
  );

  const dataLines = entries.map((entry) => {
    const row = [
      entry.code,
      entry.fullName,
      entry.phone,
      entry.email,
      entry.kvkkAccepted ? 'Evet' : 'Hayır',
      formatQueueStatusLabel(entry.status),
      entry.skipCount,
      entry.survey?.q1 ?? '',
      entry.survey?.q2 ?? '',
      entry.survey?.q3 ?? '',
      formatTurkishDateTime(entry.createdAt),
      formatTurkishDateTime(entry.completedAt),
    ];

    return row.map((cell) => escapeCsvCell(cell)).join(CSV_DELIMITER);
  });

  return `${UTF8_BOM}${[headerLine, ...dataLines].join('\r\n')}`;
}

/**
 * Triggers an immediate browser download of the generated UTF-8 BOM CSV file.
 */
export function downloadAdminEntriesCsv(
  entries: readonly AdminQueueEntry[],
  now: Date = new Date(),
): void {
  if (entries.length === 0 || typeof document === 'undefined') {
    return;
  }

  const csvContent = buildAdminEntriesCsv(entries);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = buildAdminCsvFilename(now);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
