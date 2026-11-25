import QRCode from 'qrcode';

export const STAND_QR_FILENAME = 'moodist-vr-stand-qr.png';

/**
 * Cleans trailing /admin or #/admin path segments from a base URL
 * so stand QR codes always point visitors to the main landing page.
 */
export function normalizeStandUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/#\/?admin\/?$/i, '')
    .replace(/\/admin\/?$/i, '')
    .replace(/\/+$/, '');
}

/**
 * Returns the default visitor URL based on window.location.origin
 * with any trailing /admin or #/admin segment stripped.
 */
export function getDefaultStandUrl(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return normalizeStandUrl(window.location.origin);
}

/**
 * Generates a high-resolution (1024x1024) PNG data URL completely client-side
 * using the `qrcode` library (no external API dependency).
 */
export async function generateStandQrDataUrl(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('QR kod oluşturmak için geçerli bir bağlantı girin.');
  }

  return QRCode.toDataURL(trimmed, {
    width: 1024,
    margin: 4,
    type: 'image/png',
    errorCorrectionLevel: 'M',
    color: {
      dark: '#1C2334',
      light: '#FFFFFF',
    },
  });
}

/**
 * Triggers a browser download for the generated QR PNG data URL.
 */
export function downloadStandQrPng(
  dataUrl: string,
  filename: string = STAND_QR_FILENAME,
): void {
  if (!dataUrl || typeof document === 'undefined') {
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
