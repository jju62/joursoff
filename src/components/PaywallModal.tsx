import { CalendarDays, Crown, Sparkles, UsersRound, X } from 'lucide-react';

type PaywallModalProps = {
  isOpen: boolean;
  feature: string;
  onClose: () => void;
  onTestUpgrade?: () => void;
};

export function PaywallModal({ isOpen, feature, onClose, onTestUpgrade }: PaywallModalProps) {
  if (!isOpen) return null;
  const isSharingFeature = /duo|partage|groupe/i.test(feature);

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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">CongésZen Pro · à vie</p>
          <h2 id="paywall-title" className="mt-1 text-2xl font-black">
            {isSharingFeature ? 'Vos congés, mieux coordonnés ensemble' : `Débloquez ${feature}`}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-indigo-100">
            {isSharingFeature
              ? 'Partagez vos projets de congés avec les personnes qui comptent et choisissez vos dates en un coup d’œil.'
              : `Débloquez ${feature} et profitez aussi des calendriers partagés Duo et Groupes.`}
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-fuchsia-700 shadow-sm">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Un Duo à deux, un Groupe avec vos proches</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Retrouvez les congés de chacun dans un calendrier partagé : repérez les disponibilités communes,
                  évitez les dates impossibles et organisez vos vacances sans multiplier les messages.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-sm">
                <UsersRound className="h-5 w-5" />
              </span>
              <p className="pt-1 text-xs leading-relaxed text-slate-600">
                Comparez les plannings en Duo ou filtrez les membres d’un groupe pour voir rapidement qui est disponible.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-amber-800">Offre Pro · sans abonnement</p>
            <p className="mt-0.5 text-2xl font-black text-slate-900">4,99 € <span className="text-sm font-bold text-slate-600">une seule fois</span></p>
            <p className="text-xs font-semibold text-slate-600">Accès à vie. Pas de renouvellement, pas de frais mensuels.</p>
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            Duo, Groupes et les avantages Pro réunis dans une seule offre.
          </p>
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
