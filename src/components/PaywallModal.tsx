import { Crown, Sparkles, X } from 'lucide-react';

type PaywallModalProps = {
  isOpen: boolean;
  feature: string;
  onClose: () => void;
  onTestUpgrade?: () => void;
};

export function PaywallModal({ isOpen, feature, onClose, onTestUpgrade }: PaywallModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl"
      >
        <div className="relative bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-6 pb-6 pt-7 text-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre Pro"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mb-4 inline-flex rounded-2xl bg-amber-400 p-3 text-amber-950 shadow-lg">
            <Crown className="h-6 w-6 fill-amber-500" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">JoursOff Pro</p>
          <h2 id="paywall-title" className="mt-1 text-2xl font-black">Débloquez {feature}</h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-100">
            Personnalisez votre expérience et profitez de toutes les options réservées aux membres Pro.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <ul className="space-y-2.5 text-sm text-slate-700">
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" /> 32 avatars et 7 thèmes exclusifs</li>
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" /> Calendriers et outils avancés</li>
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" /> Une expérience sans publicité</li>
          </ul>
          {onTestUpgrade && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onTestUpgrade();
              }}
              className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-indigo-700"
            >
              Activer le mode Pro (test)
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
          >
            Continuer en mode Gratuit
          </button>
        </div>
      </section>
    </div>
  );
}
