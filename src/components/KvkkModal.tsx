import { useEffect } from 'react';
import { ShieldCheck, X } from 'lucide-react';

interface KvkkModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KvkkModal({ isOpen, onClose }: KvkkModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-[#0D1220]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kvkk-modal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[82dvh] w-full flex-col rounded-[28px] border border-white/20 bg-gradient-to-b from-[#2C3758]/95 to-[#1C2334]/98 p-5 text-white shadow-[0_24px_64px_rgba(6,10,22,0.72)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.08] text-[#B1C6FC]">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="kvkk-modal-title"
                className="font-[var(--font-display)] text-[17px] font-bold leading-snug text-white"
              >
                KVKK Aydınlatma Metni
              </h2>
              <p className="text-[12px] text-[#BFC6DD]">
                Moodist Hastanesi VR Terapi Deneyimi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="KVKK metnini kapat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#BFC6DD] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-3 overflow-y-auto pr-1 text-[13px] leading-[1.6] text-[#DCE2F2]">
          <p>
            <strong className="font-semibold text-white">Veri Sorumlusu:</strong> Özel
            Moodist Psikiyatri ve Nöroloji Hastanesi olarak, 6698 sayılı Kişisel Verilerin
            Korunması Kanunu (&ldquo;KVKK&rdquo;) uyarınca kişisel verilerinizin güvenliğine
            önem veriyoruz.
          </p>

          <p>
            <strong className="font-semibold text-white">İşlenen Veriler ve Amaç:</strong>{' '}
            Etkinlik kapsamında paylaştığınız Ad Soyad, isteğe bağlı telefon/e-posta
            bilgileriniz ve kısa anket yanıtlarınız; yalnızca VR Terapi deneyim sırasının
            düzenlenmesi, sıranızı kaybetmeniz halinde eşleştirme yapılması ve etkinlik
            deneyiminin geliştirilmesi amacıyla işlenmektedir.
          </p>

          <p>
            <strong className="font-semibold text-white">Saklama ve Haklarınız:</strong>{' '}
            Verileriniz üçüncü taraflarla ticari amaçla paylaşılmaz ve etkinlik süreci
            tamamlandığında ilgili mevzuata uygun şekilde korunur veya anonimleştirilir.
            KVKK&apos;nın 11. maddesi kapsamındaki bilgi talep etme, düzeltme ve silme
            haklarınız için Moodist Hastanesi ile iletişime geçebilirsiniz.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="moodist-primary-btn mt-4 flex min-h-[48px] w-full shrink-0 items-center justify-center px-5 text-[14.5px] font-bold transition-all duration-150 hover:bg-[#F3F6FD] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Anladım
        </button>
      </div>
    </div>
  );
}
