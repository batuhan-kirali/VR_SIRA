import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AtmosphericShell } from './components/AtmosphericShell';
import { BrandLogoBox } from './components/BrandLogoBox';
import { LandingPage } from './components/LandingPage';
import { ActionSheet, type LandingSheetIntent } from './components/ActionSheet';
import { PersonalInfoStep } from './components/PersonalInfoStep';
import { SurveyStep } from './components/SurveyStep';
import { KvkkModal } from './components/KvkkModal';
import { LiveQueueScreen } from './components/LiveQueueScreen';
import { AdminPanel } from './components/AdminPanel';
import { isCurrentWindowAdmin } from './utils/routing';
import {
  findActiveContactLockCode,
  findActiveStoredQueueCode,
  readStoredTrackingCode,
  registerVisitorInQueue,
} from './services/queueService';
import { unlockAudioContext } from './utils/audio';
import {
  INITIAL_REGISTRATION_DATA,
  formatFirestoreRegistrationError,
  getSurveyDefinition,
  type RegistrationFormData,
  type WizardStep,
} from './utils/registration';

type AppView = 'landing' | 'register' | 'live-queue';

interface ActiveQueueSession {
  code: string;
  isExisting: boolean;
}

export default function App() {
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => isCurrentWindowAdmin());
  const [view, setView] = useState<AppView>('landing');
  const [step, setStep] = useState<WizardStep>(1);
  const [formData, setFormData] = useState<RegistrationFormData>(INITIAL_REGISTRATION_DATA);
  const [activeQueue, setActiveQueue] = useState<ActiveQueueSession | null>(null);
  const [isCheckingStoredSession, setIsCheckingStoredSession] = useState<boolean>(
    () => !isCurrentWindowAdmin() && readStoredTrackingCode() !== null,
  );
  const [isCheckingStep1, setIsCheckingStep1] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isKvkkOpen, setIsKvkkOpen] = useState(false);
  const [activeSheet, setActiveSheet] = useState<LandingSheetIntent>(null);

  // Sync /admin and #/admin route state on hashchange and browser history navigation
  useEffect(() => {
    const syncRoute = () => {
      setIsAdminRoute(isCurrentWindowAdmin());
    };
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  // Startup check: if localStorage has an active moodist_vr_code, skip Landing/Form straight to LiveQueueScreen
  useEffect(() => {
    if (isAdminRoute) {
      setIsCheckingStoredSession(false);
      return;
    }

    const storedCode = readStoredTrackingCode();
    if (!storedCode) {
      setIsCheckingStoredSession(false);
      return;
    }

    let cancelled = false;

    void findActiveStoredQueueCode()
      .then((activeCode) => {
        if (cancelled) return;
        if (activeCode) {
          setActiveQueue({ code: activeCode, isExisting: false });
          setView('live-queue');
        }
      })
      .catch(() => {
        // Keep user on landing page if Firestore cannot be reached on initial load.
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingStoredSession(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  const handleOpenAdmin = () => {
    setActiveSheet(null);
    if (window.location.hash !== '#/admin') {
      window.location.hash = '#/admin';
    }
    setIsAdminRoute(true);
  };

  const handleReturnToVisitor = () => {
    const normalizedPath = window.location.pathname.trim().toLowerCase().replace(/\/+$/, '');
    const targetPath = normalizedPath === '/admin' ? '/' : window.location.pathname;
    window.history.pushState(null, '', targetPath);
    setIsAdminRoute(false);
  };

  const handleStartRegistration = () => {
    setActiveSheet(null);
    setStep1Error(null);
    setSubmitError(null);
    setStep(1);
    setView('register');
  };

  const handleCheckQueue = () => {
    if (activeQueue) {
      setView('live-queue');
      return;
    }
    setActiveSheet('check-queue');
  };

  const handleReturnHomeFromQueue = () => {
    setActiveQueue(null);
    setFormData(INITIAL_REGISTRATION_DATA);
    setStep(1);
    setStep1Error(null);
    setSubmitError(null);
    setView('landing');
  };

  const handleUpdateFormData = (patch: Partial<RegistrationFormData>) => {
    setStep1Error(null);
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectSurveyAnswer = (key: 'q1' | 'q2' | 'q3', value: string) => {
    setSubmitError(null);
    setFormData((prev) => ({
      ...prev,
      survey: {
        ...prev.survey,
        [key]: value,
      },
    }));
  };

  const handleStepBack = () => {
    if (isSubmitting || isCheckingStep1) return;
    setStep1Error(null);
    setSubmitError(null);
    if (step === 1) {
      setView('landing');
      return;
    }
    setStep((prev) => (prev - 1) as WizardStep);
  };

  const handleStepNext = async () => {
    // Step 1 -> Early contact_locks check before entering the 3-question survey
    if (step === 1) {
      if (isCheckingStep1) return;
      const hasContact =
        formData.phone.trim().length > 0 || formData.email.trim().length > 0;

      if (!hasContact) {
        setStep1Error(null);
        setStep(2);
        return;
      }

      unlockAudioContext();
      setStep1Error(null);
      setIsCheckingStep1(true);

      try {
        const existingCode = await findActiveContactLockCode(
          formData.phone,
          formData.email,
        );
        if (existingCode) {
          setActiveQueue({ code: existingCode, isExisting: true });
          setView('live-queue');
          return;
        }
        setStep(2);
      } catch (error) {
        setStep1Error(formatFirestoreRegistrationError(error));
      } finally {
        setIsCheckingStep1(false);
      }
      return;
    }

    if (step < 4) {
      setSubmitError(null);
      setStep((prev) => (prev + 1) as WizardStep);
      return;
    }

    if (isSubmitting) return;
    unlockAudioContext();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const { code, isExisting } = await registerVisitorInQueue(formData);
      setActiveQueue({ code, isExisting });
      setView('live-queue');
    } catch (error) {
      setSubmitError(formatFirestoreRegistrationError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAdminRoute) {
    return <AdminPanel onReturnToVisitor={handleReturnToVisitor} />;
  }

  return (
    <AtmosphericShell>
      {isCheckingStoredSession ? (
        <div
          data-testid="session-restore-loader"
          className="flex h-[100dvh] w-full flex-col items-center justify-between px-6 py-8"
        >
          <BrandLogoBox logoSrc="/logo.png" fallbackText="MOODIST HASTANESİ" />
          <div className="moodist-glass-card flex w-full flex-col items-center p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#B1C6FC]" aria-hidden="true" />
            <p className="mt-3 text-[14px] font-medium text-[#BFC6DD]">
              Sıra durumunuz kontrol ediliyor...
            </p>
          </div>
          <div className="h-6" aria-hidden="true" />
        </div>
      ) : (
        <>
          {view === 'landing' && (
            <LandingPage
              onJoinQueue={handleStartRegistration}
              onCheckQueue={handleCheckQueue}
              onOpenAdmin={handleOpenAdmin}
            />
          )}

          {view === 'register' && step === 1 && (
            <PersonalInfoStep
              data={formData}
              isChecking={isCheckingStep1}
              errorMessage={step1Error}
              onChange={handleUpdateFormData}
              onOpenKvkk={() => setIsKvkkOpen(true)}
              onBack={handleStepBack}
              onNext={() => {
                void handleStepNext();
              }}
            />
          )}

          {view === 'register' && step !== 1 && (() => {
            const definition = getSurveyDefinition(step);
            return (
              <SurveyStep
                definition={definition}
                selectedValue={formData.survey[definition.answerKey]}
                isSubmitting={step === 4 && isSubmitting}
                errorMessage={step === 4 ? submitError : null}
                onSelect={(value) => handleSelectSurveyAnswer(definition.answerKey, value)}
                onBack={handleStepBack}
                onNext={() => {
                  void handleStepNext();
                }}
              />
            );
          })()}

          {view === 'live-queue' && activeQueue && (
            <LiveQueueScreen
              code={activeQueue.code}
              isExisting={activeQueue.isExisting}
              onReturnHome={handleReturnHomeFromQueue}
            />
          )}
        </>
      )}

      <KvkkModal isOpen={isKvkkOpen} onClose={() => setIsKvkkOpen(false)} />

      <ActionSheet
        intent={activeSheet}
        onClose={() => setActiveSheet(null)}
        onQueueFound={(foundCode) => {
          setActiveSheet(null);
          setActiveQueue({ code: foundCode, isExisting: false });
          setView('live-queue');
        }}
      />
    </AtmosphericShell>
  );
}
