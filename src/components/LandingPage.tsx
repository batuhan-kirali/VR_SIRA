import { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, UserCheck } from 'lucide-react';
import { BrandLogoBox } from './BrandLogoBox';

interface LandingPageProps {
  onJoinQueue: () => void;
  onCheckQueue: () => void;
  onOpenAdmin: () => void;
}

export function LandingPage({ onJoinQueue, onCheckQueue, onOpenAdmin }: LandingPageProps) {
  const [heroError, setHeroError] = useState(false);

  return (
    <div
      data-testid="landing-page"
      className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden px-5 pt-6 pb-5 sm:px-6 sm:pt-8 sm:pb-7"
    >
      {/* Görevli girişi için sağ üstte silik kilit ikonu */}
      <button
        type="button"
        onClick={onOpenAdmin}
        aria-label="Görevli Girişi"
        title="Görevli Girişi"
        data-testid="landing-admin-lock"
        className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-xl text-white opacity-25 transition-opacity duration-150 hover:opacity-80 focus-visible:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 sm:top-4 sm:right-4"
      >
        <Lock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </button>

      {/* 1. Üst Logo Alanı (kutusuz, doğrudan koyu #444F6F zemin üzerinde) */}
      <header className="relative z-10 flex shrink-0 items-center justify-center">
        <BrandLogoBox logoSrc="/logo.png" fallbackText="MOODIST HASTANESİ" />
      </header>

      {/* 2. Orta 3D VR Görsel Alanı (radial mask ile koyu zemine kusursuz geçiş) */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center py-1">
        {!heroError ? (
          <img
            src="/vr-hero.png"
            alt="360° VR Terapi Gözlüğü"
            referrerPolicy="no-referrer"
            onError={() => setHeroError(true)}
            className="vr-hero-mask aspect-square h-[min(256px,31dvh)] w-[min(256px,31dvh)] sm:h-[min(272px,33dvh)] sm:w-[min(272px,33dvh)] select-none object-contain"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-48 w-48 items-center justify-center rounded-full border border-white/15 bg-white/[0.05] text-sm font-medium text-[#BFC6DD]"
          >
            360° VR Terapi
          </div>
        )}
      </div>

      {/* 3. Alt Cam Efektli Kart + 4. Alt Aksiyon Alanı */}
      <main className="relative z-10 flex shrink-0 flex-col gap-4">
        <section
          aria-labelledby="landing-hero-title"
          className="moodist-glass-card p-5 text-center"
        >
          <h1
            id="landing-hero-title"
            className="font-[var(--font-display)] text-[22px] font-bold leading-[1.26] tracking-[-0.02em] text-white [text-wrap:balance]"
          >
            Sanal Gerçeklikle Güvenli Yüzleşme: VR Terapi
          </h1>

          <p className="mx-auto mt-2.5 max-w-[34ch] text-[14px] leading-[1.56] text-[#BFC6DD]">
            360° sanal gerçeklik teknolojisinin ruh sağlığı ve terapi süreçlerinde nasıl
            kullanıldığını uzman eşliğinde deneyimleyin.
          </p>

          <ul
            aria-label="Deneyim özellikleri"
            className="mt-4 flex flex-wrap items-center justify-center gap-2"
          >
            <li className="moodist-glass-badge inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-white/90 sm:px-3.5 sm:text-xs">
              <ShieldCheck
                className="h-3.5 w-3.5 shrink-0 text-[#B1C6FC]"
                strokeWidth={2.1}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">Güvenli &amp; Kontrollü</span>
            </li>

            <li className="moodist-glass-badge inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-medium text-white/90 sm:px-3.5 sm:text-xs">
              <UserCheck
                className="h-3.5 w-3.5 shrink-0 text-[#B1C6FC]"
                strokeWidth={2.1}
                aria-hidden="true"
              />
              <span className="whitespace-nowrap">Uzman rehberliği</span>
            </li>
          </ul>
        </section>

        <footer className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onJoinQueue}
            className="moodist-primary-btn group flex min-h-[54px] w-full items-center justify-center gap-2 px-6 py-4 text-[15.5px] font-bold tracking-[-0.01em] transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span className="whitespace-nowrap">Deneyim Sırası Al</span>
            <ArrowRight
              className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
              strokeWidth={2.3}
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            onClick={onCheckQueue}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-white/75 underline-offset-4 transition-colors duration-150 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap"
          >
            Kaçıncı Sıradayım
          </button>
        </footer>
      </main>
    </div>
  );
}
