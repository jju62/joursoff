import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[];
  }
}

let adsenseScriptPromise: Promise<void> | null = null;

function loadAdsenseScript(client: string) {
  if (!adsenseScriptPromise) {
    adsenseScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossible de charger le script Google AdSense.'));
      document.head.appendChild(script);
    });
    void adsenseScriptPromise.catch(() => {
      adsenseScriptPromise = null;
    });
  }
  return adsenseScriptPromise;
}

type AdBannerProps = {
  isPro: boolean;
  onUpgrade?: () => void;
};

export function AdBanner({ isPro, onUpgrade }: AdBannerProps) {
  const adRef = useRef<HTMLModElement | null>(null);
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const adSlot = import.meta.env.VITE_ADSENSE_SLOT;

  useEffect(() => {
    if (isPro || import.meta.env.DEV || !adClient || !adSlot) return;

    let active = true;
    void loadAdsenseScript(adClient)
      .then(() => {
        if (!active) return;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      })
      .catch((error: unknown) => {
        console.error('Erreur de chargement de la publicité :', error);
      });

    return () => {
      active = false;
    };
  }, [adClient, adSlot, isPro]);

  if (isPro) return null;

  if (import.meta.env.DEV) {
    return (
      <aside
        aria-label="Espace publicitaire de test"
        className="flex flex-col items-center justify-between gap-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-3 text-center sm:flex-row sm:text-left"
      >
        <div>
          <p className="text-xs font-extrabold text-indigo-900">
            Espace Publicitaire (Version Gratuite)
          </p>
          <p className="mt-0.5 text-[11px] text-indigo-700">
            Passez à la version Pro pour supprimer les pubs.
          </p>
        </div>
        {onUpgrade && (
          <button
            type="button"
            onClick={onUpgrade}
            className="shrink-0 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-700"
          >
            Passer Pro
          </button>
        )}
      </aside>
    );
  }

  if (!adClient || !adSlot) return null;

  return (
    <aside
      aria-label="Publicité"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm"
    >
      <ins
        ref={adRef}
        className="adsbygoogle block min-h-24 w-full"
        style={{ display: 'block' }}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
