import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Loader2,
  MapPin,
  Navigation,
  Sparkles,
} from 'lucide-react';
import {
  geocodeCity,
  reverseGeocodeCoordinates,
  searchCitySuggestions,
  WeatherLocation,
} from '../weather';

export type OnboardingData = {
  departureCity: WeatherLocation | null;
  schoolZone: 'A' | 'B' | 'C' | 'hors_zone';
  annualCp: number;
  renewalMonth: number;
  hasRtt: boolean;
  annualRtt: number;
  monthlyRtt: number;
  rttMode: 'fixed' | 'monthly';
};

type OnboardingWizardProps = {
  initialCity?: string;
  onComplete: (data: OnboardingData) => Promise<void>;
};

const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('fr-FR', { month: 'long' }).format(new Date(2026, index, 1))
);

const fieldClassName =
  'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

export function OnboardingWizard({ initialCity = '', onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [city, setCity] = useState(initialCity);
  const [selectedDepartureCity, setSelectedDepartureCity] = useState<WeatherLocation | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<WeatherLocation[]>([]);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [schoolZone, setSchoolZone] = useState<OnboardingData['schoolZone'] | ''>('');
  const [annualCp, setAnnualCp] = useState('25');
  const [renewalMonth, setRenewalMonth] = useState('6');
  const [hasRtt, setHasRtt] = useState<boolean | null>(null);
  const [annualRtt, setAnnualRtt] = useState('10');
  const [monthlyRtt, setMonthlyRtt] = useState('1');
  const [rttMode, setRttMode] = useState<OnboardingData['rttMode']>('fixed');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const progressiveAnnualRtt = Number((Number(monthlyRtt || 0) * 12).toFixed(2));

  useEffect(() => {
    const query = city.trim();
    if (query.length < 2 || selectedDepartureCity?.name === query) {
      setCitySuggestions([]);
      setCitySearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setCitySearchLoading(true);
      void searchCitySuggestions(query, controller.signal).then((results) => {
        setCitySuggestions(results);
        setError(null);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCitySuggestions([]);
          setError(cause instanceof Error ? cause.message : 'Recherche de ville indisponible.');
        }
      }).finally(() => {
        if (!controller.signal.aborted) setCitySearchLoading(false);
      });
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [city, selectedDepartureCity]);

  const continueToNextStep = () => {
    setError(null);
    if (step === 0 && !schoolZone) {
      setError('Choisissez votre zone de vacances scolaires pour continuer.');
      return;
    }
    if (step === 1) {
      const cp = Number(annualCp);
      if (!annualCp.trim() || !Number.isFinite(cp) || cp < 0 || cp > 100) {
        setError('Indiquez un nombre de jours de CP compris entre 0 et 100.');
        return;
      }
    }
    if (step === 2) {
      if (hasRtt === null) {
        setError('Indiquez si votre entreprise vous attribue des RTT.');
        return;
      }
      if (hasRtt) {
        const rtt = Number(rttMode === 'monthly' ? monthlyRtt : annualRtt);
        const maxRtt = rttMode === 'monthly' ? 10 : 120;
        if (
          !(rttMode === 'monthly' ? monthlyRtt : annualRtt).trim() ||
          !Number.isFinite(rtt) ||
          rtt < 0 ||
          rtt > maxRtt
        ) {
          setError(rttMode === 'monthly'
            ? 'Indiquez un nombre de RTT acquis par mois compris entre 0 et 10.'
            : 'Indiquez un nombre de RTT annuel compris entre 0 et 120.');
          return;
        }
      }
    }
    setStep((current) => Math.min(current + 1, 3));
  };

  const finishOnboarding = async () => {
    setError(null);
    setSaving(true);
    try {
      const departureCity = selectedDepartureCity ??
        (city.trim() ? await geocodeCity(city.trim()) : null);
      await onComplete({
        departureCity,
        schoolZone: schoolZone as OnboardingData['schoolZone'],
        annualCp: Number(annualCp),
        renewalMonth: Number(renewalMonth),
        hasRtt: hasRtt === true,
        annualRtt: !hasRtt
          ? 0
          : rttMode === 'monthly'
            ? progressiveAnnualRtt
            : Number(annualRtt),
        monthlyRtt: !hasRtt
          ? 0
          : rttMode === 'monthly'
            ? Number(monthlyRtt)
            : Number(annualRtt) / 12,
        rttMode,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’enregistrer votre configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    setError(null);
    setLocationMessage(null);
    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas disponible dans ce navigateur.');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void reverseGeocodeCoordinates(coords.latitude, coords.longitude).then((location) => {
          setSelectedDepartureCity(location);
          setCity(location.name);
          setCitySuggestions([]);
          setLocationMessage('Ville détectée à partir de votre position.');
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : 'Impossible d’identifier la ville.');
        }).finally(() => setLocationLoading(false));
      },
      (cause) => {
        const message = cause.code === cause.PERMISSION_DENIED
          ? 'Autorisez la géolocalisation dans votre navigateur pour utiliser cette option.'
          : cause.code === cause.POSITION_UNAVAILABLE
            ? 'Votre position est momentanément indisponible. Vous pouvez saisir une ville.'
            : 'La recherche de position a expiré. Réessayez ou saisissez une ville.';
        setError(message);
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 }
    );
  };

  const selectedMonth = MONTHS[Number(renewalMonth) - 1];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-md sm:p-6"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.preventDefault();
        }}
        className="view-enter my-auto w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30"
      >
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-800 to-violet-700 px-6 pb-7 pt-6 text-white sm:px-8 sm:pt-8">
          <div aria-hidden="true" className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl shadow-inner">🧭</span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-200">JoursOff · Bien démarrer</p>
                <h1 id="onboarding-title" className="mt-0.5 text-xl font-black tracking-tight sm:text-2xl">
                  {step === 3 ? 'Votre récapitulatif' : ['Bienvenue !', 'Vos congés payés', 'Vos RTT'][step]}
                </h1>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-indigo-100">
              {step < 3 ? `Étape ${step + 1} sur 3` : 'Dernière étape'}
            </span>
          </div>
          <div className="relative mt-6" aria-label={`Progression : ${step === 3 ? 100 : Math.round(((step + 1) / 3) * 100)} %`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all duration-500"
                style={{ width: `${step === 3 ? 100 : ((step + 1) / 3) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8">
          <p id="onboarding-description" className="mb-5 text-sm leading-relaxed text-slate-600">
            {step === 0 && 'Configurons votre compte en 1 minute pour calculer au jour près vos ponts et soldes.'}
            {step === 1 && 'Quelques précisions sur votre compteur de congés payés pour obtenir des calculs fiables.'}
            {step === 2 && 'Dites-nous comment fonctionnent vos RTT ; vous pourrez ajuster vos soldes à tout moment.'}
            {step === 3 && 'Tout est prêt ! Vérifiez vos informations avant de personnaliser votre calendrier.'}
          </p>

          {step === 0 && (
            <div className="space-y-5">
              <div>
                <label htmlFor="onboarding-city" className="block text-sm font-extrabold text-slate-800">
                  <span className="flex items-center gap-2">📍 Ville de départ <span className="text-[10px] font-semibold text-slate-400">Facultatif</span></span>
                  <input
                    id="onboarding-city"
                    type="text"
                    maxLength={80}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={citySuggestions.length > 0}
                    aria-controls="onboarding-city-suggestions"
                    value={city}
                    onChange={(event) => {
                      setCity(event.target.value);
                      setSelectedDepartureCity(null);
                      setCitySuggestions([]);
                      setLocationMessage(null);
                      setError(null);
                    }}
                    placeholder="Ex. Lyon"
                    className={fieldClassName}
                  />
                </label>
                {citySearchLoading && (
                  <p role="status" className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recherche de villes…
                  </p>
                )}
                {citySuggestions.length > 0 && (
                  <div
                    id="onboarding-city-suggestions"
                    role="listbox"
                    aria-label="Villes suggérées"
                    className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
                  >
                    {citySuggestions.map((suggestion) => (
                      <button
                        key={`${suggestion.name}-${suggestion.latitude}-${suggestion.longitude}`}
                        type="button"
                        role="option"
                        aria-selected={selectedDepartureCity?.name === suggestion.name}
                        onClick={() => {
                          setSelectedDepartureCity(suggestion);
                          setCity(suggestion.name);
                          setCitySuggestions([]);
                          setError(null);
                          setLocationMessage(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-800"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        {suggestion.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={locationLoading}
                  onClick={handleUseCurrentLocation}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                >
                  {locationLoading
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Localisation…</>
                    : <><Navigation className="h-3.5 w-3.5" /> Utiliser ma position</>}
                </button>
                <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-slate-500">
                  Saisissez quelques lettres pour choisir une ville, ou autorisez la géolocalisation. La position n’est utilisée qu’à votre demande.
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                  Si vous activez la géolocalisation, vos coordonnées servent à retrouver le nom de la ville auprès du service de cartographie.
                </p>
                {locationMessage && (
                  <p role="status" className="mt-1.5 text-[11px] font-semibold text-emerald-700">{locationMessage}</p>
                )}
              </div>
              <fieldset>
                <legend className="text-sm font-extrabold text-slate-800">🏫 Zone de vacances scolaires</legend>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Choisissez votre zone pour repérer les vacances de votre académie.</p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['A', 'Zone A'],
                    ['B', 'Zone B'],
                    ['C', 'Zone C'],
                    ['hors_zone', 'Hors zone'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={schoolZone === value}
                      onClick={() => setSchoolZone(value)}
                      className={`rounded-xl border px-3 py-3 text-xs font-extrabold transition ${
                        schoolZone === value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                <p className="text-sm font-extrabold text-amber-950">☀️ Le saviez-vous ?</p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-900">
                  En France, la période légale va en général du 1er juin au 31 mai (25 jours pour une semaine de 5j).
                </p>
              </div>
              <label className="block text-sm font-extrabold text-slate-800">
                🏖️ Nombre de jours de CP annuels
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  required
                  value={annualCp}
                  onChange={(event) => setAnnualCp(event.target.value)}
                  className={fieldClassName}
                />
                <span className="mt-1.5 block text-[11px] font-medium text-slate-500">Souvent 25 jours pour une semaine de 5 jours, soit 5 semaines.</span>
              </label>
              <label className="block text-sm font-extrabold text-slate-800">
                <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-indigo-600" /> Mois de renouvellement</span>
                <select value={renewalMonth} onChange={(event) => setRenewalMonth(event.target.value)} className={fieldClassName}>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month.charAt(0).toLocaleUpperCase('fr-FR') + month.slice(1)}</option>
                  ))}
                </select>
                <span className="mt-1.5 block text-[11px] font-medium text-slate-500">Juin par défaut, conformément à la période légale habituelle.</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <fieldset>
                <legend className="text-sm font-extrabold text-slate-800">⏱️ Avez-vous des jours de RTT attribués par votre entreprise ?</legend>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([
                    [true, 'Oui'],
                    [false, 'Non (Pas de RTT)'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={String(value)}
                      type="button"
                      aria-pressed={hasRtt === value}
                      onClick={() => setHasRtt(value)}
                      className={`rounded-xl border px-3 py-3 text-xs font-extrabold transition ${
                        hasRtt === value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              {hasRtt === true && (
                <div className="view-enter space-y-4">
                  <fieldset>
                    <legend className="text-sm font-extrabold text-slate-800">⚙️ Mode d’attribution</legend>
                    <div className="mt-2 space-y-2">
                      {([
                        ['fixed', 'Forfait annuel distribué au 1er janvier'],
                        ['monthly', 'Acquisition progressive chaque mois'],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={rttMode === value}
                          onClick={() => {
                            setRttMode(value);
                            setError(null);
                          }}
                          className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left text-xs font-bold leading-relaxed transition ${
                            rttMode === value
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-100'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${rttMode === value ? 'border-indigo-600' : 'border-slate-300'}`}>
                            {rttMode === value && <span className="h-2 w-2 rounded-full bg-indigo-600" />}
                          </span>
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  {rttMode === 'monthly' ? (
                    <label className="block text-sm font-extrabold text-slate-800">
                      📆 Nombre de RTT acquis chaque mois
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.01"
                        required
                        value={monthlyRtt}
                        onChange={(event) => setMonthlyRtt(event.target.value)}
                        className={fieldClassName}
                      />
                      <span className="mt-1.5 block text-[11px] font-medium leading-relaxed text-slate-500">
                        Ce nombre sera ajouté à votre solde chaque mois. Sur 12 mois, cela représente {progressiveAnnualRtt} RTT par an.
                      </span>
                    </label>
                  ) : (
                    <label className="block text-sm font-extrabold text-slate-800">
                      📆 Nombre de RTT attribués par an
                      <input
                        type="number"
                        min="0"
                        max="120"
                        step="0.5"
                        required
                        value={annualRtt}
                        onChange={(event) => setAnnualRtt(event.target.value)}
                        className={fieldClassName}
                      />
                      <span className="mt-1.5 block text-[11px] font-medium text-slate-500">
                        Le forfait annuel attribué par votre entreprise au 1er janvier.
                      </span>
                    </label>
                  )}
                  {rttMode === 'monthly' && (
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Votre solde démarrera à 0 et progressera du nombre de RTT saisi chaque mois. Vous pourrez le corriger dans vos réglages.
                    </p>
                  )}
                </div>
              )}
              {hasRtt === false && (
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-semibold leading-relaxed text-emerald-800">
                  👍 Aucun souci, nous ne compterons pas de jours de RTT dans votre calendrier.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              {[
                { icon: <MapPin className="h-4 w-4" />, title: 'Votre localisation', value: `${city.trim() || 'Aucune ville sélectionnée'} · ${schoolZone === 'hors_zone' ? 'Hors zone' : `Zone ${schoolZone}`}` },
                { icon: <CalendarDays className="h-4 w-4" />, title: 'Vos congés payés', value: `${annualCp} jours par an · renouvellement en ${selectedMonth}` },
                { icon: <Sparkles className="h-4 w-4" />, title: 'Vos RTT', value: !hasRtt ? 'Pas de RTT' : rttMode === 'fixed' ? `${annualRtt} jours par an · forfait au 1er janvier` : `${monthlyRtt} jour${Number(monthlyRtt) === 1 ? '' : 's'} par mois · ${progressiveAnnualRtt} par an` },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">{item.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{item.title}</p>
                    <p className="mt-0.5 text-sm font-bold leading-relaxed text-slate-800">{item.value}</p>
                  </div>
                  <Check className="ml-auto mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                </div>
              ))}
              <p className="flex items-start gap-2 rounded-xl bg-indigo-50 p-3 text-[11px] leading-relaxed text-indigo-800">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                Vous pourrez modifier tous ces paramètres à tout moment dans votre compte.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-semibold leading-relaxed text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
            {step > 0 ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setError(null);
                  setStep((current) => current - 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Retour
              </button>
            ) : <span />}
            {step < 3 ? (
              <button
                type="button"
                onClick={continueToNextStep}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700"
              >
                {step === 2 ? 'Voir mon récapitulatif' : 'Suivant'}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void finishOnboarding()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-indigo-600/20 transition hover:-translate-y-0.5 hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</> : <>Terminer la configuration <Check className="h-4 w-4" /></>}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
