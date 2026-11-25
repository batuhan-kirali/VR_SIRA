import { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Loader2, SearchCheck, X } from 'lucide-react';
import { lookupActiveQueue } from '../services/queueService';
import { unlockAudioContext } from '../utils/audio';
import { formatFirestoreRegistrationError } from '../utils/registration';

export type LandingSheetIntent = 'check-queue' | null;

interface ActionSheetProps {
  intent: LandingSheetIntent;
  onClose: () => void;
  onQueueFound: (code: string) => void;
}

export function ActionSheet({ intent, onClose, onQueueFound }: ActionSheetProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!intent) {
      setQuery('');
      setFeedback(null);
      setIsSearching(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSearching) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [intent, isSearching, onClose]);

  if (!intent) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSearching) return;

    unlockAudioContext();
    setFeedback(null);

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setFeedback('Lütfen takip kodunuzu, telefon numaranızı veya e-posta adresinizi girin.');
      return;
    }

    setIsSearching(true);
    try {
      const result = await lookupActiveQueue(trimmed);
      switch (result.status) {
        case 'active':
          onQueueFound(result.code);
          return;
        case 'completed':
          setFeedback('Bu kayda ait VR deneyimi tamamlanmış görünüyor.');
          return;
        case 'not_found':
          setFeedback('Aktif bir sıra kaydı bulunamadı.');
          return;
        case 'invalid':
          setFeedback(
            'Lütfen geçerli bir takip kodu (örn: VR-05), telefon veya e-posta girin.',
          );
          return;
      }
    } catch (error) {
      setFeedback(formatFirestoreRegistrationError(error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-[#0D1220]/65 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-sheet-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSearching) {
          onClose();
        }
      }}
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        noValidate
        data-testid="queue-lookup-sheet"
        className="w-full rounded-t-[28px] border-t border-white/20 bg-gradient-to-b from-[#2A3555]/95 to-[#1C2334]/98 px-6 pb-7 pt-3 text-white shadow-[0_-20px_56px_rgba(6,10,22,0.65)] backdrop-blur-2xl"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-[#B1C6FC]">
              <SearchCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="action-sheet-title"
                className="font-[var(--font-display)] text-lg font-bold tracking-tight text-white"
              >
                Kaçıncı Sıradayım
              </h2>
              <p className="text-[12.5px] text-[#BFC6DD]">
                Mevcut sıranızı anlık olarak görüntüleyin
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isSearching}
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#BFC6DD] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          <label
            htmlFor="queue-lookup-input"
            className="mb-1.5 block text-[12.5px] font-medium text-white/90"
          >
            Takip Kodu (örn: VR-05), Telefon veya E-posta
          </label>
          <input
            id="queue-lookup-input"
            name="lookupQuery"
            type="text"
            autoComplete="off"
            disabled={isSearching}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (feedback) setFeedback(null);
            }}
            placeholder="VR-05, 05XX XXX XX XX veya e-posta"
            className="moodist-glass-input h-12 px-4 text-[14.5px] disabled:opacity-70"
          />
        </div>

        {feedback && (
          <div
            role="alert"
            data-testid="lookup-feedback"
            className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/12 px-3.5 py-2.5 text-[12.5px] leading-snug text-amber-100"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={isSearching}
          aria-busy={isSearching}
          className="moodist-primary-btn group mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 px-5 text-[15px] font-bold transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-65"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin" aria-hidden="true" />
              <span className="whitespace-nowrap">Sorgulanıyor...</span>
            </>
          ) : (
            <>
              <span className="whitespace-nowrap">Sıramı Bul</span>
              <ArrowRight
                className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:translate-x-0.5"
                strokeWidth={2.3}
                aria-hidden="true"
              />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
