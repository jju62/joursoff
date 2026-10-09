import { createPortal } from 'react-dom';
import { useEffect } from 'react';
import { Share, Smartphone, X } from 'lucide-react';

type InstallInstructionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isIOS: boolean;
};

export function InstallInstructionsModal({ isOpen, onClose, isIOS }: InstallInstructionsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-instructions-title"
        className="w-full rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
      >
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <h2 id="install-instructions-title" className="text-base font-extrabold text-slate-900">
                Installer CongésZen
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">Ajoutez l’application à votre écran d’accueil.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les instructions"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {isIOS ? (
          <ol className="space-y-3">
            <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
                <Share className="h-4 w-4" />
              </span>
              Dans Safari, touchez le bouton Partager.
            </li>
            <li className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">＋</span>
              Choisissez « Sur l’écran d’accueil », puis « Ajouter ».
            </li>
          </ol>
        ) : (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
            Ouvrez le menu de votre navigateur, puis choisissez <strong>« Installer l’application »</strong> ou
            <strong> « Ajouter à l’écran d’accueil »</strong>.
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-emerald-600 py-3 text-sm font-extrabold text-white transition hover:bg-emerald-700"
        >
          Compris
        </button>
      </section>
    </div>,
    document.body
  );
}
