import { useState } from 'react';
import { resolveLogoLoadState, type LogoStatus } from '../utils/config';

interface BrandLogoBoxProps {
  logoSrc?: string;
  fallbackText?: string;
}

export function BrandLogoBox({
  logoSrc = '/logo.png',
  fallbackText = 'MOODIST HASTANESİ',
}: BrandLogoBoxProps) {
  const [status, setStatus] = useState<LogoStatus>('loading');

  return (
    <div
      data-testid="brand-logo-area"
      className="relative mx-auto flex min-h-[40px] max-w-full items-center justify-center"
    >
      {status !== 'fallback' && (
        <img
          src={logoSrc}
          alt="Moodist Hastanesi"
          referrerPolicy="no-referrer"
          onLoad={(event) => {
            const img = event.currentTarget;
            setStatus(resolveLogoLoadState(img.naturalWidth, img.naturalHeight));
          }}
          onError={() => setStatus('fallback')}
          className={
            status === 'loaded'
              ? 'h-10 w-auto max-w-[230px] object-contain drop-shadow-[0_2px_12px_rgba(12,18,34,0.28)]'
              : 'pointer-events-none absolute h-0 w-0 opacity-0'
          }
        />
      )}

      {status !== 'loaded' && (
        <span className="font-[var(--font-display)] text-[15px] font-semibold uppercase tracking-[0.22em] text-white/95 whitespace-nowrap">
          {fallbackText}
        </span>
      )}
    </div>
  );
}
