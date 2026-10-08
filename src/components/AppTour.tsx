import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

type AppTourProps = {
  onStepChange: (step: number) => void;
  onComplete: () => Promise<void>;
};

const TOUR_STEPS = [
  {
    target: '[data-tour="calendar"]',
    title: '📅 Votre calendrier et vos soldes',
    description: 'Visualisez vos jours posés et le solde de congés restant. Touchez une date pour ajouter un congé et voir son impact immédiatement.',
  },
  {
    target: '[data-tour="optimizer"]',
    title: '✨ L’optimiseur de ponts',
    description: 'Repérez les meilleures dates pour prolonger vos week-ends, comparez le coût en congés et consultez les prévisions météo.',
  },
  {
    target: '[data-tour="sharing"]',
    title: '👥 Duo et groupes',
    description: 'Depuis votre compte, créez un partage Duo ou rejoignez un groupe pour mieux coordonner vos prochaines vacances.',
  },
  {
    target: '[data-tour="export"]',
    title: '🎨 Export et personnalisation',
    description: 'Exportez vers Google Calendar ou en PDF. Dans votre compte, choisissez aussi votre thème et votre avatar.',
  },
];

type Spotlight = { top: number; left: number; width: number; height: number };

function findVisibleTarget(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)]
    .find((element) => element.getClientRects().length > 0) ?? null;
}

export function AppTour({ onStepChange, onComplete }: AppTourProps) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    onStepChange(step);
    let firstFrame = 0;
    let secondFrame = 0;
    let resizeObserver: ResizeObserver | undefined;

    firstFrame = window.requestAnimationFrame(() => {
      const target = findVisibleTarget(TOUR_STEPS[step].target);
      if (!target) {
        setSpotlight(null);
        return;
      }
      target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      secondFrame = window.requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        setSpotlight({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
      resizeObserver = new ResizeObserver(() => {
        const rect = target.getBoundingClientRect();
        setSpotlight({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      });
      resizeObserver.observe(target);
    });

    const updateSpotlight = () => {
      const target = findVisibleTarget(TOUR_STEPS[step].target);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      setSpotlight({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    };
    window.addEventListener('scroll', updateSpotlight, true);
    window.addEventListener('resize', updateSpotlight);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('scroll', updateSpotlight, true);
      window.removeEventListener('resize', updateSpotlight);
    };
  }, [onStepChange, step]);

  const finishTour = async () => {
    setError(null);
    setSaving(true);
    try {
      await onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer la fin de la visite.');
    } finally {
      setSaving(false);
    }
  };

  const current = TOUR_STEPS[step];
  const popoverTop = spotlight
    ? Math.min(Math.max(spotlight.top + spotlight.height + 14, 16), window.innerHeight - 250)
    : Math.max(24, Math.round(window.innerHeight / 2 - 120));

  return (
    <div className="fixed inset-0 z-[80]" aria-live="polite">
      {spotlight ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={spotlight.left - 5}
                y={spotlight.top - 5}
                width={spotlight.width + 10}
                height={spotlight.height + 10}
                rx="16"
                fill="black"
              />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.68)" mask="url(#tour-spotlight-mask)" />
        </svg>
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-slate-950/65" />
      )}
      {spotlight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-2xl ring-2 ring-white ring-offset-4 ring-offset-indigo-500/70 transition-all duration-300"
          style={{
            top: spotlight.top - 5,
            left: spotlight.left - 5,
            width: spotlight.width + 10,
            height: spotlight.height + 10,
          }}
        />
      )}
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute left-1/2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/30 transition-[top] duration-300 sm:p-6"
        style={{ top: popoverTop }}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
            Découverte · {step + 1}/{TOUR_STEPS.length}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void finishTour()}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            aria-label="Terminer la visite"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 id="tour-title" className="mt-4 text-lg font-black text-slate-900">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{current.description}</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs font-semibold text-red-700">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((currentStep) => currentStep - 1)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Retour
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void finishTour()}
              className="rounded-lg px-2.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              Passer la visite
            </button>
          )}
          {step < TOUR_STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((currentStep) => currentStep + 1);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-indigo-700"
            >
              Suivant <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void finishTour()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Enregistrement…' : 'C’est parti !'} <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
