import { AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react';
import { StepHeader } from './StepHeader';
import {
  formatPhoneDisplay,
  isEmailValidOptional,
  isPhoneValidOptional,
} from '../utils/hash';
import { isPersonalInfoValid, type RegistrationFormData } from '../utils/registration';

interface PersonalInfoStepProps {
  data: RegistrationFormData;
  isChecking?: boolean;
  errorMessage?: string | null;
  onChange: (patch: Partial<RegistrationFormData>) => void;
  onOpenKvkk: () => void;
  onBack: () => void;
  onNext: () => void;
}

export function PersonalInfoStep({
  data,
  isChecking = false,
  errorMessage = null,
  onChange,
  onOpenKvkk,
  onBack,
  onNext,
}: PersonalInfoStepProps) {
  const isPhoneInvalid = data.phone.trim().length > 0 && !isPhoneValidOptional(data.phone);
  const isEmailInvalid = data.email.trim().length > 0 && !isEmailValidOptional(data.email);
  const canContinue = isPersonalInfoValid(data) && !isChecking;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canContinue) {
      onNext();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      data-testid="step-personal-info"
      className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden px-5 pt-5 pb-5 sm:px-6 sm:pt-7 sm:pb-7"
    >
      <StepHeader
        step={1}
        onBack={() => {
          if (!isChecking) {
            onBack();
          }
        }}
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-2.5 py-2.5">
        <section
          aria-labelledby="personal-info-heading"
          className="moodist-glass-card p-4 sm:p-5"
        >
          <h1
            id="personal-info-heading"
            className="font-[var(--font-display)] text-[20px] font-bold leading-snug tracking-[-0.02em] text-white sm:text-[22px]"
          >
            Ziyaretçi Bilgileri
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-[#BFC6DD]">
            VR Terapi sıranızı oluşturmak için bilgilerinizi girin.
          </p>

          <div className="mt-3.5 space-y-2.5 sm:mt-4 sm:space-y-3">
            {/* Ad Soyad (Zorunlu) */}
            <div>
              <label
                htmlFor="visitor-fullname"
                className="mb-1 flex items-center justify-between text-[12.5px] font-medium text-white/90"
              >
                <span>Ad Soyad</span>
                <span className="text-[11px] font-medium text-[#B1C6FC]">Zorunlu</span>
              </label>
              <input
                id="visitor-fullname"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                disabled={isChecking}
                value={data.fullName}
                onChange={(event) => onChange({ fullName: event.target.value })}
                placeholder="Adınız ve soyadınız"
                className="moodist-glass-input h-10 px-3.5 text-[14px] disabled:opacity-70 sm:h-11"
              />
            </div>

            {/* Telefon (Opsiyonel — anlık rakam formatlama & doğrulama) */}
            <div>
              <label
                htmlFor="visitor-phone"
                className="mb-1 flex items-center justify-between text-[12.5px] font-medium text-white/90"
              >
                <span>Telefon</span>
                <span className="text-[11px] text-[#BFC6DD]/75">Opsiyonel</span>
              </label>
              <input
                id="visitor-phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                disabled={isChecking}
                value={data.phone}
                onChange={(event) =>
                  onChange({ phone: formatPhoneDisplay(event.target.value) })
                }
                placeholder="05XX XXX XX XX"
                aria-invalid={isPhoneInvalid}
                aria-describedby="visitor-phone-hint"
                className={`moodist-glass-input h-10 px-3.5 text-[14px] tabular-nums disabled:opacity-70 sm:h-11 ${
                  isPhoneInvalid ? 'border-rose-300/70' : ''
                }`}
              />
              {isPhoneInvalid ? (
                <p
                  id="visitor-phone-hint"
                  role="alert"
                  data-testid="phone-error"
                  className="mt-1 text-[11.5px] leading-snug text-rose-200"
                >
                  Geçerli bir cep telefonu girin (örn: 05XX XXX XX XX).
                </p>
              ) : (
                <p
                  id="visitor-phone-hint"
                  className="mt-1 text-[11.5px] leading-snug text-[#BFC6DD]/85"
                >
                  Sıranızı kaybettiğinizde geri bulmak için
                </p>
              )}
            </div>

            {/* E-posta (Opsiyonel — standart e-posta doğrulama) */}
            <div>
              <label
                htmlFor="visitor-email"
                className="mb-1 flex items-center justify-between text-[12.5px] font-medium text-white/90"
              >
                <span>E-posta</span>
                <span className="text-[11px] text-[#BFC6DD]/75">Opsiyonel</span>
              </label>
              <input
                id="visitor-email"
                name="email"
                type="email"
                autoComplete="email"
                disabled={isChecking}
                value={data.email}
                onChange={(event) => onChange({ email: event.target.value })}
                placeholder="ornek@eposta.com"
                aria-invalid={isEmailInvalid}
                aria-describedby={isEmailInvalid ? 'visitor-email-error' : undefined}
                className={`moodist-glass-input h-10 px-3.5 text-[14px] disabled:opacity-70 sm:h-11 ${
                  isEmailInvalid ? 'border-rose-300/70' : ''
                }`}
              />
              {isEmailInvalid && (
                <p
                  id="visitor-email-error"
                  role="alert"
                  data-testid="email-error"
                  className="mt-1 text-[11.5px] leading-snug text-rose-200"
                >
                  Geçerli bir e-posta adresi girin.
                </p>
              )}
            </div>

            {/* KVKK Onay Kutucuğu (Zorunlu — doğrudan işaretlenebilir) */}
            <div className="pt-0.5">
              <div className="flex items-start gap-3 rounded-2xl border border-white/14 bg-white/[0.04] px-3.5 py-2.5">
                <label
                  htmlFor="visitor-kvkk"
                  className="relative mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center"
                >
                  <input
                    id="visitor-kvkk"
                    name="kvkkAccepted"
                    type="checkbox"
                    disabled={isChecking}
                    checked={data.kvkkAccepted}
                    onChange={(event) => onChange({ kvkkAccepted: event.target.checked })}
                    aria-label="KVKK Aydınlatma Metni onayı"
                    className="peer sr-only"
                  />
                  <span className="flex h-5 w-5 items-center justify-center rounded-md border border-white/35 bg-white/[0.06] transition-colors peer-checked:border-white peer-checked:bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white">
                    <Check
                      className={`h-3.5 w-3.5 text-[#2B344D] transition-opacity ${
                        data.kvkkAccepted ? 'opacity-100' : 'opacity-0'
                      }`}
                      strokeWidth={3}
                      aria-hidden="true"
                    />
                  </span>
                </label>

                <div className="text-[12.5px] leading-[1.42] text-[#DCE2F2]">
                  <button
                    type="button"
                    disabled={isChecking}
                    onClick={onOpenKvkk}
                    className="rounded font-semibold text-white underline decoration-white/60 underline-offset-3 transition-colors hover:text-[#B1C6FC] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    KVKK Aydınlatma Metni
                  </button>
                  <label htmlFor="visitor-kvkk" className="cursor-pointer">
                    &apos;ni okudum ve kişisel verilerimin etkinlik kapsamında işlenmesini
                    onaylıyorum.
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            data-testid="step1-error-banner"
            className="flex items-start gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/15 px-3.5 py-2.5 text-[12px] leading-snug text-rose-100 backdrop-blur-xl"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
      </main>

      <footer className="relative z-10 shrink-0 pt-1">
        <button
          type="submit"
          disabled={!canContinue}
          aria-busy={isChecking}
          className={`moodist-primary-btn group flex min-h-[54px] w-full items-center justify-center gap-2 px-6 py-4 text-[15.5px] font-bold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            canContinue
              ? 'hover:bg-[#F3F6FD] active:scale-[0.985]'
              : 'cursor-not-allowed opacity-45 shadow-none'
          }`}
        >
          {isChecking ? (
            <>
              <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden="true" />
              <span className="whitespace-nowrap">Kontrol Ediliyor...</span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">Devam Et</span>
              <ArrowRight
                className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                strokeWidth={2.3}
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </footer>
    </form>
  );
}
