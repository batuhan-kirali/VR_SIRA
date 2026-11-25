import { AlertCircle, ArrowRight, Check, Loader2 } from 'lucide-react';
import { StepHeader } from './StepHeader';
import type { SurveyStepDefinition } from '../utils/registration';

interface SurveyStepProps {
  definition: SurveyStepDefinition;
  selectedValue: string;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onSelect: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}

export function SurveyStep({
  definition,
  selectedValue,
  isSubmitting = false,
  errorMessage = null,
  onSelect,
  onBack,
  onNext,
}: SurveyStepProps) {
  const canContinue = selectedValue.trim().length > 0 && !isSubmitting;
  const isCompactList = definition.options.length >= 5;

  return (
    <div
      data-testid={`step-survey-${definition.step}`}
      className="relative flex h-[100dvh] w-full flex-col justify-between overflow-hidden px-5 pt-5 pb-5 sm:px-6 sm:pt-7 sm:pb-7"
    >
      <StepHeader
        step={definition.step}
        onBack={() => {
          if (!isSubmitting) {
            onBack();
          }
        }}
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center gap-3 py-3">
        <section
          aria-labelledby={`survey-heading-${definition.step}`}
          className="moodist-glass-card p-4 sm:p-5"
        >
          <h1
            id={`survey-heading-${definition.step}`}
            className="font-[var(--font-display)] text-[19px] font-bold leading-[1.3] tracking-[-0.02em] text-white sm:text-[21px] [text-wrap:balance]"
          >
            {definition.question}
          </h1>

          <div
            role="radiogroup"
            aria-labelledby={`survey-heading-${definition.step}`}
            className={`mt-4 flex flex-col ${isCompactList ? 'gap-2 sm:gap-2.5' : 'gap-2.5 sm:gap-3'}`}
          >
            {definition.options.map((option) => {
              const isSelected = selectedValue === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isSubmitting}
                  onClick={() => onSelect(option)}
                  className={`${
                    isSelected ? 'moodist-glass-option-selected' : 'moodist-glass-option'
                  } flex w-full items-center justify-between gap-3 px-4 text-left active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70 ${
                    isCompactList
                      ? 'min-h-[46px] py-2.5 text-[13px] leading-snug sm:min-h-[50px] sm:text-[13.5px]'
                      : 'min-h-[54px] py-3.5 text-[14px] leading-snug sm:text-[14.5px]'
                  }`}
                >
                  <span className={isSelected ? 'font-semibold text-white' : 'font-medium text-white/90'}>
                    {option}
                  </span>

                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isSelected
                        ? 'border-white bg-white text-[#2B344D]'
                        : 'border-white/30 bg-transparent text-transparent'
                    }`}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {errorMessage && (
          <div
            role="alert"
            data-testid="submit-error-banner"
            className="flex items-start gap-2.5 rounded-2xl border border-rose-300/30 bg-rose-500/15 px-4 py-3 text-[12.5px] leading-snug text-rose-100 backdrop-blur-xl"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
      </main>

      <footer className="relative z-10 shrink-0 pt-1">
        <button
          type="button"
          disabled={!canContinue}
          aria-busy={isSubmitting}
          onClick={onNext}
          className={`moodist-primary-btn group flex min-h-[54px] w-full items-center justify-center gap-2 px-6 py-4 text-[15.5px] font-bold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
            canContinue
              ? 'hover:bg-[#F3F6FD] active:scale-[0.985]'
              : 'cursor-not-allowed opacity-55 shadow-none'
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden="true" />
              <span className="whitespace-nowrap">Sıra Alınıyor...</span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">{definition.primaryActionLabel}</span>
              <ArrowRight
                className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                strokeWidth={2.3}
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
