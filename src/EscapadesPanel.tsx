import { useEffect, useMemo, useState } from 'react';
import { Crown, MapPin, Sun } from 'lucide-react';
import {
  DESTINATIONS,
  DestinationSeason,
  DestinationType,
  getSeason,
} from './data/destinations';
import { fetchSeasonalNormals, SeasonalNormals } from './seasonalNormals';

type EscapadesPanelProps = {
  date: string;
  isPro: boolean;
  collapsed?: boolean;
};

const SEASONS: { value: DestinationSeason | 'toutes'; label: string }[] = [
  { value: 'toutes', label: 'Toutes saisons' },
  { value: 'printemps', label: 'Printemps' },
  { value: 'ete', label: 'Été' },
  { value: 'automne', label: 'Automne' },
  { value: 'hiver', label: 'Hiver' },
];

const TYPES: (DestinationType | 'Toutes')[] = [
  'Toutes',
  'Mer',
  'Nature',
  'Culture',
  'Gastronomie',
];

function daysUntil(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((target - today) / 86400000);
}

export function EscapadesPanel({ date, isPro, collapsed = false }: EscapadesPanelProps) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [seasonFilter, setSeasonFilter] = useState<DestinationSeason | 'toutes'>('toutes');
  const [typeFilter, setTypeFilter] = useState<DestinationType | 'Toutes'>('Toutes');
  const [eventsOnly, setEventsOnly] = useState(false);
  const [normals, setNormals] = useState<Record<string, SeasonalNormals>>({});
  const [normalErrors, setNormalErrors] = useState<Record<string, string>>({});
  const [loadingNormals, setLoadingNormals] = useState(false);
  const month = Number(date.slice(5, 7));
  const monthLabel = new Intl.DateTimeFormat('fr-FR', { month: 'long' })
    .format(new Date(Date.UTC(2000, month - 1, 1)));
  const season = getSeason(month);
  const needsSeasonalNormals = daysUntil(date) > 7;

  const destinations = useMemo(() => {
    const matched = DESTINATIONS.filter((destination) =>
      destination.seasons.includes(seasonFilter === 'toutes' ? season : seasonFilter) &&
      (typeFilter === 'Toutes' || destination.types.includes(typeFilter)) &&
      (!eventsOnly || destination.events.some((event) => event.months.includes(month)))
    );
    return [...matched].sort((left, right) => {
      const leftHasEvent = left.events.some((event) => event.months.includes(month));
      const rightHasEvent = right.events.some((event) => event.months.includes(month));
      return Number(rightHasEvent) - Number(leftHasEvent);
    }).slice(0, 3);
  }, [eventsOnly, month, season, seasonFilter, typeFilter]);

  useEffect(() => {
    if (!isPro || !expanded || !needsSeasonalNormals) {
      setLoadingNormals(false);
      return;
    }
    let active = true;
    setLoadingNormals(true);
    void Promise.all(destinations.map(async (destination) => {
      try {
        const result = await fetchSeasonalNormals(destination, month);
        if (active) {
          setNormals((current) => ({ ...current, [`${destination.name}:${month}`]: result }));
          setNormalErrors((current) => {
            const next = { ...current };
            delete next[`${destination.name}:${month}`];
            return next;
          });
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : `Normales de saison indisponibles pour ${destination.name}.`;
          setNormalErrors((current) => ({ ...current, [`${destination.name}:${month}`]: message }));
        }
      }
    })).finally(() => {
      if (active) setLoadingNormals(false);
    });
    return () => {
      active = false;
    };
  }, [destinations, expanded, isPro, month, needsSeasonalNormals]);

  const eventsThisMonth = (destination: typeof DESTINATIONS[number]) =>
    destination.events.filter((event) => event.months.includes(month));

  return (
    <section className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] font-extrabold text-indigo-900">
          <MapPin className="h-3.5 w-3.5" />
          Escapades &amp; ponts
        </span>
        <span className="text-[10px] font-bold text-indigo-700">{expanded ? 'Réduire' : 'Découvrir'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {!isPro ? (
            <div className="rounded-lg bg-white p-2.5">
              <p className="text-[11px] font-extrabold text-slate-800">Une idée d’escapade en France</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Une balade au grand air suivie d’une découverte gourmande. Passez Pro pour découvrir les lieux, détails et événements du moment.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-[10px] font-semibold text-slate-600">
                  Saison
                  <select
                    value={seasonFilter}
                    onChange={(event) => setSeasonFilter(event.target.value as typeof seasonFilter)}
                    className="ml-2 rounded-lg border border-indigo-100 bg-white px-2 py-1 text-[10px]"
                  >
                    {SEASONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-1">
                  {TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={typeFilter === type}
                      onClick={() => setTypeFilter(type)}
                      className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                        typeFilter === type ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={eventsOnly}
                    onChange={(event) => setEventsOnly(event.target.checked)}
                    className="accent-indigo-600"
                  />
                  Événement ce mois-ci
                </label>
              </div>

              {destinations.length === 0 ? (
                <p className="rounded-lg bg-white p-2.5 text-[10px] text-slate-600">
                  Aucune destination ne correspond à ces filtres pour cette période.
                </p>
              ) : (
                <div className="space-y-2">
                  {destinations.map((destination) => {
                    const normalKey = `${destination.name}:${month}`;
                    const destinationNormals = normals[normalKey];
                    const events = eventsThisMonth(destination);
                    return (
                      <article key={destination.name} className="rounded-lg bg-white p-2.5">
                        <h4 className="text-[11px] font-extrabold text-slate-800">
                          {destination.name}
                          <span className="ml-1 font-medium text-slate-500">· {destination.region}</span>
                        </h4>
                        <p className="mt-0.5 text-[10px] text-slate-600">{destination.idea}</p>
                        {events.length > 0 ? (
                          <p className="mt-1 text-[10px] font-semibold text-amber-700">
                            À découvrir : {events.map((event) => event.name).join(', ')}
                          </p>
                        ) : (
                          <p className="mt-1 text-[10px] text-slate-500">Période favorable : {season}.</p>
                        )}
                        {needsSeasonalNormals && (
                          <div className="mt-2 rounded-lg bg-sky-50 px-2 py-1.5 text-[10px] text-sky-900">
                            <p className="font-bold">Normales de saison · {monthLabel}</p>
                            {destinationNormals ? (
                              <p className="mt-0.5 flex items-center gap-1">
                                <Sun className="h-3 w-3" />
                                {destinationNormals.averageMinimum.toFixed(1)}° / {destinationNormals.averageMaximum.toFixed(1)}° ·
                                {' '}{destinationNormals.averageSunshineHours.toFixed(1)} h de soleil/jour
                              </p>
                            ) : normalErrors[normalKey] ? (
                              <p role="status" className="mt-0.5 text-red-700">{normalErrors[normalKey]}</p>
                            ) : (
                              <p role="status" className="mt-0.5">
                                {loadingNormals ? 'Chargement des moyennes historiques…' : 'Normales indisponibles.'}
                              </p>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {needsSeasonalNormals && (
            <div className="relative overflow-hidden rounded-lg border border-sky-100 bg-white p-2.5">
              <div className={!isPro ? 'select-none blur-sm' : ''} aria-hidden={!isPro}>
                <p className="flex items-center gap-1 text-[10px] font-extrabold text-sky-900">
                  <Sun className="h-3 w-3" />
                  Normales de saison
                </p>
                <p className="mt-0.5 text-[10px] text-sky-800">
                  Températures min/max moyennes et ensoleillement moyen du mois ciblé.
                </p>
              </div>
              {!isPro && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-3 text-center">
                  <p className="flex items-center gap-1 text-[10px] font-extrabold text-indigo-800">
                    <Crown className="h-3.5 w-3.5 shrink-0" />
                    Passez Pro pour débloquer les normales de saison
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
