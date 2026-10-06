import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Sparkles,
  Trash2,
  Check,
  Copy,
  Download,
  Code2,
  Calendar,
  Zap,
  X,
  Smartphone,
  RotateCcw,
  Pencil,
  SlidersHorizontal,
  LogOut,
  Cloud,
  CloudCheck,
  Loader2,
  Home,
  CalendarDays,
  UserRound,
  Palette,
  Type,
  Cat,
  Leaf,
  Moon,
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  analyzeBridges2026,
  getFrenchHolidays,
  getHolidayCalendarSummary,
  formatShortDateFr,
  BridgeOpportunity,
} from './holidays2026';
import { getBookableLeaveDates } from './leaveDates';
import { STANDALONE_HTML_CODE } from './standaloneHtml';
import { usePWAInstall } from './usePWAInstall';
import { forecastMonthlyRttBalance } from './rttForecast';
import {
  DailyWeather,
  fetchDailyWeather,
  geocodeCity,
  SUGGESTED_DESTINATIONS,
  weatherDescription,
  WeatherLocation,
} from './weather';
import { supabase } from './supabase';
import { fetchUserSettings, syncToCloud } from './syncService';
import {
  acceptDuoInvitation,
  createDuoInvitation,
  DuoRelationship,
  getDuoRelationship,
  getPartnerCalendar,
  PartnerCalendar,
  unlinkDuo,
} from './duoService';

export interface LeaveItem {
  id: number;
  type: 'CP' | 'RTT';
  date: string; // YYYY-MM-DD
  days: number;
  halfDay?: 'morning' | 'afternoon';
  label?: string;
  recordedAt?: string;
}

const STORAGE_KEY = 'joursoff_data';
const QUOTA_STORAGE_KEY = 'joursoff_quotas_2026';
const PERSONALIZATION_STORAGE_KEY = 'joursoff_personalization';
const PROFILE_STORAGE_KEY = 'joursoff_profile';

type UserProfile = {
  name: string;
  avatar: string;
  departureCity: WeatherLocation | null;
};

const DEFAULT_PROFILE: UserProfile = {
  name: 'Julien',
  avatar: '👋',
  departureCity: null,
};

type Quotas = {
  cp: number;
  rtt: number;
  rttMode: 'fixed' | 'monthly';
  rttMonthly: number;
  rttCurrentBalance: number;
  rttBalanceDate: string;
  rttMax: number | null;
  periodStart: string;
  periodEnd: string;
};

function getQuotaPeriod(referenceDate: string, periodStart: string, periodEnd: string) {
  const referenceMonthDay = referenceDate.slice(5);
  let startYear = Number(referenceDate.slice(0, 4));
  if (referenceMonthDay < periodStart) startYear -= 1;
  const endYear = startYear + (periodEnd <= periodStart ? 1 : 0);

  return {
    start: `${startYear}-${periodStart}`,
    end: `${endYear}-${periodEnd}`,
  };
}

function toLocalIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

type Personalization = {
  theme: 'indigo' | 'emerald' | 'pastel' | 'dark' | 'cat';
  font: 'jakarta' | 'system' | 'rounded';
};

type ToastState = {
  message: string;
  undo?: () => void;
};

export default function App() {
  // Persisted leaves (compatible with original joursoff_data format)
  const [leaves, setLeaves] = useState<LeaveItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore parse errors
    }
    return [];
  });
  const leavesRef = React.useRef(leaves);

  // Initial allowances (default 25 CP, 10 RTT)
  const [quotas, setQuotas] = useState<Quotas>(() => {
    try {
      const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          rttMode: 'fixed',
          rttMonthly: 1,
          rttCurrentBalance: Number(parsed.rtt ?? 10),
          rttBalanceDate: toLocalIsoDate(new Date()),
          rttMax: 10,
          periodStart: '01-01',
          periodEnd: '12-31',
          ...parsed,
        };
      }
    } catch {
      // ignore
    }
    return {
      cp: 25,
      rtt: 10,
      rttMode: 'fixed',
      rttMonthly: 1,
      rttCurrentBalance: 10,
      rttBalanceDate: toLocalIsoDate(new Date()),
      rttMax: 10,
      periodStart: '01-01',
      periodEnd: '12-31',
    };
  });
  const [personalization, setPersonalization] = useState<Personalization>(() => {
    try {
      const saved = localStorage.getItem(PERSONALIZATION_STORAGE_KEY);
      if (saved) return { theme: 'indigo', font: 'jakarta', ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return { theme: 'indigo', font: 'jakarta' };
  });
  const [profile, setProfile] = useState<UserProfile>(() => {
    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const legacyDefaultCity = parsed.departureCity?.name === 'Paris, France' &&
          parsed.departureCity?.latitude === 48.8566 &&
          parsed.departureCity?.longitude === 2.3522;
        return {
          ...DEFAULT_PROFILE,
          ...parsed,
          departureCity: legacyDefaultCity ? null : parsed.departureCity ?? null,
        };
      }
    } catch {
      // ignore malformed local profile
    }
    return DEFAULT_PROFILE;
  });

  // Supabase Auth State
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState(profile.name);
  const [profileCityInput, setProfileCityInput] = useState(profile.departureCity?.name.split(',')[0] ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [duoRelationship, setDuoRelationship] = useState<DuoRelationship | null>(null);
  const [partnerCalendar, setPartnerCalendar] = useState<PartnerCalendar | null>(null);
  const [duoInviteInput, setDuoInviteInput] = useState('');
  const [duoBusy, setDuoBusy] = useState(false);
  const [duoError, setDuoError] = useState<string | null>(null);
  const [calendarViewMode, setCalendarViewMode] = useState<'mine' | 'partner' | 'duo'>('mine');
  const [weatherByCity, setWeatherByCity] = useState<Record<string, DailyWeather[]>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  // Guard : empêche la double-sync (INITIAL_SESSION + SIGNED_IN)
  const hasSyncedRef = React.useRef(false);

  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaFocusField, setQuotaFocusField] = useState<'cp' | 'rtt'>('cp');
  const [quotaCpInput, setQuotaCpInput] = useState<string>(String(quotas.cp));
  const [quotaRttInput, setQuotaRttInput] = useState<string>(String(quotas.rtt));
  const [quotaMonthlyRttInput, setQuotaMonthlyRttInput] = useState<string>(String(quotas.rttMonthly));
  const [quotaRttBalanceInput, setQuotaRttBalanceInput] = useState<string>(String(quotas.rttCurrentBalance));
  const [quotaRttBalanceDateInput, setQuotaRttBalanceDateInput] = useState(quotas.rttBalanceDate);
  const [quotaRttMaxInput, setQuotaRttMaxInput] = useState(quotas.rttMax === null ? '' : String(quotas.rttMax));
  const [quotaRttHasMax, setQuotaRttHasMax] = useState(quotas.rttMax !== null);
  const [quotaRttModeInput, setQuotaRttModeInput] = useState<Quotas['rttMode']>(quotas.rttMode);
  const initialQuotaPeriod = getQuotaPeriod(
    toLocalIsoDate(new Date()),
    quotas.periodStart,
    quotas.periodEnd
  );
  const [quotaPeriodStartInput, setQuotaPeriodStartInput] = useState(initialQuotaPeriod.start);
  const [quotaPeriodEndInput, setQuotaPeriodEndInput] = useState(initialQuotaPeriod.end);

  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState(false);
  const [activeBridgeFilter, setActiveBridgeFilter] = useState<'prioritaires' | 'tous'>('prioritaires');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [activeView, setActiveView] = useState<'calendar' | 'optimizer' | 'holidays'>('calendar');
  const [oneClickType, setOneClickType] = useState<'RTT' | 'CP'>('RTT');
  const [toastMessage, setToastMessage] = useState<ToastState | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [leftViewMode, setLeftViewMode] = useState<'calendrier' | 'liste'>('calendrier');
  const [calendarMonthIndex, setCalendarMonthIndex] = useState<number>(new Date().getMonth());

  // Form state for manual leave modal
  const [formType, setFormType] = useState<'CP' | 'RTT'>('CP');
  const [formDate, setFormDate] = useState<string>(new Date().toLocaleDateString('sv'));
  const [formEndDate, setFormEndDate] = useState<string>(new Date().toLocaleDateString('sv'));
  const [formDayPart, setFormDayPart] = useState<'full' | 'morning' | 'afternoon'>('full');
  const [formLabel, setFormLabel] = useState<string>('');

  // PWA install hook
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  // Sync depuis le cloud (une seule fois par session grâce au ref)
  const syncFromCloud = useCallback(async (userId: string, force = false) => {
    if (!force && hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    setIsSyncing(true);
    try {
      const { leaves: cloudLeaves, quotas: cloudQuotas } = await fetchUserSettings(userId);
      let hasCloudLeaves = false;
      if (cloudLeaves && cloudLeaves.length > 0) {
        leavesRef.current = cloudLeaves;
        setLeaves(cloudLeaves);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudLeaves));
        hasCloudLeaves = true;
      }
      if (cloudQuotas) {
        setQuotas((current) => ({ ...current, ...cloudQuotas }));
        localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(cloudQuotas));
      }
      // Si le cloud est vide mais qu'on a des données locales → première poussée
      if (!hasCloudLeaves) {
        const savedLeavesStr = localStorage.getItem(STORAGE_KEY);
        const savedQuotasStr = localStorage.getItem(QUOTA_STORAGE_KEY);
        const localLeaves = savedLeavesStr ? JSON.parse(savedLeavesStr) : [];
        const localQuotas = savedQuotasStr ? JSON.parse(savedQuotasStr) : { cp: 25, rtt: 10 };
        if (Array.isArray(localLeaves) && localLeaves.length > 0) {
          await syncToCloud(localLeaves, localQuotas);
        }
      }
    } catch (e) {
      console.error('Erreur syncFromCloud:', e);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Init auth session
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        syncFromCloud(currentUser.id);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      // SIGNED_IN seulement (pas INITIAL_SESSION qui est déjà géré par getSession ci-dessus)
      if (event === 'SIGNED_IN' && currentUser) {
        syncFromCloud(currentUser.id);
      }
      if (event === 'SIGNED_OUT') {
        hasSyncedRef.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncFromCloud]);

  // Persist to localStorage (offline fallback)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leaves));
  }, [leaves]);

  useEffect(() => {
    localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quotas));
  }, [quotas]);

  useEffect(() => {
    localStorage.setItem(PERSONALIZATION_STORAGE_KEY, JSON.stringify(personalization));
  }, [personalization]);

  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    const metadata = user.user_metadata;
    const storedCity = metadata?.departure_city;
    const departureCity: WeatherLocation | null | undefined =
      storedCity === null
        ? null
        : storedCity &&
            typeof storedCity.name === 'string' &&
            typeof storedCity.latitude === 'number' &&
            typeof storedCity.longitude === 'number'
          ? {
              name: storedCity.name,
              latitude: storedCity.latitude,
              longitude: storedCity.longitude,
            }
          : undefined;
    setProfile((current) => ({
      ...current,
      name: typeof metadata?.display_name === 'string' && metadata.display_name.trim()
        ? metadata.display_name.trim()
        : current.name,
      avatar: typeof metadata?.avatar_emoji === 'string' ? metadata.avatar_emoji : current.avatar,
      ...(departureCity !== undefined ? { departureCity } : {}),
    }));
  }, [user]);

  const updateLeaves = (nextLeaves: LeaveItem[]) => {
    leavesRef.current = nextLeaves;
    setLeaves(nextLeaves);
  };

  const refreshDuoData = useCallback(async () => {
    const relationship = await getDuoRelationship();
    setDuoRelationship(relationship);
    if (relationship?.status === 'accepted') {
      const calendar = await getPartnerCalendar();
      setPartnerCalendar(calendar);
      setDuoRelationship({
        ...relationship,
        partnerName: calendar.partnerName,
        partnerAvatar: calendar.partnerAvatar,
      });
    } else {
      setPartnerCalendar(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setDuoRelationship(null);
      setPartnerCalendar(null);
      setDuoError(null);
      setCalendarViewMode('mine');
      return;
    }

    void (async () => {
      try {
        const relationship = await getDuoRelationship();
        if (cancelled) return;
        setDuoRelationship(relationship);
        if (relationship?.status === 'accepted') {
          const calendar = await getPartnerCalendar();
          if (cancelled) return;
          setPartnerCalendar(calendar);
          setDuoRelationship({
            ...relationship,
            partnerName: calendar.partnerName,
            partnerAvatar: calendar.partnerAvatar,
          });
        } else {
          setPartnerCalendar(null);
        }
        setDuoError(null);
      } catch (error) {
        if (cancelled) return;
        setDuoError(error instanceof Error ? error.message : 'Impossible de charger le partage Duo.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(15);
    }
  };

  const showToast = (message: string, undo?: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ message, undo });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, undo ? 6000 : 3200);
  };

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setIsAuthModalOpen(false);
        showToast('Connexion réussie ! Vos données sont synchronisées.');
      } else {
        const { error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthSuccess(
          'Compte créé avec succès ! Si la confirmation par email est activée, veuillez vérifier votre boîte de réception.'
        );
        setTimeout(() => {
          setIsAuthModalOpen(false);
        }, 2000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur d'authentification";
      setAuthError(msg);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthModalOpen(false);
    showToast('Déconnecté. Vous êtes repassé en mode local.');
  };

  const handleSaveProfile = async () => {
    const name = profileNameInput.trim();
    const city = profileCityInput.trim();
    if (!name) {
      setProfileError('Saisissez votre nom.');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    let departureCity: WeatherLocation | null = city ? profile.departureCity : null;
    let cityError: string | null = null;
    if (city) {
      try {
        departureCity = await geocodeCity(city);
      } catch (error) {
        cityError = error instanceof Error ? error.message : 'Ville introuvable.';
      }
    }

    setProfile({ ...profile, name, departureCity });
    if (cityError) setProfileError(cityError);

    try {
      if (user) {
        const { error } = await supabase.auth.updateUser({
          data: {
            display_name: name,
            avatar_emoji: profile.avatar,
            departure_city: departureCity,
          },
        });
        if (error) throw error;
      }
      showToast(cityError ? 'Profil enregistré. La ville de départ n’a pas été modifiée.' : 'Profil et ville de départ enregistrés.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible d’enregistrer le profil.';
      setProfileError(`Profil enregistré sur cet appareil. Synchronisation du compte impossible : ${message}`);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSelectAvatar = async (avatar: string) => {
    setProfile((current) => ({ ...current, avatar }));
    if (!user) return;
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: profile.name,
          avatar_emoji: avatar,
          departure_city: profile.departureCity,
        },
      });
      if (error) {
        setProfileError(`Avatar enregistré sur cet appareil. Synchronisation du compte impossible : ${error.message}`);
        return;
      }
      setProfileError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de synchronisation.';
      setProfileError(`Avatar enregistré sur cet appareil. Synchronisation du compte impossible : ${message}`);
    }
  };

  const openProfileSettings = () => {
    setProfileNameInput(profile.name);
    setProfileCityInput(profile.departureCity?.name.split(',')[0] ?? '');
    setProfileError(null);
    setDuoError(null);
    setIsAuthModalOpen(true);
    if (user) {
      void refreshDuoData().catch((error: unknown) => {
        setDuoError(error instanceof Error ? error.message : 'Impossible de rafraîchir le partage Duo.');
      });
    }
  };

  const handleRefreshDuo = async () => {
    setDuoBusy(true);
    setDuoError(null);
    try {
      await refreshDuoData();
      showToast('Calendrier Duo actualisé.');
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : 'Impossible de rafraîchir le partage Duo.');
    } finally {
      setDuoBusy(false);
    }
  };

  const handleCreateDuoInvitation = async () => {
    if (!user) {
      setDuoError('Connectez-vous pour créer un code de partage.');
      return;
    }
    setDuoBusy(true);
    setDuoError(null);
    try {
      await createDuoInvitation();
      await refreshDuoData();
      showToast('Code de partage créé.');
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : 'Impossible de créer un code de partage.');
    } finally {
      setDuoBusy(false);
    }
  };

  const handleAcceptDuoInvitation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      setDuoError('Connectez-vous pour rejoindre un partage Duo.');
      return;
    }
    setDuoBusy(true);
    setDuoError(null);
    try {
      await acceptDuoInvitation(duoInviteInput);
      setDuoInviteInput('');
      await refreshDuoData();
      setCalendarViewMode('duo');
      showToast('Calendrier Duo connecté.');
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : 'Impossible de rejoindre ce partage.');
    } finally {
      setDuoBusy(false);
    }
  };

  const handleUnlinkDuo = async () => {
    if (!window.confirm('Délier les comptes ? Le calendrier partagé ne sera plus visible.')) return;
    setDuoBusy(true);
    setDuoError(null);
    try {
      await unlinkDuo();
      setDuoRelationship(null);
      setPartnerCalendar(null);
      setCalendarViewMode('mine');
      showToast('Partage Duo désactivé.');
    } catch (error) {
      setDuoError(error instanceof Error ? error.message : 'Impossible de désactiver le partage.');
    } finally {
      setDuoBusy(false);
    }
  };

  const handleCopyDuoCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Code copié dans le presse-papiers.');
    } catch {
      setDuoError('Impossible de copier le code. Sélectionnez-le pour le copier manuellement.');
    }
  };

  const openQuotaEditor = (target: 'cp' | 'rtt') => {
    setQuotaCpInput(String(quotas.cp));
    setQuotaRttInput(String(quotas.rtt));
    setQuotaMonthlyRttInput(String(quotas.rttMonthly));
    setQuotaRttBalanceInput(String(quotas.rttMode === 'monthly' ? rttRemaining : quotas.rttCurrentBalance));
    setQuotaRttBalanceDateInput(todayStr);
    setQuotaRttMaxInput(quotas.rttMax === null ? '' : String(quotas.rttMax));
    setQuotaRttHasMax(quotas.rttMax !== null);
    setQuotaRttModeInput(quotas.rttMode);
    const currentPeriod = getQuotaPeriod(
      toLocalIsoDate(new Date()),
      quotas.periodStart,
      quotas.periodEnd
    );
    setQuotaPeriodStartInput(currentPeriod.start);
    setQuotaPeriodEndInput(currentPeriod.end);
    setQuotaFocusField(target);
    setIsQuotaModalOpen(true);
  };

  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCp = parseFloat(quotaCpInput);
    const newRtt = parseFloat(quotaRttInput);
    const newMonthlyRtt = parseFloat(quotaMonthlyRttInput);
    const newRttBalance = parseFloat(quotaRttBalanceInput);
    const newRttMax = quotaRttHasMax ? parseFloat(quotaRttMaxInput) : null;
    const periodStartDate = new Date(`${quotaPeriodStartInput}T00:00:00`);
    const periodEndDate = new Date(`${quotaPeriodEndInput}T00:00:00`);
    if (
      !Number.isFinite(newCp) || newCp < 0 ||
      !Number.isFinite(newRtt) || newRtt < 0 ||
      !Number.isFinite(newMonthlyRtt) || newMonthlyRtt < 0 ||
      (quotaRttModeInput === 'monthly' && (!Number.isFinite(newRttBalance) || newRttBalance < 0)) ||
      (quotaRttHasMax && (newRttMax === null || !Number.isFinite(newRttMax) || newRttMax < 0)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(quotaRttBalanceDateInput) ||
      quotaRttBalanceDateInput > todayStr ||
      !Number.isFinite(periodStartDate.getTime()) ||
      !Number.isFinite(periodEndDate.getTime()) ||
      periodEndDate < periodStartDate
    ) return;

    const newQuotas: Quotas = {
      cp: newCp,
      rtt: newRtt,
      rttMode: quotaRttModeInput,
      rttMonthly: newMonthlyRtt,
      rttCurrentBalance: quotaRttModeInput === 'monthly' ? newRttBalance : quotas.rttCurrentBalance,
      rttBalanceDate: quotaRttModeInput === 'monthly' ? quotaRttBalanceDateInput : quotas.rttBalanceDate,
      rttMax: quotaRttHasMax ? newRttMax : null,
      periodStart: quotaPeriodStartInput.slice(5),
      periodEnd: quotaPeriodEndInput.slice(5),
    };
    setQuotas(newQuotas);
    setIsQuotaModalOpen(false);
    showToast('Vos soldes ont été mis à jour.');
    await syncToCloud(leaves, newQuotas);
  };

  const todayStr = toLocalIsoDate(new Date());
  const activeQuotaPeriod = useMemo(
    () => getQuotaPeriod(todayStr, quotas.periodStart, quotas.periodEnd),
    [todayStr, quotas.periodStart, quotas.periodEnd]
  );

  const { cpRemaining, rttRemaining, cpUsed, rttUsed, rttAllowance } = useMemo(() => {
    let cpU = 0;
    let rttU = 0;
    for (const item of leaves) {
      if (item.type === 'CP' && item.date >= activeQuotaPeriod.start && item.date <= activeQuotaPeriod.end) {
        cpU += Number(item.days) || 0;
      }
    }
    let availableRtt = quotas.rtt;
    if (quotas.rttMode === 'monthly') {
      const balanceDate = new Date(`${quotas.rttBalanceDate}T00:00:00`);
      const balanceTimestamp = balanceDate.getTime();
      const nowTimestamp = Date.now();
      const events: { timestamp: number; kind: 'accrual' | 'leave'; days: number }[] = [];
      let monthOffset = 1;
      while (Number.isFinite(balanceTimestamp)) {
        const accrualDate = new Date(balanceDate);
        const originalDay = balanceDate.getDate();
        accrualDate.setDate(1);
        accrualDate.setMonth(balanceDate.getMonth() + monthOffset);
        const lastDayOfMonth = new Date(
          accrualDate.getFullYear(),
          accrualDate.getMonth() + 1,
          0
        ).getDate();
        accrualDate.setDate(Math.min(originalDay, lastDayOfMonth));
        const timestamp = accrualDate.getTime();
        if (!Number.isFinite(timestamp)) break;
        if (timestamp > nowTimestamp) break;
        events.push({ timestamp, kind: 'accrual', days: quotas.rttMonthly });
        monthOffset += 1;
      }
      for (const item of leaves) {
        if (item.type !== 'RTT' || !item.recordedAt || item.date < todayStr) continue;
        const timestamp = new Date(item.recordedAt).getTime();
        if (timestamp >= balanceTimestamp && timestamp <= nowTimestamp) {
          events.push({ timestamp, kind: 'leave', days: Number(item.days) || 0 });
        }
      }
      events.sort((a, b) => a.timestamp - b.timestamp || (a.kind === 'accrual' ? -1 : 1));
      availableRtt = Math.max(
        0,
        quotas.rttMax === null
          ? quotas.rttCurrentBalance
          : Math.min(quotas.rttCurrentBalance, quotas.rttMax)
      );
      for (const event of events) {
        if (event.kind === 'accrual') {
          availableRtt += event.days;
          if (quotas.rttMax !== null) availableRtt = Math.min(availableRtt, quotas.rttMax);
        } else {
          availableRtt -= event.days;
          rttU += event.days;
        }
      }
    } else {
      for (const item of leaves) {
        if (item.type === 'RTT' && item.date >= activeQuotaPeriod.start && item.date <= activeQuotaPeriod.end) {
          rttU += Number(item.days) || 0;
        }
      }
      availableRtt = quotas.rtt - rttU;
    }
    return {
      cpUsed: cpU,
      rttUsed: rttU,
      cpRemaining: quotas.cp - cpU,
      rttRemaining: availableRtt,
      rttAllowance: quotas.rttMode === 'monthly' && quotas.rttMax !== null
        ? quotas.rttMax
        : quotas.rttMode === 'monthly'
          ? Math.max(quotas.rttCurrentBalance, availableRtt)
          : quotas.rtt,
    };
  }, [leaves, quotas, activeQuotaPeriod, todayStr]);
  const rttNearLimit = quotas.rttMode === 'monthly' &&
    quotas.rttMax !== null &&
    quotas.rttMax > 0 &&
    rttRemaining >= quotas.rttMax * 0.8;

  const getRttBalanceAtDate = (date: string) => quotas.rttMode === 'monthly'
    ? forecastMonthlyRttBalance(
      rttRemaining,
      quotas.rttMonthly,
      quotas.rttMax,
      quotas.rttBalanceDate,
      todayStr,
      date,
      leaves.flatMap((leave) => {
        if (leave.type !== 'RTT' || !leave.recordedAt || leave.date < todayStr) return [];
        const recordedAt = new Date(leave.recordedAt).getTime();
        const balanceDate = new Date(`${quotas.rttBalanceDate}T00:00:00`).getTime();
        return recordedAt >= balanceDate && recordedAt <= Date.now()
          ? [{ date: leave.date, days: Number(leave.days) || 0 }]
          : [];
      })
    )
    : rttRemaining;

  const leaveRangePreview = useMemo(
    () => {
      if (!formDate || !formEndDate || formEndDate < formDate) return null;
      if (formDayPart === 'full') {
        return getBookableLeaveDates(formDate, formEndDate, leaves.map((leave) => leave.date));
      }
      const cursor = new Date(`${formDate}T12:00:00`);
      const isWorkday = cursor.getDay() !== 0 && cursor.getDay() !== 6;
      const isHoliday = getFrenchHolidays(cursor.getFullYear()).some((holiday) => holiday.date === formDate);
      const alreadyBooked = leaves.some((leave) => leave.date === formDate);
      return {
        dates: formDate === formEndDate && isWorkday && !isHoliday && !alreadyBooked ? [formDate] : [],
        weekdays: Number(isWorkday),
        holidaysSkipped: Number(isHoliday),
        existingSkipped: Number(alreadyBooked),
        weekendsSkipped: Number(!isWorkday),
      };
    },
    [formDate, formEndDate, formDayPart, leaves]
  );

  // Ponts et jours fériés calculés dynamiquement selon l'année choisie
  const selectedHolidays = useMemo(() => getFrenchHolidays(selectedYear), [selectedYear]);

  const allBridges = useMemo(() => {
    return analyzeBridges2026(selectedHolidays);
  }, [selectedHolidays]);

  const holidaySummary = useMemo(() => {
    return getHolidayCalendarSummary(selectedHolidays);
  }, [selectedHolidays]);

  const nextRestDay = useMemo(() => {
    const holidays = [
      ...getFrenchHolidays(new Date().getFullYear()),
      ...getFrenchHolidays(new Date().getFullYear() + 1),
    ];
    const holidayDates = new Set(holidays.map((holiday) => holiday.date));
    const upcomingDates = new Set([
      ...holidays.map((holiday) => holiday.date),
      ...leaves.filter((leave) => leave.date >= todayStr).map((leave) => leave.date),
    ]);
    const date = [...upcomingDates].sort().find((candidate) => candidate >= todayStr);
    if (!date) return null;
    const dateHolidays = holidays.filter((holiday) => holiday.date === date);
    const dateLeaves = leaves.filter((leave) => leave.date === date);
    const dateParts = date.split('-').map(Number);
    const dateAtNoon = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12);
    const todayParts = todayStr.split('-').map(Number);
    const todayAtNoon = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12);
    return {
      date,
      daysUntil: Math.round((dateAtNoon.getTime() - todayAtNoon.getTime()) / 86400000),
      description: [
        ...dateHolidays.map((holiday) => holiday.name),
        ...dateLeaves.map((leave) => `${leave.type} posé`),
      ].join(' · '),
      isHoliday: holidayDates.has(date),
    };
  }, [leaves, todayStr]);

  const displayedBridges = useMemo(() => {
    // Filtre 1 : retirer les ponts déjà passés (bridgeDates tous dans le passé)
    const future = allBridges.filter(
      (b) => b.bridgeDates.some((d) => d >= todayStr)
    );
    // Filtre 2 : prioritaires ou tous
    if (activeBridgeFilter === 'prioritaires') {
      return future.filter((b) => b.kind === 'pont_royal' || b.kind === 'viaduc');
    }
    return future;
  }, [allBridges, activeBridgeFilter, todayStr]);

  useEffect(() => {
    if (activeView !== 'optimizer') return;
    if (!profile.departureCity) {
      setWeatherByCity({});
      setWeatherLoading(false);
      setWeatherError(null);
      return;
    }
    const controller = new AbortController();
    const locations: WeatherLocation[] = [profile.departureCity, ...SUGGESTED_DESTINATIONS];
    setWeatherLoading(true);
    setWeatherError(null);

    Promise.allSettled(
      locations.map(async (location) => ({
        name: location.name,
        forecasts: await fetchDailyWeather(location, controller.signal),
      }))
    ).then((results) => {
      if (controller.signal.aborted) return;
      const available: Record<string, DailyWeather[]> = {};
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          available[result.value.name] = result.value.forecasts;
        } else if (index === 0) {
          setWeatherError('Météo de la ville de départ indisponible pour le moment.');
        }
      });
      setWeatherByCity(available);
      setWeatherLoading(false);
    });

    return () => controller.abort();
  }, [activeView, profile.departureCity, selectedYear]);

  // Check if a bridge opportunity is already booked
  const isBridgeBooked = (bridge: BridgeOpportunity) => {
    return bridge.bridgeDates.every((date) =>
      leaves
        .filter((leave) => leave.date === date)
        .reduce((days, leave) => days + (Number(leave.days) || 0), 0) >= 1
    );
  };

  const getBridgeAdditionalCost = (bridge: BridgeOpportunity) =>
    bridge.bridgeDates.reduce((cost, date) => {
      const bookedDays = leaves
        .filter((leave) => leave.date === date)
        .reduce((days, leave) => days + (Number(leave.days) || 0), 0);
      return cost + Math.max(0, 1 - Math.min(1, bookedDays));
    }, 0);

  // 1-Click book or unbook bridge
  const handleOneClickBridge = async (bridge: BridgeOpportunity) => {
    const alreadyBooked = isBridgeBooked(bridge);

    if (alreadyBooked) {
      const removedItems = leaves.filter((item) => bridge.bridgeDates.includes(item.date));
      const removedIds = new Set(removedItems.map((item) => item.id));
      const updated = leaves.filter((item) => !removedIds.has(item.id));
      updateLeaves(updated);
      triggerHaptic();
      showToast(`Pont de ${bridge.holidayName} retiré de vos jours posés.`, () => {
        const restored = [...leavesRef.current, ...removedItems].sort((a, b) => a.date.localeCompare(b.date));
        updateLeaves(restored);
        void syncToCloud(restored, quotas);
      });
      await syncToCloud(updated, quotas);
      return;
    }

    const additionalCost = getBridgeAdditionalCost(bridge);
    const balanceDate = bridge.bridgeDates.reduce((latest, date) => date > latest ? date : latest, todayStr);
    const currentBalance = oneClickType === 'RTT'
      ? getRttBalanceAtDate(balanceDate)
      : cpRemaining;
    if (additionalCost > currentBalance) {
      showToast(`Solde ${oneClickType} insuffisant à la date du pont : ${formatFrNumber(currentBalance)} disponible${currentBalance === 1 ? '' : 's'}, ${additionalCost} nécessaire${additionalCost === 1 ? '' : 's'}.`);
      return;
    }

    const recordedAt = new Date().toISOString();
    const newEntries: LeaveItem[] = bridge.bridgeDates.flatMap((dateStr, idx) => {
      const dayLeaves = leaves.filter((leave) => leave.date === dateStr);
      const bookedDays = dayLeaves.reduce((days, leave) => days + (Number(leave.days) || 0), 0);
      const daysToBook = Math.max(0, 1 - Math.min(1, bookedDays));
      if (daysToBook === 0) return [];
      const halfDay = daysToBook === 0.5
        ? dayLeaves.some((leave) => leave.halfDay === 'morning') ? 'afternoon' : 'morning'
        : undefined;
      return [{
        id: Date.now() + idx,
        type: oneClickType,
        date: dateStr,
        days: daysToBook,
        ...(halfDay ? { halfDay } : {}),
        recordedAt,
        label: `Pont ${bridge.holidayName}`,
      }];
    });

    if (newEntries.length > 0) {
      const updated = [...leaves, ...newEntries].sort((a, b) => a.date.localeCompare(b.date));
      updateLeaves(updated);
      triggerHaptic();
      showToast(
        `+${newEntries.length} ${oneClickType} posé (${bridge.bridgeLabel}) → ${bridge.totalOffDays} jours de repos !`,
        () => {
          const newIds = new Set(newEntries.map((item) => item.id));
          const restored = leavesRef.current.filter((item) => !newIds.has(item.id));
          updateLeaves(restored);
          void syncToCloud(restored, quotas);
        }
      );
      await syncToCloud(updated, quotas);
    }
  };

  // Manual form submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formEndDate || formEndDate < formDate) {
      showToast('Choisissez une plage de dates valide.');
      return;
    }

    if (formDayPart !== 'full' && formDate !== formEndDate) {
      showToast('Une demi-journée doit porter sur une seule date.');
      return;
    }
    const range = formDayPart === 'full'
      ? getBookableLeaveDates(formDate, formEndDate, leaves.map((leave) => leave.date))
      : leaveRangePreview;
    const datesToBook = range?.dates ?? [];

    if (datesToBook.length === 0) {
      showToast(formDayPart === 'full'
        ? 'Aucun jour ouvré disponible dans cette plage.'
        : 'Cette date est un week-end, un jour férié ou déjà posée.');
      return;
    }

    const recordedAt = new Date().toISOString();
    const daysPerEntry = formDayPart === 'full' ? 1 : 0.5;
    const newItems: LeaveItem[] = datesToBook.map((date, index) => ({
      id: Date.now() + index,
      type: formType,
      date,
      days: daysPerEntry,
      ...(formDayPart !== 'full' ? { halfDay: formDayPart } : {}),
      recordedAt,
      label: formLabel.trim() || undefined,
    }));
    const updated = [...leaves, ...newItems].sort((a, b) => a.date.localeCompare(b.date));
    updateLeaves(updated);
    triggerHaptic();
    setIsModalOpen(false);
    setFormLabel('');
    setFormDate(formEndDate);
    setFormEndDate(formEndDate);
    setFormDayPart('full');
    showToast(
      `${formatFrNumber(datesToBook.length * daysPerEntry)} jour${datesToBook.length * daysPerEntry === 1 ? '' : 's'} (${formType}) ajouté${datesToBook.length > 1 ? 's' : ''}.`,
      () => {
        const newIds = new Set(newItems.map((item) => item.id));
        const restored = leavesRef.current.filter((item) => !newIds.has(item.id));
        updateLeaves(restored);
        void syncToCloud(restored, quotas);
      }
    );
    await syncToCloud(updated, quotas);
  };

  const handleDeleteLeave = async (id: number) => {
    const removedItem = leaves.find((item) => item.id === id);
    const updated = leaves.filter((item) => item.id !== id);
    updateLeaves(updated);
    triggerHaptic();
    if (removedItem) {
      showToast(`${removedItem.type} retiré du calendrier.`, () => {
        const restored = [...leavesRef.current, removedItem].sort((a, b) => a.date.localeCompare(b.date));
        updateLeaves(restored);
        void syncToCloud(restored, quotas);
      });
    }
    await syncToCloud(updated, quotas);
  };

  const handleCopyStandaloneHtml = async () => {
    try {
      await navigator.clipboard.writeText(STANDALONE_HTML_CODE);
      setCopiedCode(true);
      showToast('Code index.html complet copié dans le presse-papiers !');
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback textarea copy
      const textarea = document.createElement('textarea');
      textarea.value = STANDALONE_HTML_CODE;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCode(true);
      showToast('Code index.html complet copié !');
      setTimeout(() => setCopiedCode(false), 2500);
    }
  };

  const handleDownloadStandaloneHtml = () => {
    const blob = new Blob([STANDALONE_HTML_CODE], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Fichier index.html téléchargé.');
  };

  const openModalWithDate = (dateStr: string) => {
    triggerHaptic();
    setSelectedYear(Number(dateStr.slice(0, 4)));
    setFormDate(dateStr);
    setFormEndDate(dateStr);
    setFormDayPart('full');
    setFormType(oneClickType);
    setIsModalOpen(true);
  };

  const openNewLeaveModal = () => {
    const currentYear = new Date().getFullYear();
    const initialDate = selectedYear > currentYear ? `${selectedYear}-01-01` : todayStr;
    setFormDate(initialDate);
    setFormEndDate(initialDate);
    setFormDayPart('full');
    setFormType('CP');
    setIsModalOpen(true);
  };

  const formatFrNumber = (n: number) => n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const greetingName = profile.name;

  const MONTH_NAMES_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const calendarMonths = useMemo(() => {
    const [startYear, startMonth] = activeQuotaPeriod.start.split('-').map(Number);
    const [endYear, endMonth] = activeQuotaPeriod.end.split('-').map(Number);
    const months: {
      year: number;
      monthIndex: number;
      label: string;
      cells: ({ dayNumber: number; dateStr: string; isWeekend: boolean } | null)[];
    }[] = [];
    const monthCursor = new Date(startYear, startMonth - 1, 1);
    const finalMonth = new Date(endYear, endMonth - 1, 1);

    while (monthCursor <= finalMonth) {
      const year = monthCursor.getFullYear();
      const monthIndex = monthCursor.getMonth();
      const firstDay = new Date(year, monthIndex, 1);
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      const startDay = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
      const cells: ({ dayNumber: number; dateStr: string; isWeekend: boolean } | null)[] = [];
      for (let blank = 1; blank < startDay; blank++) cells.push(null);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex, day);
        cells.push({
          dayNumber: day,
          dateStr: toLocalIsoDate(date),
          isWeekend: date.getDay() === 0 || date.getDay() === 6,
        });
      }
      months.push({
        year,
        monthIndex,
        label: `${MONTH_NAMES_FR[monthIndex]} ${year}`,
        cells,
      });
      monthCursor.setMonth(monthCursor.getMonth() + 1);
    }
    return months;
  }, [activeQuotaPeriod]);

  const calendarCells = useMemo(() => {
    const year = selectedYear;
    const firstDay = new Date(year, calendarMonthIndex, 1);
    const daysInMonth = new Date(year, calendarMonthIndex + 1, 0).getDate();
    const startDay = firstDay.getDay() === 0 ? 7 : firstDay.getDay();
    const cells: ({ dayNumber: number; dateStr: string; isWeekend: boolean } | null)[] = [];
    for (let blank = 1; blank < startDay; blank++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, calendarMonthIndex, day);
      cells.push({
        dayNumber: day,
        dateStr: toLocalIsoDate(date),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      });
    }
    return cells;
  }, [calendarMonthIndex, selectedYear]);

  const themeOptions: { value: Personalization['theme']; label: string; icon: React.ElementType }[] = [
    { value: 'indigo', label: 'Indigo', icon: Palette },
    { value: 'pastel', label: 'Pastel', icon: Sparkles },
    { value: 'emerald', label: 'Émeraude', icon: Leaf },
    { value: 'dark', label: 'Sombre', icon: Moon },
    { value: 'cat', label: 'Chat 🐱', icon: Cat },
  ];

  return (
    <div
      data-theme={personalization.theme}
      style={{
        fontFamily: personalization.font === 'system'
          ? 'system-ui, -apple-system, sans-serif'
          : personalization.font === 'rounded'
            ? 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'
            : '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col"
    >
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 min-h-16 flex items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0">
          <a href="#top" className="text-lg font-extrabold tracking-tight text-indigo-600">
            JoursOff
          </a>
          <p className="text-xs text-slate-500 truncate">
            Bonjour {greetingName} 👋
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              aria-label="Installer l’application"
              className="hidden sm:flex p-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-indigo-600" />
            </button>
          )}
          <button
            onClick={openProfileSettings}
            aria-label="Ouvrir le profil et les réglages"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
          >
            <span className="text-base" aria-hidden="true">{profile.avatar}</span>
          </button>
          <button
            onClick={openProfileSettings}
            aria-label={isSyncing ? 'Synchronisation en cours' : user ? 'Sauvegarde automatique active' : 'Données enregistrées sur cet appareil'}
            title={user ? 'Sauvegarde auto' : 'Sauvegarde locale'}
            className="p-2 rounded-xl hover:bg-slate-100 cursor-pointer"
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            ) : user ? (
              <CloudCheck className="h-4 w-4 text-emerald-600" />
            ) : (
              <Cloud className="h-4 w-4 text-slate-400" />
            )}
          </button>
          <button
            onClick={openNewLeaveModal}
            className="px-3 sm:px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Poser un jour off</span>
            <span className="sm:hidden">Poser un jour</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="toast-enter fixed bottom-24 sm:bottom-5 right-4 sm:right-5 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 max-w-[calc(100vw-2rem)]"
        >
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage.message}</span>
          {toastMessage.undo && (
            <button
              type="button"
              onClick={() => {
                const undo = toastMessage.undo;
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
                toastTimerRef.current = null;
                setToastMessage(null);
                if (undo) undo();
              }}
              className="ml-2 shrink-0 rounded-lg bg-white/15 px-2.5 py-1.5 font-extrabold text-white transition hover:bg-white/25 active:scale-95"
            >
              Annuler
            </button>
          )}
        </div>
      )}

      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-5 sm:py-8 pb-24 sm:pb-8">
        <nav aria-label="Vues principales" className="hidden sm:flex gap-2 mb-5">
          {[
            { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
            { id: 'optimizer', label: 'Optimiseur de ponts', icon: Zap },
            { id: 'holidays', label: 'Jours fériés', icon: Calendar },
          ].map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.id}
                type="button"
                onClick={() => setActiveView(view.id as typeof activeView)}
                aria-current={activeView === view.id ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition active:scale-95 ${
                  activeView === view.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                {view.label}
              </button>
            );
          })}
        </nav>

        {activeView === 'calendar' && (
          <section key={activeView} aria-label="Calendrier annuel" className="view-enter space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-extrabold text-slate-900">
                  {calendarViewMode === 'partner'
                    ? `Calendrier de ${partnerCalendar?.partnerName ?? 'mon partenaire'}`
                    : calendarViewMode === 'duo'
                      ? 'Vue Duo / Superposée'
                      : 'Mon calendrier'}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  Période de validité · {formatShortDateFr(activeQuotaPeriod.start)} {activeQuotaPeriod.start.slice(0, 4)} – {formatShortDateFr(activeQuotaPeriod.end)} {activeQuotaPeriod.end.slice(0, 4)}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3 text-[11px]">
                <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 shadow-sm">
                  Année
                  <select
                    aria-label="Année du calendrier"
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                    className="bg-transparent font-extrabold text-indigo-700 focus:outline-none"
                  >
                    {[new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 shadow-sm">
                  <span className="sr-only">Vue du calendrier</span>
                  <select
                    aria-label="Vue du calendrier"
                    value={calendarViewMode}
                    onChange={(event) => setCalendarViewMode(event.target.value as typeof calendarViewMode)}
                    className="max-w-48 bg-transparent font-bold text-slate-700 focus:outline-none"
                  >
                    <option value="mine">Mon calendrier</option>
                    <option value="partner" disabled={!partnerCalendar}>
                      Calendrier de {partnerCalendar?.partnerName ?? 'mon partenaire'}
                    </option>
                    <option value="duo" disabled={!partnerCalendar}>Vue Duo / Superposée</option>
                  </select>
                </label>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />CP posé</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />RTT posé</span>
                {partnerCalendar && (
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-fuchsia-400" />{partnerCalendar.partnerName}</span>
                )}
                {partnerCalendar && (
                  <span className="rounded-full bg-gradient-to-r from-emerald-50 to-fuchsia-50 px-2.5 py-1 font-bold text-fuchsia-700">
                    🏖️ Repos partagé
                  </span>
                )}
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-300" />Férié</span>
              </div>
            </div>

            {nextRestDay && (
              <aside className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-600">
                      Prochain repos
                    </p>
                    <p className="mt-0.5 truncate text-sm font-extrabold text-slate-900">
                      {nextRestDay.description}
                    </p>
                    <p className="text-[11px] font-medium text-slate-500">
                      {formatShortDateFr(nextRestDay.date)} · {nextRestDay.isHoliday ? 'Jour férié ou congé' : 'Congé posé'}
                    </p>
                  </div>
                  <span className="flex h-12 min-w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white/80 px-2 text-indigo-700 shadow-sm">
                    <strong className="text-lg leading-none">{nextRestDay.daysUntil}</strong>
                    <span className="mt-0.5 text-[9px] font-bold">{nextRestDay.daysUntil === 1 ? 'JOUR' : 'JOURS'}</span>
                  </span>
                </div>
              </aside>
            )}

            <div className="grid grid-cols-2 gap-3">
              <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">CP disponibles</span>
                  <button
                    type="button"
                    onClick={() => openQuotaEditor('cp')}
                    aria-label="Modifier le solde de congés payés"
                    title="Modifier le solde de congés payés"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">
                  {formatFrNumber(cpRemaining)}
                  <span className="ml-1 text-xs font-semibold text-slate-400">j</span>
                </p>
              </article>
              <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-500">RTT disponibles</span>
                  <button
                    type="button"
                    onClick={() => openQuotaEditor('rtt')}
                    aria-label="Modifier le solde de RTT"
                    title="Modifier le solde de RTT"
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-2xl font-extrabold text-indigo-600">
                  {formatFrNumber(rttRemaining)}
                  <span className="ml-1 text-xs font-semibold text-slate-400">j</span>
                  {quotas.rttMode === 'monthly' && quotas.rttMax !== null && (
                    <span className="ml-1 text-xs font-semibold text-slate-400">
                      / {formatFrNumber(quotas.rttMax)}
                    </span>
                  )}
                </p>
              </article>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {calendarMonths.map((month) => {
                const holidays = new Map(
                  getFrenchHolidays(month.year).map((holiday) => [holiday.date, holiday])
                );
                return (
                  <article key={`${month.year}-${month.monthIndex}`} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                    <h2 className="mb-2 text-sm font-extrabold text-slate-800">{month.label}</h2>
                    <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-bold text-slate-400">
                      {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => (
                        <span key={`${day}-${index}`} className={index > 4 ? 'text-slate-300' : ''}>{day}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {month.cells.map((cell, index) => {
                        if (!cell) return <span key={`blank-${index}`} className="aspect-square" />;
                        const { dateStr, dayNumber, isWeekend } = cell;
                        const myDayLeaves = leaves.filter((item) => item.date === dateStr);
                        const partnerDayLeaves = partnerCalendar?.leaves.filter((item) => item.date === dateStr) ?? [];
                        const isSharedRest = myDayLeaves.length > 0 && partnerDayLeaves.length > 0;
                        const dayLeaves = calendarViewMode === 'partner'
                          ? partnerDayLeaves
                          : calendarViewMode === 'duo'
                            ? [...myDayLeaves, ...partnerDayLeaves]
                            : myDayLeaves;
                        const leave = calendarViewMode === 'partner'
                          ? partnerDayLeaves[0]
                          : myDayLeaves[0] ?? (calendarViewMode === 'duo' ? partnerDayLeaves[0] : undefined);
                        const isPartnerOnly = calendarViewMode === 'partner' && Boolean(leave);
                        const holiday = holidays.get(dateStr);
                        const inPeriod = dateStr >= activeQuotaPeriod.start && dateStr <= activeQuotaPeriod.end;
                        const isPast = dateStr < todayStr;
                        const pastCanBeBooked = month.year === new Date().getFullYear();
                        const disabled = calendarViewMode === 'partner' || (!myDayLeaves.length && (
                          !inPeriod ||
                          isWeekend ||
                          Boolean(holiday) ||
                          (isPast && !pastCanBeBooked)
                        ));
                        const dayColor = isSharedRest
                          ? 'bg-gradient-to-br from-emerald-500 to-fuchsia-500 text-white ring-2 ring-white shadow-sm'
                          : isPartnerOnly
                            ? 'bg-fuchsia-100 text-fuchsia-800 ring-1 ring-fuchsia-200'
                            : leave
                          ? leave.type === 'CP'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-indigo-600 text-white'
                          : holiday
                            ? 'bg-amber-100 text-amber-800'
                            : !inPeriod || isWeekend || (isPast && !pastCanBeBooked)
                              ? 'text-slate-300'
                              : 'text-slate-700 hover:bg-indigo-50';
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (calendarViewMode === 'partner') return;
                              myDayLeaves[0] ? handleDeleteLeave(myDayLeaves[0].id) : openModalWithDate(dateStr);
                            }}
                            title={isSharedRest
                              ? `Repos partagé avec ${partnerCalendar?.partnerName} 🏖️`
                              : leave
                                ? `${dayLeaves.map((item) => `${item.type}${item.halfDay ? ` demi-journée ${item.halfDay === 'morning' ? 'matin' : 'après-midi'}` : ''}`).join(' + ')} posé${isPartnerOnly ? ` par ${partnerCalendar?.partnerName}` : ''}${calendarViewMode !== 'partner' ? ' · toucher pour retirer' : ''}`
                              : holiday
                                ? `${holiday.name} · jour férié`
                                : !inPeriod
                                  ? 'Hors période de validité'
                                  : isPast && !pastCanBeBooked
                                    ? 'Date passée'
                                    : 'Poser un jour off'}
                            className={`calendar-day relative aspect-square rounded-lg text-[10px] font-bold transition disabled:cursor-default ${dayColor}`}
                          >
                            {leave ? `${dayNumber} ${leave.type}${leave.days === 0.5 ? ' ½' : ''}` : dayNumber}
                            {isSharedRest && (
                              <span
                                aria-label="Repos partagé"
                                className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-white px-0.5 text-[9px] shadow"
                              >
                                🏖️
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="text-center text-[11px] text-slate-500">
              {calendarViewMode === 'partner'
                ? `Calendrier en lecture seule de ${partnerCalendar?.partnerName ?? 'votre partenaire'}.`
                : calendarViewMode === 'duo'
                  ? '🏖️ Les dates partagées sont vos repos communs. Une action ne modifie que votre calendrier.'
                  : 'Touchez un jour ouvré pour le poser. Touchez un CP ou RTT posé pour le retirer.'}
            </p>
          </section>
        )}

        <div className={activeView === 'calendar' ? 'hidden' : 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start'}>
          <div className="hidden" id="soldes">
            {/* Cartes de Solde avec Barre de Progression */}
            <div className="grid grid-cols-2 gap-3.5">
              {/* Carte CP */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Congés Payés (CP)</span>
                    <button
                      type="button"
                      onClick={() => openQuotaEditor('cp')}
                      className="text-slate-400 hover:text-indigo-600 p-1.5 -mr-1.5 rounded-xl hover:bg-slate-50 transition cursor-pointer"
                      title="Modifier le solde initial de CP"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p id="cp-count" className="text-3xl font-extrabold text-slate-900 mt-1.5 font-mono-tabular">
                    {formatFrNumber(cpRemaining)}
                  </p>
                </div>

                <div className="mt-3">
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, (cpRemaining / (quotas.cp || 1)) * 100))}%`
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-emerald-700 font-semibold">restants</span>
                    <button
                      type="button"
                      onClick={() => openQuotaEditor('cp')}
                      className="font-mono-tabular hover:text-indigo-600 underline decoration-dotted underline-offset-2 cursor-pointer"
                    >
                      sur {String(quotas.cp).replace('.', ',')}j
                    </button>
                  </div>
                </div>
              </div>

              {/* Carte RTT */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-sm transition flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">RTT</span>
                    <button
                      type="button"
                      onClick={() => openQuotaEditor('rtt')}
                      className="text-slate-400 hover:text-indigo-600 p-1.5 -mr-1.5 rounded-xl hover:bg-slate-50 transition cursor-pointer"
                      title="Modifier le solde initial de RTT"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p id="rtt-count" className="text-3xl font-extrabold text-indigo-600 mt-1.5 font-mono-tabular">
                    {formatFrNumber(rttRemaining)}
                  </p>
                </div>

                <div className="mt-3">
                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(0, Math.min(100, (rttRemaining / (rttAllowance || 1)) * 100))}%`
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-indigo-600 font-semibold">restants</span>
                    <button
                      type="button"
                      onClick={() => openQuotaEditor('rtt')}
                      className="font-mono-tabular hover:text-indigo-600 underline decoration-dotted underline-offset-2 cursor-pointer"
                    >
                      sur {formatFrNumber(rttAllowance)}j
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {rttNearLimit && (
              <div
                role="status"
                className={`rounded-2xl border px-4 py-3 text-xs font-semibold ${
                  rttRemaining >= (quotas.rttMax ?? 0)
                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                    : 'border-orange-200 bg-orange-50 text-orange-800'
                }`}
              >
                {rttRemaining >= (quotas.rttMax ?? 0)
                  ? `Plafond RTT atteint (${formatFrNumber(quotas.rttMax ?? 0)} j). Certaines acquisitions peuvent être perdues : pensez à poser des RTT.`
                  : `Attention : ${formatFrNumber(rttRemaining)} RTT disponibles sur ${formatFrNumber(quotas.rttMax ?? 0)}. Le plafond approche, pensez à les poser.`}
              </div>
            )}

            {/* Vue Calendrier & Liste des absences */}
            <section id="absences" className="pt-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 bg-slate-200/60 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setLeftViewMode('calendrier')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      leftViewMode === 'calendrier'
                        ? 'bg-white text-indigo-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📅 Vue Calendrier
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftViewMode('liste')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                      leftViewMode === 'liste'
                        ? 'bg-white text-indigo-600 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📋 Jours posés ({leaves.length})
                  </button>
                </div>

                {leftViewMode === 'liste' && leaves.length > 0 && (
                  <button
                    onClick={async () => {
                      const removedLeaves = leavesRef.current;
                      updateLeaves([]);
                      triggerHaptic();
                      showToast('Tous les jours posés ont été réinitialisés.', () => {
                        const restored = [...leavesRef.current, ...removedLeaves].sort((a, b) => a.date.localeCompare(b.date));
                        updateLeaves(restored);
                        void syncToCloud(restored, quotas);
                      });
                      await syncToCloud([], quotas);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tout effacer</span>
                  </button>
                )}
              </div>

              {/* CONTENU VUE CALENDRIER */}
              {leftViewMode === 'calendrier' ? (
                <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
                  {/* Selecteur de Mois */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <button
                      type="button"
                      disabled={selectedYear === new Date().getFullYear() && calendarMonthIndex === 0}
                      onClick={() => {
                        if (calendarMonthIndex === 0) {
                          setCalendarMonthIndex(11);
                          setSelectedYear((year) => year - 1);
                        } else {
                          setCalendarMonthIndex((month) => month - 1);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ← Préc.
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold text-slate-900">
                        {MONTH_NAMES_FR[calendarMonthIndex]}
                      </span>
                      <select
                        aria-label="Année du calendrier"
                        value={selectedYear}
                        onChange={(event) => setSelectedYear(Number(event.target.value))}
                        className="bg-transparent text-sm font-bold text-indigo-700 focus:outline-none cursor-pointer"
                      >
                        {[new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      disabled={selectedYear === new Date().getFullYear() + 1 && calendarMonthIndex === 11}
                      onClick={() => {
                        if (calendarMonthIndex === 11) {
                          setCalendarMonthIndex(0);
                          setSelectedYear((year) => year + 1);
                        } else {
                          setCalendarMonthIndex((month) => month + 1);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Suiv. →
                    </button>
                  </div>

                  {/* Légende du Calendrier */}
                  <div className="flex flex-wrap items-center gap-2.5 text-[11px] pt-1">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      <span className="text-slate-600 font-medium">CP posé</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                      <span className="text-slate-600 font-medium">RTT posé</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      <span className="text-slate-600 font-medium">Férié</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-indigo-200 border border-indigo-400 inline-block" />
                      <span className="text-slate-600 font-medium">Pont conseillé</span>
                    </span>
                  </div>

                  {/* En-tête des jours de la semaine */}
                  <div className="grid grid-cols-7 text-center text-[11px] font-bold text-slate-400 gap-1 pt-1">
                    <div>Lun</div>
                    <div>Mar</div>
                    <div>Mer</div>
                    <div>Jeu</div>
                    <div>Ven</div>
                    <div className="text-slate-300">Sam</div>
                    <div className="text-slate-300">Dim</div>
                  </div>

                  {/* Grille du Calendrier */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarCells.map((cell, idx) => {
                      if (!cell) {
                        return <div key={`empty-${idx}`} className="h-10 rounded-xl bg-slate-50/50" />;
                      }

                      const { dayNumber, dateStr, isWeekend } = cell;
                      const holiday = selectedHolidays.find((h) => h.date === dateStr);
                      const leaveItem = leaves.find((l) => l.date === dateStr);
                      const bridgeOpt = allBridges.find((b) => b.bridgeDates.includes(dateStr));

                      // Vérification date passée (comparaison YYYY-MM-DD stable)
                      const todayStr = new Date().toLocaleDateString('sv'); // format YYYY-MM-DD
                      const isPast = dateStr < todayStr;
                      const canBookRetroactively = selectedYear === new Date().getFullYear();
                      const isUnavailablePast = isPast && !canBookRetroactively;

                      let cellBg = 'bg-white text-slate-800 border border-slate-200/80 hover:bg-indigo-50/60';
                      let badgeText = '';
                      let badgeStyle = '';

                      if (leaveItem) {
                        if (leaveItem.type === 'CP') {
                          cellBg = 'bg-emerald-500 text-white font-bold shadow-xs hover:bg-emerald-600';
                          badgeText = 'CP';
                          badgeStyle = 'bg-emerald-700 text-white';
                        } else {
                          cellBg = 'bg-indigo-600 text-white font-bold shadow-xs hover:bg-indigo-700';
                          badgeText = 'RTT';
                          badgeStyle = 'bg-indigo-800 text-white';
                        }
                      } else if (holiday) {
                        cellBg = isUnavailablePast
                          ? 'bg-amber-50 text-amber-300 border border-amber-100 font-extrabold cursor-default opacity-60'
                          : 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold hover:bg-amber-200';
                        badgeText = 'Férié';
                        badgeStyle = isUnavailablePast ? 'bg-amber-100 text-amber-300' : 'bg-amber-200 text-amber-950';
                      } else if (bridgeOpt && !isUnavailablePast) {
                        cellBg = 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100';
                        badgeText = 'Pont';
                        badgeStyle = 'bg-indigo-200 text-indigo-900';
                      } else if (isWeekend || isUnavailablePast) {
                        cellBg = 'bg-slate-100/70 text-slate-300 border border-transparent cursor-default';
                      }

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isUnavailablePast && !leaveItem}
                          onClick={() => {
                            if (leaveItem) {
                              handleDeleteLeave(leaveItem.id);
                            } else if (!isWeekend && (!isPast || canBookRetroactively)) {
                              openModalWithDate(dateStr);
                            }
                          }}
                          className={`h-11 rounded-xl p-1 flex flex-col items-center justify-between text-xs transition ${isUnavailablePast && !leaveItem ? 'cursor-default' : 'cursor-pointer'} ${cellBg}`}
                          title={
                            leaveItem
                              ? `${leaveItem.type} posé le ${dateStr} (Cliquer pour supprimer)`
                              : isUnavailablePast
                              ? 'Date passée'
                              : holiday
                              ? `${holiday.name} (Jour férié)`
                              : `Cliquer pour poser un jour off le ${dateStr}`
                          }
                        >
                          <span className="font-extrabold leading-none">{dayNumber}</span>
                          {badgeText && (
                            <span className={`text-[9px] font-bold px-1 rounded truncate max-w-full ${badgeStyle}`}>
                              {badgeText}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 text-center pt-1">
                    💡 Cliquez sur n&apos;importe quelle date du calendrier pour poser directement un jour off.
                  </p>
                </div>
              ) : (
                /* CONTENU VUE LISTE */
                <div id="leave-list" className="space-y-2.5">
                  {leaves.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 text-center shadow-xs">
                      <p className="text-xs text-slate-500">
                        Aucun jour posé pour l&apos;instant. Cliquez sur un jour du calendrier ou sur{' '}
                        <strong className="text-slate-700">+ Poser en 1 clic</strong> dans
                        l&apos;Optimiseur de Ponts pour démarrer !
                      </p>
                    </div>
                  ) : (
                    leaves.map((item) => {
                      const [y, m, d] = item.date.split('-').map(Number);
                      const dateObj = new Date(y, m - 1, d);
                      const dateFormatted = dateObj.toLocaleDateString('fr-FR', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      });

                      return (
                        <div
                          key={item.id}
                          className="bg-white p-3.5 rounded-2xl border border-slate-200/80 flex justify-between items-center hover:border-slate-300 transition shadow-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`text-xs font-extrabold shrink-0 ${
                                item.type === 'CP' ? 'text-emerald-700' : 'text-indigo-600'
                              }`}
                            >
                              {item.type}
                            </span>
                            <span className="text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-semibold text-slate-800 capitalize truncate">
                              {dateFormatted}
                            </span>
                            {item.label && (
                              <>
                                <span className="text-slate-300" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-xs text-slate-500 truncate">
                                  {item.label}
                                </span>
                              </>
                            )}
                            {item.halfDay && (
                              <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                {item.halfDay === 'morning' ? 'Matin' : 'Après-midi'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs font-bold text-slate-700 font-mono-tabular">
                              -{String(item.days).replace('.', ',')} j
                            </span>
                            <button
                              onClick={() => handleDeleteLeave(item.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition cursor-pointer"
                              title="Supprimer ce jour off"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN (7 cols on desktop): Optimiseur de Ponts 2026 + Calendrier des 11 Jours Fériés */}
          <div className="lg:col-span-12 space-y-8">
            {/* Section Bons plans de ponts 2026 */}
            <section key={`optimizer-${activeView}`} className={activeView === 'optimizer' ? 'view-enter' : 'hidden'} id="optimiseur">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h2 className="text-base font-extrabold text-slate-900">
                      Optimiseur de ponts
                    </h2>
                  </div>
                </div>

                {/* Sélecteur d'année + type de congé */}
                <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                  {/* Toggle année */}
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                    {[new Date().getFullYear(), new Date().getFullYear() + 1].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setSelectedYear(yr)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                          selectedYear === yr
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                  {/* Toggle CP / RTT */}
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOneClickType('RTT')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                        oneClickType === 'RTT'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      RTT
                    </button>
                    <button
                      type="button"
                      onClick={() => setOneClickType('CP')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                        oneClickType === 'CP'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      CP
                    </button>
                  </div>
                </div>
              </div>

              <p className="mb-3 text-[11px] text-slate-500">
                {profile.departureCity
                  ? `Météo à ${profile.departureCity.name} et idées de sorties régionales · prévisions disponibles jusqu'à 16 jours.`
                  : 'Ville de départ non renseignée : les conseils météo et idées de sorties ne seront pas personnalisés.'}
              </p>
              {!profile.departureCity && (
                <button
                  type="button"
                  onClick={openProfileSettings}
                  className="mb-3 rounded-xl bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800 hover:bg-sky-100"
                >
                  Ajouter ma ville de départ
                </button>
              )}
              {weatherError && (
                <p role="status" className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                  {weatherError}
                </p>
              )}

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl w-fit mb-4">
                <button
                  type="button"
                  onClick={() => setActiveBridgeFilter('prioritaires')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                    activeBridgeFilter === 'prioritaires'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ponts Mar / Mer / Jeu ({allBridges.filter(b => (b.kind === 'pont_royal' || b.kind === 'viaduc') && b.bridgeDates.some(d => d >= todayStr)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveBridgeFilter('tous')}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer whitespace-nowrap ${
                    activeBridgeFilter === 'tous'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Avec week-ends prolongés ({allBridges.filter(b => b.bridgeDates.some(d => d >= todayStr)).length})
                </button>
              </div>

              {/* Opportunity Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {displayedBridges.map((bridge) => {
                  const booked = isBridgeBooked(bridge);
                  const additionalCost = getBridgeAdditionalCost(bridge);
                  const balanceDate = bridge.bridgeDates.reduce((latest, date) => date > latest ? date : latest, todayStr);
                  const currentBalance = oneClickType === 'RTT'
                    ? getRttBalanceAtDate(balanceDate)
                    : cpRemaining;
                  const projectedBalance = currentBalance - additionalCost;
                  const hasEnoughBalance = additionalCost <= currentBalance;
                  const departureForecasts = profile.departureCity
                    ? weatherByCity[profile.departureCity.name] ?? []
                    : [];
                  const bridgeWeather = bridge.timeline.flatMap((slot) => {
                    const forecast = departureForecasts.find((day) => day.date === slot.date);
                    return forecast ? [{ ...forecast, label: slot.label }] : [];
                  });
                  const regionalForecasts = SUGGESTED_DESTINATIONS.flatMap((destination) => {
                    const forecast = (weatherByCity[destination.name] ?? [])
                      .filter((day) => bridge.timeline.some((slot) => slot.date === day.date));
                    if (forecast.length === 0) return [];
                    const averageRain = forecast.reduce((sum, day) => sum + day.precipitationProbability, 0) / forecast.length;
                    const averageTemperature = forecast.reduce((sum, day) => sum + day.maximumTemperature, 0) / forecast.length;
                    const weatherScore = averageRain + Math.abs(averageTemperature - 22) * 2;
                    return [{ destination, forecast, averageRain, averageTemperature, weatherScore }];
                  }).sort((a, b) => a.weatherScore - b.weatherScore);
                  const recommendedRegion = regionalForecasts[0];
                  return (
                    <div
                      key={bridge.id}
                      className={`bg-white rounded-2xl p-4 border shadow-sm transition flex flex-col justify-between ${
                        booked
                          ? 'border-emerald-300 bg-emerald-50/15'
                          : 'border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-extrabold text-slate-900">
                              {bridge.holidayName}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5">{bridge.holidayDayLabel}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700">
                            🔥 Gain +{bridge.totalOffDays}j
                          </span>
                        </div>

                        <p className="mt-2 text-xs font-semibold text-slate-700">
                          Poser le {bridge.bridgeLabel}
                        </p>

                        {/* Visual Day Strip */}
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mt-3">
                          {bridge.timeline.map((slot) => (
                            <div
                              key={slot.date}
                              className={`rounded-xl px-2 py-1.5 text-center border ${
                                slot.status === 'ferie'
                                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900'
                                  : slot.status === 'pont'
                                  ? 'bg-amber-50/80 border-amber-300 text-amber-900'
                                  : 'bg-slate-50 border-slate-200/70 text-slate-600'
                              }`}
                            >
                              <div className="text-[11px] font-bold">
                                {slot.label}
                              </div>
                              <div className="text-[10px] font-medium mt-0.5">
                                {slot.status === 'ferie'
                                  ? 'Férié'
                                  : slot.status === 'pont'
                                  ? 'À poser'
                                  : 'Repos'}
                              </div>
                            </div>
                          ))}
                        </div>
                        {profile.departureCity && <div className="mt-3 rounded-xl bg-sky-50/80 p-3">
                          <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800">
                            Météo du pont
                          </p>
                          {weatherLoading && bridgeWeather.length === 0 ? (
                            <p className="mt-1 text-[11px] text-sky-700">Recherche des prévisions…</p>
                          ) : bridgeWeather.length > 0 ? (
                            <>
                              <p className="mt-1 text-[11px] font-semibold text-sky-900">
                                {profile.departureCity.name} · {bridgeWeather.map((day) => {
                                  const description = weatherDescription(day.code);
                                  return `${day.label} ${description.icon} ${Math.round(day.maximumTemperature)}°`;
                                }).join(' · ')}
                              </p>
                              {recommendedRegion && (
                                <p className="mt-2 text-[11px] leading-relaxed text-sky-800">
                                  <strong>Idée sortie · {recommendedRegion.destination.name} :</strong>{' '}
                                  {recommendedRegion.averageRain < 45
                                    ? recommendedRegion.destination.activities.dry
                                    : recommendedRegion.destination.activities.rainy}
                                  <span className="ml-1 text-sky-600">
                                    ({Math.round(recommendedRegion.averageTemperature)}° · pluie {Math.round(recommendedRegion.averageRain)} %)
                                  </span>
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="mt-1 text-[11px] text-sky-700">
                              Prévisions non disponibles aussi longtemps à l&apos;avance. Elles apparaîtront jusqu&apos;à 16 jours avant le pont.
                            </p>
                          )}
                        </div>}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[11px] font-semibold ${hasEnoughBalance ? 'text-slate-600' : 'text-red-600'}`}>
                            Solde prévu le {formatShortDateFr(balanceDate)} : {formatFrNumber(projectedBalance)} {oneClickType}
                            {!hasEnoughBalance && ' · Solde insuffisant'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {additionalCost > 0 ? `-${additionalCost} ${oneClickType}` : 'Déjà dans vos jours posés'}
                          </span>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={!booked && !hasEnoughBalance}
                            onClick={() => handleOneClickBridge(bridge)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
                              booked
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                            }`}
                          >
                            {booked ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Posé · Retirer</span>
                              </>
                            ) : hasEnoughBalance ? (
                              <>
                                <Zap className="w-3.5 h-3.5" />
                                <span>Poser · {additionalCost} {oneClickType}</span>
                              </>
                            ) : (
                              <span>Solde insuffisant</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section : Analyse complète des 11 jours fériés français 2026 */}
            <section key={`holidays-${activeView}`} id="calendrier" className={`bg-white rounded-2xl border border-slate-200/80 p-5 ${activeView === 'holidays' ? 'view-enter' : 'hidden'}`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Jours fériés {selectedYear}
                  </h2>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {holidaySummary.map((h) => (
                  <div
                    key={h.date}
                    className="py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{h.name}</span>
                      <span className="text-slate-500">
                        {h.dayFull} {h.formattedDate} {selectedYear}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          h.status === 'pont_mardi_jeudi'
                            ? 'bg-violet-100 text-violet-700'
                            : h.status === 'viaduc_mercredi'
                            ? 'bg-blue-100 text-blue-700'
                            : h.status === 'weekend_3j'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                    >
                      {h.status === 'pont_mardi_jeudi'
                        ? 'Pont 4j'
                        : h.status === 'viaduc_mercredi'
                          ? 'Pont 5j'
                          : h.status === 'weekend_3j'
                            ? 'Week-end 3j'
                            : 'Week-end'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-[0_-4px_18px_rgba(15,23,42,0.06)] backdrop-blur-md sm:hidden"
      >
        {[
          { id: 'calendar', label: 'Calendrier', icon: Home },
          { id: 'optimizer', label: 'Optimiseur', icon: Zap },
          { id: 'holidays', label: 'Fériés', icon: CalendarDays },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveView(item.id as typeof activeView)}
              aria-current={activeView === item.id ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-1 text-[10px] font-semibold ${
                activeView === item.id ? 'text-indigo-600' : 'text-slate-500 hover:text-indigo-600'
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openProfileSettings}
          className="flex flex-col items-center gap-1 py-1 text-[10px] font-semibold text-slate-500 hover:text-indigo-600"
        >
          <UserRound className="h-5 w-5" />
          Compte
        </button>
      </nav>

      {/* Modal: Connexion / Inscription Supabase */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-lg">
                  {user ? 'Mon compte' : 'Connexion Cloud'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <UserRound className="h-4 w-4 text-indigo-600" />
                Mon profil
              </h4>
              <label className="block text-xs font-semibold text-slate-600">
                Nom affiché
                <input
                  type="text"
                  maxLength={40}
                  value={profileNameInput}
                  onChange={(event) => setProfileNameInput(event.target.value)}
                  placeholder="Votre prénom"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-800 focus:outline-indigo-600"
                />
              </label>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-600">Avatar</p>
                <div className="flex flex-wrap gap-2">
                  {['👋', '😊', '😎', '🌞', '🐱', '🐼', '🦊', '🌿'].map((avatar) => (
                    <button
                      key={avatar}
                      type="button"
                      onClick={() => handleSelectAvatar(avatar)}
                      aria-label={`Choisir l’avatar ${avatar}`}
                      aria-pressed={profile.avatar === avatar}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition ${
                        profile.avatar === avatar
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      {avatar}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Ville de départ pour la météo
                <input
                  type="text"
                  maxLength={80}
                  value={profileCityInput}
                  onChange={(event) => setProfileCityInput(event.target.value)}
                  placeholder="Ex. Lyon"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-800 focus:outline-indigo-600"
                />
              </label>
              {!profile.departureCity && (
                <p className="text-[10px] leading-relaxed text-amber-700">
                  Facultatif. Sans ville, les conseils météo et suggestions de région ne seront pas personnalisés.
                </p>
              )}
              {profileError && (
                <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                  {profileError}
                </p>
              )}
              <button
                type="button"
                disabled={profileSaving}
                onClick={handleSaveProfile}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-60"
              >
                {profileSaving ? 'Enregistrement…' : 'Enregistrer le profil'}
              </button>
              <p className="text-[10px] leading-relaxed text-slate-500">
                Nom, avatar et ville enregistrés sur cet appareil{user ? ' et dans les métadonnées de votre compte' : ''}. La météo est fournie par Open-Meteo, sans clé API.
              </p>
            </section>

            <section className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/50 p-3.5 space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <Home className="h-4 w-4 text-fuchsia-600" />
                Partage / Duo
              </h4>
              {duoRelationship?.status === 'accepted' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-xl border border-fuchsia-100 bg-white p-3">
                    <span className="text-2xl" aria-hidden="true">{duoRelationship.partnerAvatar}</span>
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">
                        Calendrier lié à {duoRelationship.partnerName}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Les dates, types et demi-journées posés sont partagés. Soldes et libellés restent privés.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={duoBusy}
                    onClick={() => void handleRefreshDuo()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-fuchsia-100 bg-white py-2 text-xs font-bold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Actualiser le calendrier partagé
                  </button>
                  <button
                    type="button"
                    disabled={duoBusy}
                    onClick={handleUnlinkDuo}
                    className="w-full rounded-xl border border-red-200 bg-white py-2 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Délier les comptes
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {!user && (
                    <p className="rounded-xl bg-amber-50 p-2.5 text-[11px] font-semibold text-amber-800">
                      Connectez-vous à votre compte pour créer ou rejoindre un partage.
                    </p>
                  )}
                  {duoRelationship?.status === 'pending' && duoRelationship.inviteCode && (
                    <div className="rounded-xl border border-fuchsia-100 bg-white p-3">
                      <p className="text-[10px] font-semibold text-slate-500">Votre code d’invitation</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <code className="text-sm font-extrabold tracking-wide text-fuchsia-700">
                          {duoRelationship.inviteCode}
                        </code>
                        <button
                          type="button"
                          onClick={() => void handleCopyDuoCode(duoRelationship.inviteCode!)}
                          aria-label="Copier le code d’invitation"
                          className="rounded-lg bg-fuchsia-50 p-2 text-fuchsia-700 transition hover:bg-fuchsia-100"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-500">
                        Partagez ce code avec votre conjoint ou ami. Il pourra le saisir dans son compte.
                      </p>
                    </div>
                  )}
                  {!duoRelationship && (
                    <button
                      type="button"
                      disabled={!user || duoBusy}
                      onClick={() => void handleCreateDuoInvitation()}
                      className="w-full rounded-xl bg-fuchsia-600 py-2.5 text-xs font-extrabold text-white transition hover:bg-fuchsia-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {duoBusy ? 'Création…' : 'Générer un code d’invitation'}
                    </button>
                  )}
                  {user && (
                    <form onSubmit={handleAcceptDuoInvitation} className="space-y-2">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Saisir le code reçu
                        <input
                          type="text"
                          autoCapitalize="characters"
                          maxLength={13}
                          value={duoInviteInput}
                          onChange={(event) => setDuoInviteInput(event.target.value.toUpperCase())}
                          placeholder="JOURSOFF-88A2"
                          disabled={duoBusy}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm font-bold tracking-wide text-slate-800 placeholder:font-medium placeholder:tracking-normal"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={duoBusy || !duoInviteInput.trim()}
                        className="w-full rounded-xl border border-fuchsia-200 bg-white py-2.5 text-xs font-extrabold text-fuchsia-700 transition hover:bg-fuchsia-50 disabled:opacity-50"
                      >
                        {duoBusy ? 'Connexion…' : 'Rejoindre ce partage'}
                      </button>
                    </form>
                  )}
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    Le partage est révocable à tout moment. Aucun solde, email ou libellé de congé n’est transmis.
                  </p>
                </div>
              )}
              {duoError && (
                <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-[11px] font-semibold text-red-700">
                  {duoError}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-3">
              <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
                <Palette className="h-4 w-4 text-indigo-600" />
                Personnalisation
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPersonalization((current) => ({ ...current, theme: option.value }))}
                      aria-pressed={personalization.theme === option.value}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-[10px] font-bold transition ${
                        personalization.theme === option.value
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Type className="h-4 w-4 text-indigo-600" />
                Police
                <select
                  value={personalization.font}
                  onChange={(event) => setPersonalization((current) => ({
                    ...current,
                    font: event.target.value as Personalization['font'],
                  }))}
                  className="ml-auto rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700"
                >
                  <option value="jakarta">Plus Jakarta Sans</option>
                  <option value="system">Système</option>
                  <option value="rounded">Arrondie</option>
                </select>
              </label>
            </section>

            {user ? (
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 space-y-1">
                  <p className="font-bold">Sauvegarde auto activée ✓</p>
                  <p className="font-semibold text-indigo-700 break-all">{user.email}</p>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Vos {leaves.length} jours posés et vos soldes ({formatFrNumber(cpRemaining)} CP · {formatFrNumber(rttRemaining)} RTT) sont synchronisés automatiquement dans le cloud.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      syncFromCloud(user.id, true);
                      showToast('Synchronisation forcée.');
                    }}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Re-synchroniser</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-1/2 bg-red-50 hover:bg-red-100 text-red-600 font-bold py-2.5 rounded-xl transition cursor-pointer text-xs flex items-center justify-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Déconnexion</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                <div className="flex p-1 bg-slate-100 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className={`w-1/2 py-1.5 rounded-lg transition cursor-pointer ${
                      authMode === 'login'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Se connecter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('signup');
                      setAuthError(null);
                      setAuthSuccess(null);
                    }}
                    className={`w-1/2 py-1.5 rounded-lg transition cursor-pointer ${
                      authMode === 'signup'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Créer un compte
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Adresse email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="julien@exemple.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Mot de passe
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600"
                  />
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
                    {authError}
                  </div>
                )}

                {authSuccess && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 text-xs font-semibold rounded-xl border border-emerald-200">
                    {authSuccess}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                >
                  {authSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Chargement...</span>
                    </>
                  ) : authMode === 'login' ? (
                    <span>Se connecter</span>
                  ) : (
                    <span>Créer mon compte</span>
                  )}
                </button>

                <p className="text-[11px] text-slate-400 text-center">
                  En mode déconnecté, vos données restent stockées localement dans votre navigateur (localStorage).
                </p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Modifier les soldes de départ (CP et RTT) */}
      {isQuotaModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-3xl p-5 sm:p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Soldes de départ {selectedYear}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Période CP active : du {formatShortDateFr(activeQuotaPeriod.start)} {activeQuotaPeriod.start.slice(0, 4)} au {formatShortDateFr(activeQuotaPeriod.end)} {activeQuotaPeriod.end.slice(0, 4)}. {formatFrNumber(cpUsed)} CP posés sur la période et {formatFrNumber(rttUsed)} RTT enregistrés depuis la date du solde de référence sont déduits.
            </p>

            <form onSubmit={handleSaveQuotas} className="space-y-3.5">
              <fieldset className="grid grid-cols-2 gap-2">
                <legend className="block text-xs font-bold text-slate-600 mb-1">
                  Période de validité annuelle
                </legend>
                <label className="text-[11px] font-semibold text-slate-600">
                  Du
                  <input
                    type="date"
                    value={quotaPeriodStartInput}
                    onChange={(event) => {
                      const start = event.target.value;
                      setQuotaPeriodStartInput(start);
                      if (quotaPeriodEndInput < start) setQuotaPeriodEndInput(start);
                    }}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-800 focus:outline-indigo-600"
                  />
                </label>
                <label className="text-[11px] font-semibold text-slate-600">
                  Au
                  <input
                    type="date"
                    min={quotaPeriodStartInput}
                    value={quotaPeriodEndInput}
                    onChange={(event) => setQuotaPeriodEndInput(event.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-800 focus:outline-indigo-600"
                  />
                </label>
                <p className="col-span-2 text-[11px] leading-relaxed text-slate-500">
                  Ces dates se répètent chaque année. Exemple : du 1er juin au 31 mai. Les congés rétroactifs compris dans la période sont aussi décomptés.
                </p>
              </fieldset>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Solde initial Congés Payés (CP)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="120"
                  autoFocus={quotaFocusField === 'cp'}
                  value={quotaCpInput}
                  onChange={(e) => setQuotaCpInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 focus:outline-indigo-600 font-mono-tabular"
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="block text-xs font-bold text-slate-600 mb-1">
                  Acquisition des RTT
                </legend>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setQuotaRttModeInput('fixed')}
                    aria-pressed={quotaRttModeInput === 'fixed'}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      quotaRttModeInput === 'fixed' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Nombre fixe annuel
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuotaRttModeInput('monthly')}
                    aria-pressed={quotaRttModeInput === 'monthly'}
                    className={`rounded-lg py-2 text-xs font-bold transition ${
                      quotaRttModeInput === 'monthly' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Acquisition mensuelle
                  </button>
                </div>
                {quotaRttModeInput === 'monthly' ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-600">
                      RTT acquis par mois
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="120"
                        value={quotaMonthlyRttInput}
                        onChange={(event) => setQuotaMonthlyRttInput(event.target.value)}
                        required
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-indigo-700 focus:outline-indigo-600"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs font-semibold text-slate-600">
                        Solde RTT actuel
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={quotaRttBalanceInput}
                          onChange={(event) => setQuotaRttBalanceInput(event.target.value)}
                          required
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-indigo-700 focus:outline-indigo-600"
                        />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">
                        Solde connu au
                        <input
                          type="date"
                          value={quotaRttBalanceDateInput}
                          max={todayStr}
                          onChange={(event) => setQuotaRttBalanceDateInput(event.target.value)}
                          required
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700 focus:outline-indigo-600"
                        />
                      </label>
                    </div>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Le solde saisi inclut vos RTT déjà cumulés. Les acquisitions ajoutées après cette date sont plafonnées et les RTT posés ensuite sont déduits, même s&apos;ils sont rétroactifs.
                    </p>

                    <div className="rounded-xl border border-slate-200 p-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={quotaRttHasMax}
                          onChange={(event) => setQuotaRttHasMax(event.target.checked)}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        Définir un plafond de cumul
                      </label>
                      {quotaRttHasMax && (
                        <label className="mt-2 block text-xs font-semibold text-slate-600">
                          Plafond maximum (RTT)
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="120"
                            value={quotaRttMaxInput}
                            onChange={(event) => setQuotaRttMaxInput(event.target.value)}
                            required
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-indigo-700 focus:outline-indigo-600"
                          />
                        </label>
                      )}
                    </div>
                    {quotaRttHasMax && Number(quotaRttMaxInput) > 0 && (
                      <p className="rounded-xl bg-amber-50 p-3 text-[11px] font-semibold leading-relaxed text-amber-800">
                        Une alerte s&apos;affichera à partir de 80 % du plafond pour vous aider à poser vos RTT avant d&apos;en perdre.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Solde annuel fixe RTT
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="120"
                      value={quotaRttInput}
                      onChange={(event) => setQuotaRttInput(event.target.value)}
                      required
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-indigo-600 focus:outline-indigo-600"
                    />
                  </div>
                )}
              </fieldset>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuotaModalOpen(false)}
                  className="w-1/2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition cursor-pointer"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Poser un jour off manuellement */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-extrabold text-slate-900 text-lg">Nouveau jour off</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Type de congé
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as 'CP' | 'RTT')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600"
                >
                  <option value="CP">Congé Payé (CP)</option>
                  <option value="RTT">RTT</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Du
                <input
                  type="date"
                  value={formDate}
                          min={activeQuotaPeriod.start}
                  max={formEndDate}
                  onChange={(e) => {
                    setFormDate(e.target.value);
                    if (formEndDate < e.target.value) setFormEndDate(e.target.value);
                    if (formDayPart !== 'full') setFormDayPart('full');
                  }}
                  required
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium focus:outline-indigo-600"
                />
                </label>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Au
                <input
                  type="date"
                  value={formEndDate}
                  min={formDate}
                  max={activeQuotaPeriod.end}
                  onChange={(e) => {
                    setFormEndDate(e.target.value);
                    if (formDayPart !== 'full') setFormDayPart('full');
                  }}
                  required
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium focus:outline-indigo-600"
                />
                </label>
              </div>

              {formDate === formEndDate && (
                <fieldset>
                  <legend className="mb-1.5 block text-xs font-bold text-slate-600">
                    Durée sur cette date
                  </legend>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
                    {[
                      { value: 'full', label: 'Journée', days: 1 },
                      { value: 'morning', label: 'Matin', days: 0.5 },
                      { value: 'afternoon', label: 'Après-midi', days: 0.5 },
                    ].map((part) => (
                      <button
                        key={part.value}
                        type="button"
                        aria-pressed={formDayPart === part.value}
                        onClick={() => setFormDayPart(part.value as typeof formDayPart)}
                        className={`rounded-lg px-1.5 py-2 text-[11px] font-bold transition ${
                          formDayPart === part.value
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {part.label}
                        <span className="ml-1 opacity-70">{formatFrNumber(part.days)} j</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <p className="text-[11px] leading-relaxed text-slate-500">
                {formDayPart === 'full'
                  ? 'Les jours ouvrés de la plage seront ajoutés. Week-ends, jours fériés et dates déjà posées ne sont pas débités.'
                  : 'La demi-journée choisie sera débitée à hauteur de 0,5 jour.'}
              </p>
              {leaveRangePreview && (
                <div
                  aria-live="polite"
                  className="rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-xs text-indigo-900"
                >
                  <p className="font-bold">
                    {formatFrNumber(leaveRangePreview.dates.length * (formDayPart === 'full' ? 1 : 0.5))} jour{leaveRangePreview.dates.length * (formDayPart === 'full' ? 1 : 0.5) === 1 ? '' : 's'} de {formType} seront débités du solde.
                  </p>
                  {(leaveRangePreview.holidaysSkipped > 0 ||
                    leaveRangePreview.weekendsSkipped > 0 ||
                    leaveRangePreview.existingSkipped > 0) && (
                    <p className="mt-1 text-[11px] text-indigo-700">
                      Ignorés : {leaveRangePreview.holidaysSkipped} férié{leaveRangePreview.holidaysSkipped === 1 ? '' : 's'}, {leaveRangePreview.weekendsSkipped} week-end{leaveRangePreview.weekendsSkipped === 1 ? '' : 's'} et {leaveRangePreview.existingSkipped} déjà posé{leaveRangePreview.existingSkipped === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Note (optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Pont de l'Ascension, Vacances d'été..."
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 bg-slate-100 text-slate-600 font-bold py-3 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 transition cursor-pointer"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Code HTML unique prêt à copier-coller */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-3xl rounded-3xl p-6 shadow-xl border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Fichier unique index.html (HTML + Tailwind CDN + Lucide Icons)
                </h3>
                <p className="text-xs text-slate-500">
                  Prêt à être copié-collé et exécuté directement dans n&apos;importe quel navigateur
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="my-4 flex-1 overflow-auto bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs font-mono leading-relaxed">
              <pre className="whitespace-pre-wrap break-words">{STANDALONE_HTML_CODE}</pre>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleDownloadStandaloneHtml}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger index.html</span>
              </button>
              <button
                type="button"
                onClick={handleCopyStandaloneHtml}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 transition cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>{copiedCode ? 'Copié !' : 'Copier tout le code'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Guide d'installation iOS Safari */}
      {isIOSGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-extrabold text-slate-900">
              Installer JoursOff sur iPhone / iPad
            </h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              1. Appuyez sur le bouton <strong>Partager</strong> dans la barre de Safari.
              <br />
              2. Faites défiler et appuyez sur <strong>Sur l&apos;écran d&apos;accueil</strong>.
            </p>
            <button
              type="button"
              onClick={() => setIsIOSGuideOpen(false)}
              className="mt-4 w-full rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-200 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
