import { useEffect, useState, type FormEvent } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import {
  ArrowLeft,
  BatteryCharging,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  Lock,
  LogOut,
  Phone,
  QrCode,
  RotateCcw,
  Users,
  X,
  ZapOff,
} from 'lucide-react';
import { auth } from '../firebase';
import { BrandLogoBox } from './BrandLogoBox';
import { StandQrModal } from './StandQrModal';
import { formatFirebaseAuthError, validateAdminCredentials } from '../utils/adminAuth';
import { downloadAdminEntriesCsv } from '../utils/csvExport';
import { formatPhoneDisplay } from '../utils/hash';
import {
  DEFAULT_SYSTEM_STATUS,
  computeRemainingChargingMinutes,
  type SystemStatus,
} from '../utils/liveQueue';
import {
  callParticipant,
  completeParticipant,
  endChargingBreak,
  skipParticipant,
  startChargingBreak,
  subscribeAdminQueue,
  subscribeSystemStatus,
  type AdminQueueBuckets,
  type AdminQueueEntry,
} from '../services/adminService';

const CHARGING_TICK_MS = 15_000;
const CHARGING_BREAK_OPTIONS = [15, 20, 30] as const;

type PendingChargingAction = { type: 'start'; minutes: number } | { type: 'end' } | null;

type PendingAdminAction =
  | { type: 'complete'; code: string }
  | { type: 'skip'; code: string }
  | { type: 'call'; code: string }
  | { type: 'call-next'; code: string }
  | null;

function formatAdminActionError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'permission-denied':
      return 'Bu işlem için yetkiniz bulunmuyor. Lütfen oturumunuzu kontrol edin.';
    case 'unavailable':
      return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
    case 'not-found':
      return 'İlgili sıra kaydı bulunamadı veya zaten güncellenmiş.';
    default:
      return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.';
  }
}

interface AdminPanelProps {
  onReturnToVisitor: () => void;
}

const EMPTY_BUCKETS: AdminQueueBuckets = {
  called: [],
  waiting: [],
  completed: [],
  all: [],
};

function renderFormattedPhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) return '';
  return formatPhoneDisplay(trimmed) || trimmed;
}

function ParticipantIdentity({
  entry,
  position,
  emphasized = false,
}: {
  entry: AdminQueueEntry;
  position?: number;
  emphasized?: boolean;
}) {
  const formattedPhone = renderFormattedPhone(entry.phone);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {typeof position === 'number' && (
          <span className="w-6 shrink-0 text-right text-xs font-medium text-[#BFC6DD]/70 tabular-nums">
            {position}.
          </span>
        )}
        <span
          className={`shrink-0 font-mono font-bold tracking-tight tabular-nums ${
            emphasized ? 'text-xl text-white sm:text-2xl' : 'text-[15px] text-white'
          }`}
        >
          {entry.code}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-semibold ${
              emphasized ? 'text-base text-white sm:text-lg' : 'text-sm text-white/95'
            }`}
          >
            {entry.fullName || 'İsimsiz Kayıt'}
          </p>
          {formattedPhone && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#BFC6DD] tabular-nums">
              <Phone className="h-3 w-3 shrink-0 text-[#B1C6FC]/80" aria-hidden="true" />
              <span className="truncate">{formattedPhone}</span>
            </p>
          )}
        </div>
      </div>

      {entry.skipCount > 0 && (
        <span className="inline-flex w-fit shrink-0 items-center self-start rounded-full border border-amber-300/35 bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-100 tabular-nums sm:self-center whitespace-nowrap">
          {entry.skipCount} kez pas geçildi
        </span>
      )}
    </div>
  );
}

export function AdminPanel({ onReturnToVisitor }: AdminPanelProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => auth !== null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(
    auth === null ? 'Firebase kimlik doğrulama yapılandırması bulunamadı.' : null,
  );

  // Live merged queue state (subscribed only while staff user is signed in)
  const [buckets, setBuckets] = useState<AdminQueueBuckets>(EMPTY_BUCKETS);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAdminAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Live VR charging break status (system_status/main)
  const [systemStatus, setSystemStatus] = useState<SystemStatus>(DEFAULT_SYSTEM_STATUS);
  const [chargingNowMs, setChargingNowMs] = useState<number>(() => Date.now());
  const [pendingChargingAction, setPendingChargingAction] =
    useState<PendingChargingAction>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  useEffect(() => {
    if (!auth) {
      setIsAuthChecking(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthChecking(false);
      if (currentUser) {
        setAuthError(null);
        setPassword('');
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setBuckets(EMPTY_BUCKETS);
      setIsQueueLoading(false);
      setQueueError(null);
      setPendingAction(null);
      setActionError(null);
      setIsQrModalOpen(false);
      return;
    }

    setIsQueueLoading(true);
    setQueueError(null);

    const unsubscribe = subscribeAdminQueue(
      (nextBuckets) => {
        setBuckets(nextBuckets);
        setIsQueueLoading(false);
        setQueueError(null);
      },
      (message) => {
        setQueueError(message);
        setIsQueueLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSystemStatus(DEFAULT_SYSTEM_STATUS);
      setPendingChargingAction(null);
      return;
    }

    const unsubscribe = subscribeSystemStatus(
      (nextStatus) => {
        setSystemStatus(nextStatus);
        setChargingNowMs(Date.now());
      },
      (message) => {
        setActionError(message);
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!systemStatus.isCharging) {
      return;
    }
    setChargingNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setChargingNowMs(Date.now());
    }, CHARGING_TICK_MS);

    return () => window.clearInterval(intervalId);
  }, [systemStatus.isCharging, systemStatus.chargingEndTimeMs]);

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!auth) {
      setAuthError('Firebase kimlik doğrulama bağlantısı kullanılamıyor.');
      return;
    }

    const validation = validateAdminCredentials(email, password);
    if (!validation.valid) {
      setAuthError(validation.errorMessage);
      return;
    }

    setAuthError(null);
    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (error) {
      setAuthError(formatFirebaseAuthError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth || isSigningOut) return;
    setIsSigningOut(true);
    setAuthError(null);
    try {
      await signOut(auth);
    } catch {
      setAuthError('Çıkış yapılırken bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const isActionBusy = pendingAction !== null;
  const hasActiveCalled = buckets.called.length > 0;

  const runQueueAction = async (
    action: Exclude<PendingAdminAction, null>,
    operation: () => Promise<unknown>,
  ) => {
    if (isActionBusy) return;
    setActionError(null);
    setPendingAction(action);
    try {
      await operation();
    } catch (error) {
      setActionError(formatAdminActionError(error));
    } finally {
      setPendingAction(null);
    }
  };

  const handleCallParticipant = (code: string, mode: 'call' | 'call-next' = 'call') => {
    if (hasActiveCalled || isActionBusy) return;
    void runQueueAction({ type: mode, code }, () => callParticipant(code));
  };

  const handleCompleteParticipant = (entry: AdminQueueEntry) => {
    void runQueueAction({ type: 'complete', code: entry.code }, () =>
      completeParticipant(entry),
    );
  };

  const handleSkipParticipant = (entry: AdminQueueEntry) => {
    void runQueueAction({ type: 'skip', code: entry.code }, () =>
      skipParticipant(entry, buckets.waiting),
    );
  };

  const isChargingBusy = pendingChargingAction !== null;
  const remainingChargingMinutes = computeRemainingChargingMinutes(
    systemStatus.isCharging,
    systemStatus.chargingEndTimeMs,
    chargingNowMs,
  );

  const handleStartChargingBreak = async (minutes: number) => {
    if (isChargingBusy) return;
    setActionError(null);
    setPendingChargingAction({ type: 'start', minutes });
    try {
      await startChargingBreak(minutes);
      setChargingNowMs(Date.now());
    } catch (error) {
      setActionError(formatAdminActionError(error));
    } finally {
      setPendingChargingAction(null);
    }
  };

  const handleEndChargingBreak = async () => {
    if (isChargingBusy) return;
    setActionError(null);
    setPendingChargingAction({ type: 'end' });
    try {
      await endChargingBreak();
    } catch (error) {
      setActionError(formatAdminActionError(error));
    } finally {
      setPendingChargingAction(null);
    }
  };

  return (
    <div
      data-testid="admin-panel"
      className="relative h-[100dvh] min-h-[100dvh] w-full overflow-y-auto bg-gradient-to-b from-[#444F6F] via-[#242F4E] to-[#1C2334] text-white"
    >
      {/* Fixed ambient glows matching the dark atmospheric theme without interfering with scrolling */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[28rem] -translate-x-1/2 rounded-full bg-[#96ABDF]/20 blur-3xl" />
        <div className="absolute top-[38%] left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#B1C6FC]/12 blur-3xl" />
        <div className="absolute -bottom-24 left-1/2 h-72 w-[30rem] -translate-x-1/2 rounded-full bg-[#96ABDF]/15 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-[100dvh] w-full flex-col">
        {isAuthChecking ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
            <div className="mb-8">
              <BrandLogoBox logoSrc="/logo.png" fallbackText="MOODIST HASTANESİ" />
            </div>
            <div
              data-testid="admin-auth-loader"
              className="moodist-glass-card flex w-full max-w-md flex-col items-center p-8 text-center"
            >
              <Loader2 className="h-7 w-7 animate-spin text-[#B1C6FC]" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-[#BFC6DD]">
                Görevli oturumu kontrol ediliyor...
              </p>
            </div>
          </div>
        ) : !user ? (
          <main className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6">
            <div className="mb-7">
              <BrandLogoBox logoSrc="/logo.png" fallbackText="MOODIST HASTANESİ" />
            </div>

            <section
              aria-labelledby="admin-login-heading"
              data-testid="admin-login-card"
              className="moodist-glass-card w-full max-w-md p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-[#B1C6FC]">
                  <Lock className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                </div>
                <div>
                  <h1
                    id="admin-login-heading"
                    className="font-[var(--font-display)] text-xl font-bold tracking-[-0.02em] text-white"
                  >
                    Görevli Girişi
                  </h1>
                  <p className="mt-0.5 text-[13px] text-[#BFC6DD]">
                    VR Terapi deneyim sırası yönetimi
                  </p>
                </div>
              </div>

              <form onSubmit={handleSignIn} noValidate className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="admin-email-input"
                    className="mb-1.5 block text-[13px] font-medium text-white/90"
                  >
                    E-posta
                  </label>
                  <input
                    id="admin-email-input"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="gorevli@moodist.com.tr"
                    disabled={isSubmitting}
                    className="moodist-glass-input px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-password-input"
                    className="mb-1.5 block text-[13px] font-medium text-white/90"
                  >
                    Şifre
                  </label>
                  <input
                    id="admin-password-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (authError) setAuthError(null);
                    }}
                    placeholder="••••••••"
                    disabled={isSubmitting}
                    className="moodist-glass-input px-4 py-3 text-sm"
                  />
                </div>

                {authError && (
                  <p
                    role="alert"
                    data-testid="admin-auth-error"
                    className="rounded-xl border border-rose-300/30 bg-rose-500/15 px-3.5 py-2.5 text-[13px] leading-snug text-rose-100"
                  >
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="moodist-primary-btn mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 px-5 py-3 text-[15px] font-bold tracking-[-0.01em] transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span className="whitespace-nowrap">Giriş yapılıyor...</span>
                    </>
                  ) : (
                    <span className="whitespace-nowrap">Giriş Yap</span>
                  )}
                </button>
              </form>
            </section>

            <button
              type="button"
              onClick={onReturnToVisitor}
              className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-medium text-[#BFC6DD] transition-colors duration-150 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Ziyaretçi Ekranına Dön</span>
            </button>
          </main>
        ) : (
          <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-8">
            <header
              data-testid="admin-topbar"
              className="moodist-glass-card flex flex-col gap-3 rounded-[22px] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/logo.png"
                  alt="Moodist Hastanesi"
                  referrerPolicy="no-referrer"
                  className="h-7 w-auto shrink-0 object-contain"
                />
                <span className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />
                <span className="font-[var(--font-display)] text-sm font-semibold tracking-[-0.01em] text-white whitespace-nowrap shrink-0">
                  Yönetici Paneli
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:gap-3">
                {user.email && (
                  <span
                    data-testid="admin-user-email"
                    title={user.email}
                    className="max-w-[220px] truncate text-xs font-medium text-[#BFC6DD]"
                  >
                    {user.email}
                  </span>
                )}

                <button
                  type="button"
                  onClick={onReturnToVisitor}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/90 transition-colors duration-150 hover:border-white/30 hover:bg-white/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Ziyaretçi Ekranına Dön</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap shrink-0"
                >
                  {isSigningOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>Çıkış Yap</span>
                </button>
              </div>
            </header>

            {authError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-2.5 text-xs text-rose-100"
              >
                {authError}
              </p>
            )}

            {queueError && (
              <p
                role="alert"
                data-testid="admin-queue-error"
                className="mt-4 rounded-xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-xs leading-relaxed text-rose-100"
              >
                {queueError}
              </p>
            )}

            {actionError && (
              <div
                role="alert"
                data-testid="admin-action-error"
                className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-rose-300/35 bg-rose-500/15 px-4 py-3 text-xs leading-relaxed text-rose-100 backdrop-blur-xl"
              >
                <span>{actionError}</span>
                <button
                  type="button"
                  onClick={() => setActionError(null)}
                  aria-label="Hata mesajını kapat"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-rose-100/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <main className="mt-6 flex flex-1 flex-col gap-6 pb-8">
              {/* Üst Özet Başlık & Stand QR + Excel (CSV) İndir Butonları */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                <h1 className="font-[var(--font-display)] text-base font-bold tracking-[-0.015em] text-white sm:text-lg">
                  Canlı Sıra Özeti
                </h1>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsQrModalOpen(true)}
                    data-testid="admin-stand-qr-btn"
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.08] px-4 py-2 text-xs font-semibold text-white backdrop-blur-xl transition-colors duration-150 hover:border-white/35 hover:bg-white/[0.15] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap shrink-0 sm:text-[13px]"
                  >
                    <QrCode className="h-3.5 w-3.5 shrink-0 text-[#B1C6FC]" aria-hidden="true" />
                    <span>Stand QR Kodu</span>
                  </button>

                  <button
                    type="button"
                    disabled={buckets.all.length === 0}
                    onClick={() => downloadAdminEntriesCsv(buckets.all)}
                    data-testid="admin-csv-export-btn"
                    className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[0.08] px-4 py-2 text-xs font-semibold text-white backdrop-blur-xl transition-colors duration-150 hover:border-white/35 hover:bg-white/[0.15] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap shrink-0 sm:text-[13px]"
                  >
                    <Download className="h-3.5 w-3.5 shrink-0 text-[#B1C6FC]" aria-hidden="true" />
                    <span>Excel (CSV) İndir</span>
                  </button>
                </div>
              </div>

              {/* Anlık Özet İstatistik Kartları (Mobilde 2x2, Masaüstünde 4 sütun) */}
              <section
                aria-label="Anlık sıra istatistikleri"
                data-testid="admin-stats-grid"
                className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
              >
                <div className="moodist-glass-card rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-xs font-medium text-[#BFC6DD]">Bekleyen</p>
                  <p
                    data-testid="admin-stat-waiting"
                    className="mt-1.5 font-[var(--font-display)] text-2xl font-bold tracking-tight text-white tabular-nums sm:text-3xl"
                  >
                    {buckets.waiting.length}
                  </p>
                </div>

                <div className="moodist-glass-card rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-xs font-medium text-[#BFC6DD]">Deneyimde</p>
                  <p
                    data-testid="admin-stat-called"
                    className={`mt-1.5 font-[var(--font-display)] text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${
                      buckets.called.length > 0 ? 'text-emerald-300' : 'text-white'
                    }`}
                  >
                    {buckets.called.length}
                  </p>
                </div>

                <div className="moodist-glass-card rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-xs font-medium text-[#BFC6DD]">Tamamlanan</p>
                  <p
                    data-testid="admin-stat-completed"
                    className="mt-1.5 font-[var(--font-display)] text-2xl font-bold tracking-tight text-white tabular-nums sm:text-3xl"
                  >
                    {buckets.completed.length}
                  </p>
                </div>

                <div className="moodist-glass-card rounded-[20px] px-4 py-3.5 sm:px-5 sm:py-4">
                  <p className="text-xs font-medium text-[#BFC6DD]">Toplam Kayıt</p>
                  <p
                    data-testid="admin-stat-total"
                    className="mt-1.5 font-[var(--font-display)] text-2xl font-bold tracking-tight text-[#B1C6FC] tabular-nums sm:text-3xl"
                  >
                    {buckets.all.length}
                  </p>
                </div>
              </section>

              {/* VR Gözlüğü Şarj Molası Kontrol Kartı */}
              <section
                aria-labelledby="admin-charging-heading"
                data-testid="admin-charging-card"
                className={
                  systemStatus.isCharging
                    ? 'rounded-[24px] border border-amber-300/50 bg-amber-500/15 px-5 py-4 backdrop-blur-2xl shadow-[0_18px_46px_-20px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(253,230,138,0.22)] sm:px-6 sm:py-5'
                    : 'moodist-glass-card rounded-[24px] px-5 py-4 sm:px-6 sm:py-5'
                }
              >
                {systemStatus.isCharging ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-400/20 text-amber-200">
                        <BatteryCharging className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2
                          id="admin-charging-heading"
                          data-testid="admin-charging-status-text"
                          className="font-[var(--font-display)] text-sm font-bold tracking-[-0.01em] text-amber-50 tabular-nums sm:text-base"
                        >
                          {remainingChargingMinutes > 0
                            ? `Şarj Molası Aktif — Kalan: ${remainingChargingMinutes} dk`
                            : 'Süre doldu — Devam etmeye hazır'}
                        </h2>
                        <p className="mt-0.5 text-xs text-amber-100/80">
                          {remainingChargingMinutes > 0
                            ? 'Ziyaretçi ekranlarında şarj süresi tahmini bekleme süresine ekleniyor.'
                            : 'VR gözlüğü hazırsa molayı bitirip sıradan devam edebilirsiniz.'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isChargingBusy}
                      onClick={() => {
                        void handleEndChargingBreak();
                      }}
                      data-testid="admin-charging-end-btn"
                      className="moodist-primary-btn inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-[#3B2606] transition-all duration-150 hover:bg-amber-50 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 whitespace-nowrap sm:text-[13px]"
                    >
                      {pendingChargingAction?.type === 'end' ? (
                        <>
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin shrink-0"
                            aria-hidden="true"
                          />
                          <span>Bitiriliyor...</span>
                        </>
                      ) : (
                        <>
                          <ZapOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>Şarj Molasını Bitir</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-[#B1C6FC]">
                        <BatteryCharging className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h2
                          id="admin-charging-heading"
                          className="font-[var(--font-display)] text-sm font-bold tracking-[-0.01em] text-white sm:text-base"
                        >
                          VR Gözlüğü Şarj Molası
                        </h2>
                        <p className="mt-0.5 text-xs text-[#BFC6DD]">
                          Başlatıldığında ziyaretçilerin tahmini bekleme süresine otomatik eklenir.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      {CHARGING_BREAK_OPTIONS.map((minutes) => {
                        const isStartingThis =
                          pendingChargingAction?.type === 'start' &&
                          pendingChargingAction.minutes === minutes;

                        return (
                          <button
                            key={minutes}
                            type="button"
                            disabled={isChargingBusy}
                            onClick={() => {
                              void handleStartChargingBreak(minutes);
                            }}
                            data-testid={`admin-charging-start-${minutes}`}
                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/[0.09] px-3.5 py-2 text-xs font-semibold text-white transition-colors duration-150 hover:border-amber-200/50 hover:bg-amber-400/15 hover:text-amber-50 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap tabular-nums"
                          >
                            {isStartingThis ? (
                              <>
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin shrink-0"
                                  aria-hidden="true"
                                />
                                <span>Başlatılıyor...</span>
                              </>
                            ) : (
                              <span>{minutes} dk</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              {isQueueLoading ? (
                <section
                  data-testid="admin-queue-loading"
                  className="moodist-glass-card flex flex-col items-center justify-center p-10 text-center"
                >
                  <Loader2 className="h-7 w-7 animate-spin text-[#B1C6FC]" aria-hidden="true" />
                  <p className="mt-3 text-sm font-medium text-[#BFC6DD]">
                    Canlı sıra verileri yükleniyor...
                  </p>
                </section>
              ) : (
                <>
                  {/* Bölüm 1 — Şu An Deneyimde (status === 'called') */}
                  <section
                    aria-labelledby="admin-called-heading"
                    data-testid="admin-called-section"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between px-1">
                      <h2
                        id="admin-called-heading"
                        className="flex items-center gap-2 font-[var(--font-display)] text-base font-bold tracking-[-0.015em] text-white"
                      >
                        <Clock className="h-4 w-4 text-emerald-300" aria-hidden="true" />
                        <span>Şu An Deneyimde</span>
                      </h2>
                      <span className="text-xs font-medium text-[#BFC6DD] tabular-nums">
                        {buckets.called.length} kişi
                      </span>
                    </div>

                    {buckets.called.length === 0 ? (
                      <div className="moodist-glass-card px-5 py-6 text-center sm:px-6">
                        <p className="text-sm font-semibold text-white/90">
                          Şu an VR istasyonu boş
                        </p>
                        <p className="mt-1 text-xs text-[#BFC6DD]">
                          Bekleyenler listesinden sıradaki katılımcıyı çağırabilirsiniz.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {buckets.called.map((entry) => {
                          const isCompleting =
                            pendingAction?.type === 'complete' &&
                            pendingAction.code === entry.code;
                          const isSkipping =
                            pendingAction?.type === 'skip' &&
                            pendingAction.code === entry.code;

                          return (
                            <div
                              key={entry.code}
                              data-testid={`admin-called-row-${entry.code}`}
                              className="moodist-glass-card-called px-5 py-5 sm:px-6"
                            >
                              <div className="mb-2 text-xs font-semibold text-emerald-200">
                                Çağrılan Katılımcı · 1 VR İstasyonu
                              </div>
                              <ParticipantIdentity entry={entry} emphasized />

                              <div className="mt-4 flex flex-col gap-2.5 border-t border-emerald-200/20 pt-4 sm:flex-row sm:items-center">
                                <button
                                  type="button"
                                  disabled={isActionBusy}
                                  onClick={() => handleCompleteParticipant(entry)}
                                  data-testid={`admin-complete-btn-${entry.code}`}
                                  className="moodist-primary-btn inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-[#14372B] transition-all duration-150 hover:bg-emerald-50 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap"
                                >
                                  {isCompleting ? (
                                    <>
                                      <Loader2
                                        className="h-4 w-4 animate-spin shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>Tamamlanıyor...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Check
                                        className="h-4 w-4 shrink-0"
                                        strokeWidth={2.5}
                                        aria-hidden="true"
                                      />
                                      <span>Tamamla</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  disabled={isActionBusy}
                                  onClick={() => handleSkipParticipant(entry)}
                                  data-testid={`admin-skip-btn-${entry.code}`}
                                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-200/40 bg-amber-400/15 px-4 py-2.5 text-sm font-semibold text-amber-50 transition-all duration-150 hover:border-amber-200/65 hover:bg-amber-400/25 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 whitespace-nowrap"
                                >
                                  {isSkipping ? (
                                    <>
                                      <Loader2
                                        className="h-4 w-4 animate-spin shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>Geri alınıyor...</span>
                                    </>
                                  ) : (
                                    <>
                                      <RotateCcw
                                        className="h-4 w-4 shrink-0"
                                        strokeWidth={2.1}
                                        aria-hidden="true"
                                      />
                                      <span>Gelmedi (3 Sıra Geri Al)</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Bölüm 2 — Bekleyenler (status === 'waiting', queueOrder sırasıyla) */}
                  <section
                    aria-labelledby="admin-waiting-heading"
                    data-testid="admin-waiting-section"
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-col gap-2 px-1">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <h2
                            id="admin-waiting-heading"
                            className="flex items-center gap-2 font-[var(--font-display)] text-base font-bold tracking-[-0.015em] text-white"
                          >
                            <Users className="h-4 w-4 text-[#B1C6FC]" aria-hidden="true" />
                            <span>Bekleyenler</span>
                          </h2>
                          <span className="text-xs font-medium text-[#BFC6DD] tabular-nums">
                            ({buckets.waiting.length} kişi)
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={
                            buckets.waiting.length === 0 || hasActiveCalled || isActionBusy
                          }
                          onClick={() => {
                            const nextPerson = buckets.waiting[0];
                            if (nextPerson) {
                              handleCallParticipant(nextPerson.code, 'call-next');
                            }
                          }}
                          data-testid="admin-call-next-btn"
                          className="moodist-primary-btn inline-flex min-h-[40px] items-center justify-center gap-2 px-4 py-2 text-xs font-bold tracking-[-0.01em] transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white whitespace-nowrap shrink-0 sm:text-[13px]"
                        >
                          {pendingAction?.type === 'call-next' ? (
                            <>
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin shrink-0"
                                aria-hidden="true"
                              />
                              <span>Çağırılıyor...</span>
                            </>
                          ) : (
                            <>
                              <BellRing
                                className="h-3.5 w-3.5 shrink-0"
                                strokeWidth={2.2}
                                aria-hidden="true"
                              />
                              <span>Sıradakini Çağır</span>
                            </>
                          )}
                        </button>
                      </div>

                      {hasActiveCalled && (
                        <p
                          data-testid="admin-single-station-note"
                          className="text-xs font-medium text-amber-200/90"
                        >
                          Önce mevcut katılımcıyı tamamlayın veya pas geçin.
                        </p>
                      )}
                    </div>

                    <div className="moodist-glass-card overflow-hidden">
                      {buckets.waiting.length === 0 ? (
                        <div className="px-5 py-8 text-center sm:px-6">
                          <p className="text-sm font-medium text-white/90">
                            Şu an sırada bekleyen katılımcı yok
                          </p>
                          <p className="mt-1 text-xs text-[#BFC6DD]">
                            Yeni kayıtlar oluşturulduğunda bu liste anlık olarak güncellenir.
                          </p>
                        </div>
                      ) : (
                        <ul className="divide-y divide-white/10">
                          {buckets.waiting.map((entry, index) => {
                            const isCallingThis =
                              pendingAction?.type === 'call' &&
                              pendingAction.code === entry.code;

                            return (
                              <li
                                key={entry.code}
                                data-testid={`admin-waiting-row-${entry.code}`}
                                className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-white/[0.04] sm:px-6"
                              >
                                <ParticipantIdentity entry={entry} position={index + 1} />

                                <button
                                  type="button"
                                  disabled={hasActiveCalled || isActionBusy}
                                  onClick={() => handleCallParticipant(entry.code, 'call')}
                                  data-testid={`admin-call-btn-${entry.code}`}
                                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:border-white/40 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 whitespace-nowrap"
                                >
                                  {isCallingThis ? (
                                    <>
                                      <Loader2
                                        className="h-3.5 w-3.5 animate-spin shrink-0"
                                        aria-hidden="true"
                                      />
                                      <span>Çağırılıyor...</span>
                                    </>
                                  ) : (
                                    <span>Çağır</span>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </section>

                  {/* Bölüm 3 — Tamamlananlar (status === 'completed', katlanabilir) */}
                  <section
                    aria-labelledby="admin-completed-heading"
                    data-testid="admin-completed-section"
                    className="moodist-glass-card overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setIsCompletedOpen((prev) => !prev)}
                      aria-expanded={isCompletedOpen}
                      data-testid="admin-completed-toggle"
                      className="flex min-h-[54px] w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white/70 sm:px-6"
                    >
                      <span
                        id="admin-completed-heading"
                        className="flex items-center gap-2 font-[var(--font-display)] text-sm font-semibold text-white/90"
                      >
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-[#B1C6FC]"
                          aria-hidden="true"
                        />
                        <span>Tamamlananlar</span>
                        <span className="text-xs font-medium text-[#BFC6DD] tabular-nums">
                          ({buckets.completed.length})
                        </span>
                      </span>

                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-[#BFC6DD] transition-transform duration-150 ${
                          isCompletedOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {isCompletedOpen && (
                      <div className="border-t border-white/10">
                        {buckets.completed.length === 0 ? (
                          <p className="px-5 py-5 text-center text-xs text-[#BFC6DD] sm:px-6">
                            Henüz tamamlanan deneyim bulunmuyor.
                          </p>
                        ) : (
                          <ul className="divide-y divide-white/10">
                            {buckets.completed.map((entry) => (
                              <li
                                key={entry.code}
                                data-testid={`admin-completed-row-${entry.code}`}
                                className="flex items-center gap-3 px-5 py-3 opacity-85 sm:px-6"
                              >
                                <ParticipantIdentity entry={entry} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </section>
                </>
              )}
            </main>
          </div>
        )}
      </div>

      {user && (
        <StandQrModal
          isOpen={isQrModalOpen}
          onClose={() => setIsQrModalOpen(false)}
        />
      )}
    </div>
  );
}
