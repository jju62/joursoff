import { useState } from 'react';
import { CalendarDays, Crown, Loader2, Sparkles, UsersRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type PaywallModalProps = {
  isOpen: boolean;
  feature: string;
  onClose: () => void;
  onSignIn: () => void;
  onActivated: () => void;
};

const GOOGLE_PLAY_PRODUCT_ID = import.meta.env.VITE_GOOGLE_PLAY_PRODUCT_ID || 'congeszen_pro_lifetime';

export function PaywallModal({ isOpen, feature, onClose, onSignIn, onActivated }: PaywallModalProps) {
  const { user, isPro, activateProWithPurchase } = useAuth();
  const [purchasePending, setPurchasePending] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  if (!isOpen) return null;
  const isSharingFeature = /duo|partage|groupe/i.test(feature);

  const handlePurchase = async () => {
    if (purchasePending) return;
    setPurchaseMessage(null);
    setPurchaseError(null);

    if (!('getDigitalGoodsService' in window) || typeof window.getDigitalGoodsService !== 'function') {
      setPurchaseMessage('Pour acheter CongésZen Pro, ouvrez l’application Android installée depuis Google Play.');
      return;
    }

    if (!user) {
      setPurchaseMessage('Connectez-vous avant d’effectuer votre achat Pro.');
      onSignIn();
      return;
    }

    setPurchasePending(true);
    try {
      const service = await window.getDigitalGoodsService('https://play.google.com/billing');
      const [product] = await service.getDetails([GOOGLE_PLAY_PRODUCT_ID]);
      if (!product || product.itemId !== GOOGLE_PLAY_PRODUCT_ID) {
        throw new Error('L’offre CongésZen Pro est introuvable dans Google Play.');
      }

      const purchaseResult = await service.makePurchase({ sku: GOOGLE_PLAY_PRODUCT_ID });
      if (!purchaseResult.purchaseToken) {
        throw new Error('Google Play n’a pas renvoyé de jeton de paiement.');
      }

      await activateProWithPurchase(purchaseResult.purchaseToken, GOOGLE_PLAY_PRODUCT_ID);
      onActivated();
      onClose();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setPurchaseMessage('Achat annulé. Aucun paiement n’a été effectué.');
      } else {
        console.error('Impossible de finaliser l’achat CongésZen Pro :', error);
        setPurchaseError(
          error instanceof Error
            ? error.message
            : 'Le paiement n’a pas pu être vérifié. Réessayez dans quelques instants.',
        );
      }
    } finally {
      setPurchasePending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!purchasePending && event.target === event.currentTarget) onClose();
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
            disabled={purchasePending}
            aria-label="Fermer la fenêtre Pro"
            className="absolute right-4 top-4 rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
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
          {purchaseMessage && <p role="status" className="text-center text-xs font-semibold text-amber-800">{purchaseMessage}</p>}
          {purchaseError && <p role="alert" className="text-center text-xs font-semibold text-red-700">{purchaseError}</p>}
          <button
            type="button"
            onClick={() => void handlePurchase()}
            disabled={purchasePending || isPro}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {purchasePending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPro ? 'Mode Pro déjà activé' : purchasePending ? 'Vérification du paiement…' : 'Activer le mode Pro'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={purchasePending}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuer en mode Gratuit
          </button>
        </div>
      </section>
    </div>
  );
}
