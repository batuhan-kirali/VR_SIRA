import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Loader2, QrCode, X } from 'lucide-react';
import {
  downloadStandQrPng,
  generateStandQrDataUrl,
  getDefaultStandUrl,
} from '../utils/qrCode';

interface StandQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand fallback in restricted iframes.
    }
  }

  if (typeof document === 'undefined') {
    return false;
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function StandQrModal({ isOpen, onClose }: StandQrModalProps) {
  const [targetUrl, setTargetUrl] = useState<string>(() => getDefaultStandUrl());
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const trimmed = targetUrl.trim();
    if (!trimmed) {
      setQrDataUrl(null);
      setQrError('QR kod oluşturmak için bir hedef bağlantı girin.');
      setIsGenerating(false);
      return;
    }

    let cancelled = false;
    setIsGenerating(true);
    setQrError(null);

    void generateStandQrDataUrl(trimmed)
      .then((dataUrl) => {
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        setQrError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setQrDataUrl(null);
        setQrError('QR kod oluşturulamadı. Bağlantıyı kontrol edin.');
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenerating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetUrl]);

  if (!isOpen) {
    return null;
  }

  const handleCopy = async () => {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    const didCopy = await copyTextToClipboard(trimmed);
    if (!didCopy) return;

    setCopied(true);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stand-qr-modal-title"
      data-testid="stand-qr-modal"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0C1222]/75 px-4 py-6 backdrop-blur-md"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="moodist-glass-card relative w-full max-w-md overflow-hidden p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-[#B1C6FC]">
              <QrCode className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="stand-qr-modal-title"
                className="font-[var(--font-display)] text-base font-bold tracking-[-0.015em] text-white sm:text-lg"
              >
                VR Terapi Stand QR Kodu
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-[#BFC6DD]">
                Ziyaretçiler bu kodu okutarak doğrudan sıra alabilir.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Modalı kapat"
            data-testid="stand-qr-close-btn"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white/80 transition-colors hover:bg-white/[0.14] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Beyaz yuvarlatılmış çerçeve içinde QR görseli */}
        <div className="mt-5 flex justify-center">
          <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-white p-3.5 shadow-[0_18px_42px_-16px_rgba(6,10,22,0.72)] sm:h-60 sm:w-60">
            {isGenerating && !qrDataUrl ? (
              <Loader2
                className="h-7 w-7 animate-spin text-[#444F6F]"
                aria-label="QR kod hazırlanıyor"
              />
            ) : qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="VR Terapi Stand QR Kodu"
                referrerPolicy="no-referrer"
                data-testid="stand-qr-image"
                className="h-full w-full object-contain"
              />
            ) : (
              <p className="px-4 text-center text-xs font-medium text-[#444F6F]">
                {qrError || 'Bağlantı bekleniyor'}
              </p>
            )}
          </div>
        </div>

        {/* Düzenlenebilir Hedef Bağlantı alanı */}
        <div className="mt-5">
          <label
            htmlFor="stand-qr-url-input"
            className="mb-1.5 block text-xs font-medium text-white/85"
          >
            Hedef Bağlantı
          </label>
          <input
            id="stand-qr-url-input"
            type="url"
            value={targetUrl}
            onChange={(event) => {
              setTargetUrl(event.target.value);
              if (copied) setCopied(false);
            }}
            placeholder="https://moodist-vr-sira.web.app"
            data-testid="stand-qr-url-input"
            className="moodist-glass-input px-3.5 py-2.5 text-xs sm:text-sm"
          />
          {qrError && (
            <p className="mt-1.5 text-[11.5px] text-rose-200" role="alert">
              {qrError}
            </p>
          )}
        </div>

        {/* Aksiyon Butonları */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <button
            type="button"
            disabled={!qrDataUrl || isGenerating}
            onClick={() => {
              if (qrDataUrl) {
                downloadStandQrPng(qrDataUrl);
              }
            }}
            data-testid="stand-qr-download-btn"
            className="moodist-primary-btn inline-flex min-h-[44px] items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold tracking-[-0.01em] transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap sm:text-[13px]"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>PNG İndir</span>
          </button>

          <button
            type="button"
            disabled={!targetUrl.trim()}
            onClick={() => {
              void handleCopy();
            }}
            data-testid="stand-qr-copy-btn"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.08] px-4 py-2.5 text-xs font-semibold text-white transition-colors duration-150 hover:border-white/35 hover:bg-white/[0.15] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap sm:text-[13px]"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                <span className="text-emerald-100">Kopyalandı ✓</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 shrink-0 text-[#B1C6FC]" aria-hidden="true" />
                <span>Bağlantıyı Kopyala</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
