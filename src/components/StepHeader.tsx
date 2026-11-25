import { ArrowLeft } from 'lucide-react';
import type { WizardStep } from '../utils/registration';

interface StepHeaderProps {
  step: WizardStep;
  totalSteps?: number;
  onBack: () => void;
}

export function StepHeader({ step, totalSteps = 4, onBack }: StepHeaderProps) {
  return (
    <header className="relative z-10 flex shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.06] px-3 py-1.5 text-[13.5px] font-medium text-white/90 transition-colors duration-150 hover:bg-white/[0.12] hover:text-white active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={2.1} aria-hidden="true" />
          <span className="whitespace-nowrap">Geri</span>
        </button>

        <span
          data-testid="step-indicator"
          aria-label={`Adım ${step} / ${totalSteps}`}
          className="text-[13px] font-semibold tracking-wide text-[#BFC6DD] tabular-nums"
        >
          {step}/{totalSteps}
        </span>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-4 gap-1.5"
      >
        {Array.from({ length: totalSteps }, (_, index) => {
          const segmentStep = index + 1;
          const isReached = segmentStep <= step;
          return (
            <div
              key={segmentStep}
              className={`h-1 rounded-full transition-colors duration-200 ${
                isReached ? 'bg-white/90' : 'bg-white/15'
              }`}
            />
          );
        })}
      </div>
    </header>
  );
}
