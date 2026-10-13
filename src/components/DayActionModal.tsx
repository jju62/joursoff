import { CalendarDays, Crown, LockKeyhole, Luggage, Sun, Trash2, X } from 'lucide-react';
import { weatherDescription } from '../weather';

export type DayActionLeave = {
  id: number;
  type: 'CP' | 'RTT';
  days: number;
  halfDay?: 'morning' | 'afternoon';
};

type DayActionModalProps = {
  date: string;
  leaves: DayActionLeave[];
  isPro: boolean;
  onClose: () => void;
  onRemove: (leaveId: number) => void;
  onWeather: () => void;
  onEscape: () => void;
  onUpgrade: (feature: string) => void;
};

function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DayActionModal({
  date,
  leaves,
  isPro,
  onClose,
  onRemove,
  onWeather,
  onEscape,
  onUpgrade,
}: DayActionModalProps) {
  const premiumAction = (feature: string, action: () => void) => {
    if (isPro) action();
    else onUpgrade(feature);
  };

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-action-title"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-indigo-600">
              <CalendarDays className="h-3.5 w-3.5" />
              Actions du jour
            </p>
            <h2 id="day-action-title" className="mt-1 text-base font-extrabold text-slate-900 dark:text-white">
              {formatDate(date)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les actions du jour"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-2">
          {leaves.length > 0 && (
            <div className="rounded-xl border border-red-100 bg-red-50/70 p-2 dark:border-red-900 dark:bg-red-950/40">
              <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-red-800 dark:text-red-200">
                Retirer un congé
              </p>
              {leaves.map((leave) => (
                <button
                  key={leave.id}
                  type="button"
                  onClick={() => onRemove(leave.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-red-800 transition hover:bg-red-100 dark:text-red-200 dark:hover:bg-red-900/60"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  Retirer le {leave.type}{leave.halfDay ? ` · ${leave.halfDay === 'morning' ? 'matin' : 'après-midi'}` : ''}
                  {leave.days !== 1 && <span className="ml-auto text-[10px]">{String(leave.days).replace('.', ',')} j</span>}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => premiumAction('la météo à la date choisie', onWeather)}
            className="flex w-full items-center gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-left text-xs font-bold text-sky-900 transition hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
          >
            <Sun className="h-4 w-4 shrink-0" />
            <span>Voir la météo</span>
            {!isPro && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">
                <LockKeyhole className="h-3 w-3" /> PRO
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => premiumAction('la planification d’escapades', onEscape)}
            className="flex w-full items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 text-left text-xs font-bold text-indigo-900 transition hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
          >
            <Luggage className="h-4 w-4 shrink-0" />
            <span>Planifier une escapade</span>
            {!isPro && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-900">
                <Crown className="h-3 w-3" /> PRO
              </span>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

type DayWeatherModalProps = {
  date: string;
  forecast?: { code: number; maximumTemperature: number };
  onClose: () => void;
};

export function DayWeatherModal({ date, forecast, onClose }: DayWeatherModalProps) {
  const [year, month, day] = date.split('-').map(Number);
  const formattedDate = new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const weather = forecast ? weatherDescription(forecast.code) : null;
  return (
    <div
      className="fixed inset-0 z-[66] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-weather-title"
        className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              <Sun className="h-3.5 w-3.5" />
              Météo locale
            </p>
            <h2 id="day-weather-title" className="mt-1 text-base font-extrabold capitalize text-slate-900 dark:text-white">
              {formattedDate}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la météo"
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        {forecast ? (
          <div className="mt-5 rounded-2xl bg-sky-50 p-4 text-center dark:bg-sky-950/50">
            <p className="text-4xl" aria-hidden="true">{weather?.icon}</p>
            <p className="mt-1 text-xs font-bold text-sky-900 dark:text-sky-100">{weather?.label}</p>
            <p className="mt-2 text-sm font-extrabold text-slate-900 dark:text-white">
              {forecast.maximumTemperature} °C maximum
            </p>
          </div>
        ) : (
          <p role="status" className="mt-5 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            Les prévisions ne sont pas disponibles pour cette date. Elles sont limitées aux prochains jours.
          </p>
        )}
      </section>
    </div>
  );
}
