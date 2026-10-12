import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[];
  }
}

let adsenseScriptPromise: Promise<void> | null = null;

function loadAdsenseScript(client: string) {
  if (!adsenseScriptPromise) {
    const scriptSelector = 'script[src^="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]';
    const existingScript = document.querySelector<HTMLScriptElement>(scriptSelector);
    adsenseScriptPromise = existingScript
      ? window.adsbygoogle
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
          existingScript.addEventListener('load', () => resolve(), { once: true });
          existingScript.addEventListener('error', () => reject(new Error('Impossible de charger le script Google AdSense.')), { once: true });
        })
      : new Promise<void>((resolve, reject) => {
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
  variant?: 'in-feed' | 'compact';
  testMode?: boolean;
};

export function AdBanner({ isPro, onUpgrade, variant = 'in-feed', testMode = false }: AdBannerProps) {
  const adRef = useRef<HTMLModElement | null>(null);
  const [adStatus, setAdStatus] = useState<'loading' | 'filled' | 'unfilled'>('loading');
  const adClient = import.meta.env.VITE_ADSENSE_CLIENT;
  const adSlot = import.meta.env.VITE_ADSENSE_SLOT;
  const reservedHeight = variant === 'compact' ? 'min-h-[76px]' : 'min-h-24';

  useEffect(() => {
    if (isPro || (import.meta.env.DEV && !testMode) || !adClient || !adSlot) return;

    let active = true;
    setAdStatus('loading');
    const adElement = adRef.current;
    const observer = adElement ? new MutationObserver(() => {
      const status = adElement.getAttribute('data-ad-status');
      if (status === 'filled' || status === 'unfilled') setAdStatus(status);
    }) : null;
    observer?.observe(adElement!, { attributes: true, attributeFilter: ['data-ad-status'] });

    // The shared loader prevents duplicate script requests across ad slots.
    void loadAdsenseScript(adClient)
      .then(() => {
        if (!active) return;
        window.adsbygoogle = window.adsbygoogle || [];
        window.adsbygoogle.push({});
      })
      .catch((error: unknown) => {
        if (active) setAdStatus('unfilled');
        console.error('Erreur de chargement de la publicité :', error);
      });

    return () => {
      active = false;
      observer?.disconnect();
    };
  }, [adClient, adSlot, isPro, testMode]);

  if (isPro) return null;

  if (import.meta.env.DEV && !testMode) {
    return (
      <aside
        aria-label="Espace publicitaire de test"
        className={`flex flex-col items-center justify-between gap-3 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/60 px-4 ${
          variant === 'compact' ? 'min-h-[76px] py-2' : 'min-h-24 py-3'
        } text-center sm:flex-row sm:text-left`}
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

  return (
    <aside
      aria-label="Publicité"
      className={`relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-100 p-2 shadow-sm ${reservedHeight}`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-2 top-2 flex min-h-[60px] items-center justify-center transition-opacity ${
          adStatus === 'filled' ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-slate-500">Espace publicitaire</span>
          <div className="h-2.5 w-16 animate-pulse rounded bg-slate-300" />
        </div>
      </div>
      {adClient && adSlot && (
        <ins
          ref={adRef}
          className={`adsbygoogle relative z-10 block w-full ${reservedHeight}`}
          style={{ display: 'block' }}
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
          data-adtest={testMode ? 'on' : undefined}
        />
      )}
    </aside>
  );
}
