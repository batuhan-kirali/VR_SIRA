import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  BatteryCharging,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  Users,
  Volume2,
} from 'lucide-react';
import { db } from '../firebase';
import { BrandLogoBox } from './BrandLogoBox';
import {
  playCallChime,
  triggerCallVibration,
  unlockAudioContext,
} from '../utils/audio';
import { MOODIST_VR_CODE_STORAGE_KEY } from '../utils/registration';
import {
  DEFAULT_SYSTEM_STATUS,
  computeLiveQueueMetrics,
  normalizePublicQueueItem,
  normalizeSystemStatus,
  type PublicQueueItem,
  type SystemStatus,
} from '../utils/liveQueue';

interface LiveQueueScreenProps {
  code: string;
  isExisting?: boolean;
  onReturnHome: () => void;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

type NavigatorWithWakeLock = {
  wakeLock?: {
    request?: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

const CHARGING_TICK_MS = 15_000;

export function LiveQueueScreen({
  code,
  isExisting = false,
  onReturnHome,
}: LiveQueueScreenProps) {
  const [queueItems, setQueueItems] = useState<PublicQueueItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(DEFAULT_SYSTEM_STATUS);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const hasNotifiedCalledRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  // Subscribe to public_queue without where/orderBy combinations to avoid composite index errors
  useEffect(() => {
    if (!db) {
      setSnapshotError('Firebase veritabanı bağlantısı bulunamadı.');
      setQueueLoaded(true);
      return;
    }

    const queueRef = collection(db, 'public_queue');
    const unsubscribeQueue = onSnapshot(
      queueRef,
      (snapshot) => {
        const parsed = snapshot.docs.map((docSnap) =>
          normalizePublicQueueItem(docSnap.id, docSnap.data() as Record<string, unknown>),
        );
        setQueueItems(parsed);
        setQueueLoaded(true);
        setSnapshotError(null);
      },
      () => {
        setSnapshotError('Canlı sıra verileri alınamadı. Bağlantınız kontrol ediliyor.');
        setQueueLoaded(true);
      },
    );

    const statusRef = doc(db, 'system_status', 'main');
    const unsubscribeStatus = onSnapshot(
      statusRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setSystemStatus(DEFAULT_SYSTEM_STATUS);
          return;
        }
        setSystemStatus(normalizeSystemStatus(docSnap.data() as Record<string, unknown>));
      },
      () => {
        setSystemStatus(DEFAULT_SYSTEM_STATUS);
      },
    );

    return () => {
      unsubscribeQueue();
      unsubscribeStatus();
    };
  }, []);

  // Re-evaluate remaining charging minutes every 15 seconds while charging is active
  useEffect(() => {
    if (!systemStatus.isCharging) {
      return;
    }
    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, CHARGING_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [systemStatus.isCharging, systemStatus.chargingEndTimeMs]);

  const metrics = useMemo(
    () => computeLiveQueueMetrics(queueItems, code, systemStatus, nowMs),
    [queueItems, code, systemStatus, nowMs],
  );

  const currentStatus = metrics.myEntry?.status ?? 'waiting';
  const skipCount = metrics.myEntry?.skipCount ?? 0;
  const isCalled = currentStatus === 'called';
  const isCompleted = currentStatus === 'completed';
  const isWaiting = !isCalled && !isCompleted;
  const isNotFound = queueLoaded && !snapshotError && metrics.myEntry === null;

  // One-shot chime + vibration when status transitions to 'called'
  useEffect(() => {
    if (isCalled) {
      if (!hasNotifiedCalledRef.current) {
        hasNotifiedCalledRef.current = true;
        playCallChime();
        triggerCallVibration();
      }
      return;
    }

    // Reset so if visitor is skipped and called again later, the alert fires again
    hasNotifiedCalledRef.current = false;
  }, [isCalled]);

  // Screen Wake Lock while actively waiting or called, re-acquired on visibility return
  useEffect(() => {
    const shouldKeepAwake = !isNotFound && (isWaiting || isCalled);

    const releaseWakeLock = async () => {
      const sentinel = wakeLockRef.current;
      wakeLockRef.current = null;
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
          // Silently ignore release failures.
        }
      }
    };

    if (!shouldKeepAwake) {
      void releaseWakeLock();
      return;
    }

    let cancelled = false;

    const requestWakeLock = async () => {
      try {
        const nav = navigator as unknown as NavigatorWithWakeLock;
        if (!nav.wakeLock || typeof nav.wakeLock.request !== 'function') {
          return;
        }
        if (document.visibilityState !== 'visible') {
          return;
        }
        if (wakeLockRef.current && !wakeLockRef.current.released) {
          return;
        }
        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        // Silently ignore unsupported browsers or power-saving rejections.
      }
    };

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [isWaiting, isCalled, isNotFound]);

  // Clear stored localStorage tracking code as soon as the experience is completed
  useEffect(() => {
    if (!isCompleted) {
      return;
    }
    try {
      window.localStorage.removeItem(MOODIST_VR_CODE_STORAGE_KEY);
    } catch {
      // Ignore storage access errors in private browsing modes.
    }
  }, [isCompleted]);

  const handleManualReplayAlert = () => {
    unlockAudioContext();
    playCallChime();
    triggerCallVibration();
  };

  return (
    <div
      data-testid="live-queue-screen"
      data-queue-status={isNotFound ? 'not-found' : currentStatus}
      className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden px-5 pt-5 pb-5 sm:px-6 sm:pt-7 sm:pb-7"
    >
      {/* Top Logo */}
      <header className="relative z-10 flex shrink-0 items-center justify-center">
        <BrandLogoBox logoSrc="/logo.png" fallbackText="MOODIST HASTANESİ" />
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-3">
        {/* Charging Break Warm Amber Glass Banner */}
        {isWaiting && !isNotFound && metrics.chargingBannerText && (
          <div
            role="status"
            data-testid="charging-banner"
            className="flex w-full shrink-0 items-start gap-2.5 rounded-2xl border border-amber-300/35 bg-amber-400/15 px-3.5 py-2.5 text-left text-[12px] leading-snug text-amber-100 backdrop-blur-xl sm:text-[12.5px]"
          >
            <BatteryCharging
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
              strokeWidth={2.2}
              aria-hidden="true"
            />
            <span>{metrics.chargingBannerText}</span>
          </div>
        )}

        {/* Loading State */}
        {!queueLoaded ? (
          <section
            aria-busy="true"
            className="moodist-glass-card flex w-full flex-col items-center p-6 text-center"
          >
            <Loader2
              className="h-8 w-8 animate-spin text-[#B1C6FC]"
              aria-hidden="true"
            />
            <p className="mt-3 text-[13px] font-medium text-[#BFC6DD]">Takip Kodunuz</p>
            <p
              data-testid="tracking-code"
              className="mt-1 font-[var(--font-display)] text-[38px] font-bold leading-none tracking-[0.04em] text-white tabular-nums"
            >
              {code}
            </p>
            <p className="mt-3 text-[13px] text-[#BFC6DD]">Canlı sıra durumu yükleniyor...</p>
          </section>
        ) : isNotFound ? (
          /* Record Not Found Fallback */
          <section className="moodist-glass-card flex w-full flex-col items-center p-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/20 bg-white/[0.08] text-[#B1C6FC]">
              <Info className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mt-4 font-[var(--font-display)] text-[20px] font-bold text-white">
              Sıra Kaydı Bulunamadı
            </h1>
            <p className="mt-2 max-w-[30ch] text-[13.5px] leading-relaxed text-[#BFC6DD]">
              <span className="font-semibold text-white">{code}</span> koduna ait aktif bir
              sıra kaydı şu anda görünmüyor.
            </p>
          </section>
        ) : isCompleted ? (
          /* COMPLETED STATE */
          <section
            aria-labelledby="completed-heading"
            data-testid="queue-completed-card"
            className="moodist-glass-card flex w-full flex-col items-center p-6 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/25 bg-white/[0.1] text-[#B1C6FC]">
              <CheckCircle2 className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
            </div>

            <p className="mt-4 text-[12px] font-medium text-[#BFC6DD] tabular-nums">
              {code}
            </p>

            <h1
              id="completed-heading"
              className="mt-1.5 font-[var(--font-display)] text-[22px] font-bold leading-snug tracking-[-0.02em] text-white [text-wrap:balance]"
            >
              Deneyiminiz Tamamlandı
            </h1>

            <p className="mt-2.5 max-w-[28ch] text-[14px] leading-[1.55] text-[#BFC6DD]">
              Katılımınız için teşekkür ederiz.
            </p>
          </section>
        ) : isCalled ? (
          /* CALLED STATE (Bright Emerald Glass Accent + Manual Sound Trigger) */
          <section
            aria-labelledby="called-heading"
            data-testid="queue-called-card"
            className="moodist-glass-card-called relative flex w-full flex-col items-center overflow-hidden p-6 text-center"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 left-1/2 h-36 w-56 -translate-x-1/2 rounded-full bg-emerald-400/25 blur-2xl"
            />

            <button
              type="button"
              onClick={handleManualReplayAlert}
              aria-label="Bildirim sesini tekrar çal"
              title="Bildirim sesini çal"
              className="absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200/35 bg-emerald-400/20 text-emerald-100 transition-colors hover:bg-emerald-400/30 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Volume2 className="h-4.5 w-4.5" strokeWidth={2.1} aria-hidden="true" />
            </button>

            <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-200/45 bg-emerald-400/25 text-emerald-100">
              <Sparkles className="h-7 w-7" strokeWidth={2.1} aria-hidden="true" />
            </div>

            <div className="relative z-10 mt-4 w-full rounded-2xl border border-emerald-200/35 bg-emerald-950/35 px-5 py-3.5">
              <p className="text-[12px] font-medium text-emerald-100/85">Takip Kodunuz</p>
              <p
                data-testid="tracking-code"
                className="mt-1 font-[var(--font-display)] text-[42px] font-bold leading-none tracking-[0.04em] text-white tabular-nums"
              >
                {code}
              </p>
            </div>

            <h1
              id="called-heading"
              className="relative z-10 mt-5 font-[var(--font-display)] text-[22px] font-bold leading-[1.28] tracking-[-0.02em] text-white [text-wrap:balance]"
            >
              Sıranız Geldi!
              <span className="mt-1 block text-[17px] font-semibold text-emerald-100">
                VR Deneyim Alanına Buyurun
              </span>
            </h1>
          </section>
        ) : (
          /* WAITING STATE */
          <section
            aria-labelledby="waiting-heading"
            data-testid="queue-waiting-card"
            className="moodist-glass-card flex w-full flex-col items-center p-5 text-center"
          >
            <h1 id="waiting-heading" className="text-[12.5px] font-medium text-[#BFC6DD]">
              Takip Kodunuz
            </h1>

            <p
              data-testid="tracking-code"
              className="mt-1 font-[var(--font-display)] text-[44px] font-bold leading-none tracking-[0.04em] text-white tabular-nums sm:text-[48px]"
            >
              {code}
            </p>

            {/* Two Side-by-Side Glass Stat Boxes */}
            <div className="mt-4 grid w-full grid-cols-2 gap-2.5">
              <div
                data-testid="stat-people-ahead"
                className="flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-3"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#BFC6DD]">
                  <Users className="h-3.5 w-3.5 text-[#B1C6FC]" aria-hidden="true" />
                  <span>Önünüzde</span>
                </div>
                <p className="mt-1 font-[var(--font-display)] text-[19px] font-bold text-white tabular-nums sm:text-[21px]">
                  {metrics.peopleAhead} Kişi
                </p>
              </div>

              <div
                data-testid="stat-estimated-wait"
                className="flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-3"
              >
                <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#BFC6DD]">
                  <Clock className="h-3.5 w-3.5 text-[#B1C6FC]" aria-hidden="true" />
                  <span>Tahmini Bekleme</span>
                </div>
                <p
                  className={`mt-1 font-[var(--font-display)] font-bold text-white tabular-nums ${
                    metrics.estimatedWaitMinutes === 0
                      ? 'text-[14.5px] leading-snug sm:text-[15.5px]'
                      : 'text-[19px] sm:text-[21px]'
                  }`}
                >
                  {metrics.waitTimeLabel}
                </p>
              </div>
            </div>

            {/* Duplicate Registration Subtle Notice */}
            {isExisting && (
              <div
                role="status"
                data-testid="existing-record-notice"
                className="mt-3 flex w-full items-center gap-2 rounded-2xl border border-[#B1C6FC]/25 bg-[#B1C6FC]/10 px-3.5 py-2 text-left text-[12px] leading-snug text-[#E4ECFF]"
              >
                <Info className="h-4 w-4 shrink-0 text-[#B1C6FC]" aria-hidden="true" />
                <span>Aktif bir kaydınız bulundu, mevcut sıranıza yönlendirildiniz.</span>
              </div>
            )}

            {/* Polite Skip Notice (skipCount > 0 and status === 'waiting') */}
            {skipCount > 0 && (
              <div
                role="status"
                data-testid="skip-notice"
                className="mt-3 flex w-full items-start gap-2 rounded-2xl border border-white/18 bg-white/[0.07] px-3.5 py-2.5 text-left text-[11.5px] leading-[1.45] text-[#E4ECFF] sm:text-[12px]"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#B1C6FC]" aria-hidden="true" />
                <span>
                  Sıranız geldiğinde alanda göremediğimiz için hakkınızı koruduk ve bekleyen
                  diğer misafirlerimiz adına sıranızı birkaç kişi sonraya aldık. Alana
                  ulaştığınızda güncel sıranızı bu ekrandan takip etmeye devam edebilirsiniz.
                </span>
              </div>
            )}
          </section>
        )}

        {/* Snapshot Connection Error Notice */}
        {snapshotError && (
          <div
            role="alert"
            className="flex w-full shrink-0 items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/15 px-3.5 py-2.5 text-[12px] text-rose-100 backdrop-blur-xl"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-200" aria-hidden="true" />
            <span>{snapshotError}</span>
          </div>
        )}
      </main>

      {/* Bottom Footer Area */}
      <footer className="relative z-10 flex shrink-0 flex-col items-center pt-1">
        {isCompleted || isNotFound ? (
          <button
            type="button"
            onClick={onReturnHome}
            className="moodist-primary-btn flex min-h-[54px] w-full items-center justify-center gap-2 px-6 py-4 text-[15px] font-bold tracking-[-0.01em] transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <RotateCcw className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            <span className="whitespace-nowrap">Ana Sayfaya Dön</span>
          </button>
        ) : (
          <p
            data-testid="keep-tab-open-note"
            className="w-full rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-center text-[12px] leading-snug text-[#BFC6DD] backdrop-blur-md"
          >
            Sıranız geldiğinde uyarı alabilmek için bu sekmeyi kapatmayın.
          </p>
        )}
      </footer>
    </div>
  );
}
