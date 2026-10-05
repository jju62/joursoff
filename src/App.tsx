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
  ArrowRight,
  Pencil,
  SlidersHorizontal,
  User,
  LogOut,
  Cloud,
  CloudCheck,
  Loader2,
} from 'lucide-react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import {
  FRENCH_HOLIDAYS_2026,
  analyzeBridges2026,
  getFrenchHolidays,
  getHolidayCalendarSummary,
  getHolidayCalendarSummary2026,
  formatShortDateFr,
  BridgeOpportunity,
} from './holidays2026';
import { STANDALONE_HTML_CODE } from './standaloneHtml';
import { usePWAInstall } from './usePWAInstall';
import { supabase } from './supabase';
import { fetchUserSettings, saveUserSettings, syncToCloud } from './syncService';

export interface LeaveItem {
  id: number;
  type: 'CP' | 'RTT';
  date: string; // YYYY-MM-DD
  days: number;
  label?: string;
}

const STORAGE_KEY = 'joursoff_data';
const QUOTA_STORAGE_KEY = 'joursoff_quotas_2026';

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

  // Initial allowances (default 25 CP, 10 RTT)
  const [quotas, setQuotas] = useState<{ cp: number; rtt: number }>(() => {
    try {
      const saved = localStorage.getItem(QUOTA_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return { cp: 25, rtt: 10 };
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

  const [isIOSGuideOpen, setIsIOSGuideOpen] = useState(false);
  const [activeBridgeFilter, setActiveBridgeFilter] = useState<'prioritaires' | 'tous'>('prioritaires');
  const [optimizerYear, setOptimizerYear] = useState<number>(new Date().getFullYear());
  const [oneClickType, setOneClickType] = useState<'RTT' | 'CP'>('RTT');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // View state: Calendar vs List
  const [leftViewMode, setLeftViewMode] = useState<'calendrier' | 'liste'>('calendrier');
  const [calendarMonthIndex, setCalendarMonthIndex] = useState<number>(new Date().getMonth()); // Mois actuel

  // Form state for manual leave modal
  const [formType, setFormType] = useState<'CP' | 'RTT'>('CP');
  const [formDate, setFormDate] = useState<string>('2026-05-15');
  const [formDays, setFormDays] = useState<string>('1');
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
        setLeaves(cloudLeaves);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudLeaves));
        hasCloudLeaves = true;
      }
      if (cloudQuotas) {
        setQuotas(cloudQuotas);
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

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

  const openQuotaEditor = (target: 'cp' | 'rtt') => {
    setQuotaCpInput(String(quotas.cp));
    setQuotaRttInput(String(quotas.rtt));
    setQuotaFocusField(target);
    setIsQuotaModalOpen(true);
  };

  const handleSaveQuotas = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCp = parseFloat(quotaCpInput);
    const newRtt = parseFloat(quotaRttInput);
    if (isNaN(newCp) || newCp < 0 || isNaN(newRtt) || newRtt < 0) return;

    const newQuotas = { cp: newCp, rtt: newRtt };
    setQuotas(newQuotas);
    setIsQuotaModalOpen(false);
    showToast(`Soldes initiaux mis à jour : ${newCp} CP et ${newRtt} RTT.`);
    await syncToCloud(leaves, newQuotas);
  };

  // Balances calculation
  const { cpRemaining, rttRemaining, cpUsed, rttUsed } = useMemo(() => {
    let cpU = 0;
    let rttU = 0;
    for (const item of leaves) {
      if (item.type === 'CP') cpU += Number(item.days) || 0;
      if (item.type === 'RTT') rttU += Number(item.days) || 0;
    }
    return {
      cpUsed: cpU,
      rttUsed: rttU,
      cpRemaining: quotas.cp - cpU,
      rttRemaining: quotas.rtt - rttU,
    };
  }, [leaves, quotas]);

  // Ponts et jours fériés calculés dynamiquement selon l'année choisie
  const allBridges = useMemo(() => {
    const holidays = getFrenchHolidays(optimizerYear);
    return analyzeBridges2026(holidays);
  }, [optimizerYear]);

  const holidaySummary = useMemo(() => {
    const holidays = getFrenchHolidays(optimizerYear);
    return getHolidayCalendarSummary(holidays);
  }, [optimizerYear]);

  const todayStr = new Date().toLocaleDateString('sv'); // YYYY-MM-DD

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

  // Check if a bridge opportunity is already booked
  const isBridgeBooked = (bridge: BridgeOpportunity) => {
    return bridge.bridgeDates.every((d) => leaves.some((l) => l.date === d));
  };

  // 1-Click book or unbook bridge
  const handleOneClickBridge = async (bridge: BridgeOpportunity) => {
    const alreadyBooked = isBridgeBooked(bridge);

    if (alreadyBooked) {
      // Remove those bridge dates if user wants to undo
      const updated = leaves.filter((item) => !bridge.bridgeDates.includes(item.date));
      setLeaves(updated);
      showToast(`Pont de ${bridge.holidayName} retiré de vos jours posés.`);
      await syncToCloud(updated, quotas);
      return;
    }

    const newEntries: LeaveItem[] = [];
    bridge.bridgeDates.forEach((dateStr, idx) => {
      const exists = leaves.some((l) => l.date === dateStr);
      if (!exists) {
        newEntries.push({
          id: Date.now() + idx,
          type: oneClickType,
          date: dateStr,
          days: 1,
          label: `Pont ${bridge.holidayName}`,
        });
      }
    });

    if (newEntries.length > 0) {
      const updated = [...leaves, ...newEntries].sort((a, b) => a.date.localeCompare(b.date));
      setLeaves(updated);
      showToast(
        `+${newEntries.length} ${oneClickType} posé (${bridge.bridgeLabel}) → ${bridge.totalOffDays} jours de repos !`
      );
      await syncToCloud(updated, quotas);
    }
  };

  // Manual form submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDays = parseFloat(formDays);
    if (!formDate || isNaN(parsedDays) || parsedDays <= 0) return;

    const newItem: LeaveItem = {
      id: Date.now(),
      type: formType,
      date: formDate,
      days: parsedDays,
      label: formLabel.trim() || undefined,
    };

    const updated = [...leaves, newItem].sort((a, b) => a.date.localeCompare(b.date));
    setLeaves(updated);
    setIsModalOpen(false);
    setFormLabel('');
    setFormDays('1');
    showToast(`Jour off (${formType}) ajouté pour le ${formatShortDateFr(formDate)}.`);
    await syncToCloud(updated, quotas);
  };

  const handleDeleteLeave = async (id: number) => {
    const updated = leaves.filter((item) => item.id !== id);
    setLeaves(updated);
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
    setFormDate(dateStr);
    setFormType(oneClickType);
    setIsModalOpen(true);
  };

  const formatFrNumber = (n: number) => n.toFixed(1).replace('.', ',');

  const MONTH_NAMES_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  // Calendar cells computation for selected month in 2026
  const calendarCells = useMemo(() => {
    const year = 2026;
    const firstDay = new Date(year, calendarMonthIndex, 1);
    const daysInMonth = new Date(year, calendarMonthIndex + 1, 0).getDate();
    let startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    if (startDayOfWeek === 0) startDayOfWeek = 7;

    const cells: ({ dayNumber: number; dateStr: string; isWeekend: boolean } | null)[] = [];
    for (let i = 1; i < startDayOfWeek; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(calendarMonthIndex + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      const dayOfWeek = new Date(year, calendarMonthIndex, d).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      cells.push({ dayNumber: d, dateStr, isWeekend });
    }
    return cells;
  }, [calendarMonthIndex]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header : Single Primary Action & Anonymous Status */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 h-16 flex items-center justify-between shadow-xs">
        <a href="#top" className="text-xl font-extrabold tracking-tight text-indigo-600">
          JoursOff
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a href="#soldes" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors">
            Soldes 2026
          </a>
          <a href="#absences" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors">
            Calendrier & Posés
          </a>
          <a href="#optimiseur" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors">
            Optimiseur de Ponts
          </a>
          <a href="#calendrier" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors">
            11 Jours fériés
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
              user
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {user ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Sauvegarde auto</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>Mode local</span>
              </>
            )}
          </button>

          {!isInstalled && isInstallable && (
            <button
              onClick={install}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              <span>App</span>
            </button>
          )}

          {/* Action principale unique */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>+ Poser un jour off</span>
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-lg flex items-center gap-2.5 max-w-sm">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Container */}
      <main id="top" className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-8">
        {/* Status Banner Sans mentions techniques */}
        <div className="mb-6 bg-white border border-slate-200/80 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                user ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {user ? (
              <span className="text-slate-700 font-medium flex items-center gap-1.5 flex-wrap">
                <span>Profil connecté (<strong className="text-slate-900">{user.email}</strong>)</span>
                <span className="text-slate-300">·</span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full text-[11px]">
                  ● Sauvegarde auto active
                </span>
              </span>
            ) : (
              <span className="text-slate-600 font-medium">
                Mode local actif · Connectez-vous pour activer la sauvegarde automatique dans le cloud.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSyncing && (
              <span className="text-indigo-600 flex items-center gap-1 font-semibold">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sauvegarde...
              </span>
            )}
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="text-indigo-600 font-bold hover:underline cursor-pointer"
            >
              {user ? 'Mon compte' : 'Se connecter'}
            </button>
          </div>
        </div>

        {/* Top Intro */}
        <div className="mb-8 pb-6 border-b border-slate-200/80">
          <p className="text-xs font-semibold text-indigo-600 mb-1">
            Suivi de congés & RTT · Calendrier français 2026
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Mes congés, RTT & ponts 2026 sous contrôle
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Visualisez vos congés sur le calendrier 2026, suivez vos soldes et posez vos ponts en 1 clic.
          </p>
        </div>

        {/* Responsive 12-Column Layout: Left Column (Mobile App Preview / Balances & Absences) + Right Column (Optimiseur de Ponts 2026 & 11 Jours Fériés) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN (5 cols on desktop): Soldes + Bouton Action + Mes Jours Posés */}
          <div className="lg:col-span-5 space-y-6" id="soldes">
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
                        width: `${Math.max(0, Math.min(100, (rttRemaining / (quotas.rtt || 1)) * 100))}%`
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
                      sur {String(quotas.rtt).replace('.', ',')}j
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bouton d'action principal */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full bg-indigo-600 text-white font-bold py-3.5 px-4 rounded-2xl hover:bg-indigo-700 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <Plus className="w-5 h-5" />
              <span>+ Poser un jour off</span>
            </button>

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
                      setLeaves([]);
                      showToast('Tous les jours posés ont été réinitialisés.');
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
                      onClick={() => setCalendarMonthIndex((prev) => (prev > 0 ? prev - 1 : 11))}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
                    >
                      ← Préc.
                    </button>
                    <span className="text-sm font-extrabold text-slate-900">
                      {MONTH_NAMES_FR[calendarMonthIndex]} 2026
                    </span>
                    <button
                      type="button"
                      onClick={() => setCalendarMonthIndex((prev) => (prev < 11 ? prev + 1 : 0))}
                      className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition cursor-pointer text-xs font-bold"
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
                      const holiday = FRENCH_HOLIDAYS_2026.find((h) => h.date === dateStr);
                      const leaveItem = leaves.find((l) => l.date === dateStr);
                      const bridgeOpt = allBridges.find((b) => b.bridgeDates.includes(dateStr));

                      // Vérification date passée (comparaison YYYY-MM-DD stable)
                      const todayStr = new Date().toLocaleDateString('sv'); // format YYYY-MM-DD
                      const isPast = dateStr < todayStr;

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
                        cellBg = isPast
                          ? 'bg-amber-50 text-amber-300 border border-amber-100 font-extrabold cursor-default opacity-60'
                          : 'bg-amber-100 text-amber-900 border border-amber-300 font-extrabold hover:bg-amber-200';
                        badgeText = 'Férié';
                        badgeStyle = isPast ? 'bg-amber-100 text-amber-300' : 'bg-amber-200 text-amber-950';
                      } else if (bridgeOpt && !isPast) {
                        cellBg = 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold hover:bg-indigo-100';
                        badgeText = 'Pont';
                        badgeStyle = 'bg-indigo-200 text-indigo-900';
                      } else if (isWeekend || isPast) {
                        cellBg = 'bg-slate-100/70 text-slate-300 border border-transparent cursor-default';
                      }

                      return (
                        <button
                          key={dateStr}
                          type="button"
                          disabled={isPast && !leaveItem}
                          onClick={() => {
                            if (leaveItem) {
                              handleDeleteLeave(leaveItem.id);
                            } else if (!isWeekend && !isPast) {
                              openModalWithDate(dateStr);
                            }
                          }}
                          className={`h-11 rounded-xl p-1 flex flex-col items-center justify-between text-xs transition ${isPast && !leaveItem ? 'cursor-default' : 'cursor-pointer'} ${cellBg}`}
                          title={
                            leaveItem
                              ? `${leaveItem.type} posé le ${dateStr} (Cliquer pour supprimer)`
                              : isPast
                              ? 'Date passée'
                              : holiday
                              ? `${holiday.nom} (Jour férié)`
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
          <div className="lg:col-span-7 space-y-8" id="optimiseur">
            {/* Section Bons plans de ponts 2026 */}
            <section>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h2 className="text-base font-extrabold text-slate-900">
                      Optimiseur de Ponts {optimizerYear}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ponts royaux (mar/jeu fériés : 1j posé = 4j off) et viaducs (mer. férié : 2j = 5j off)
                  </p>
                </div>

                {/* Sélecteur d'année + type de congé */}
                <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
                  {/* Toggle année */}
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
                    {[new Date().getFullYear(), new Date().getFullYear() + 1].map((yr) => (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => setOptimizerYear(yr)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                          optimizerYear === yr
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
                  return (
                    <div
                      key={bridge.id}
                      className={`bg-white rounded-2xl p-5 border transition flex flex-col justify-between ${
                        booked
                          ? 'border-emerald-300 bg-emerald-50/15'
                          : 'border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        {/* Quiet 1-line text kicker with middle-dot separators (Zero-Pill Discipline) */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <span className="font-semibold text-indigo-600">
                            {bridge.holidayName}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{bridge.holidayDayLabel}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular font-semibold text-emerald-700">
                            Rendement ×{(bridge.totalOffDays / bridge.costDays).toFixed(0)}
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 mt-1.5">
                          Poser le {bridge.bridgeLabel}
                        </h3>

                        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                          <span>{bridge.restSpanLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <strong className="text-slate-900 font-mono-tabular">
                            {bridge.costDays}j posé = {bridge.totalOffDays}j de repos
                          </strong>
                        </p>

                        {/* Visual Day Strip */}
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mt-4 pt-3 border-t border-slate-100">
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
                              <div className="text-[11px] font-bold font-mono-tabular">
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
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 font-mono-tabular">
                          Coût : -{bridge.costDays} {oneClickType}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleOneClickBridge(bridge)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
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
                          ) : (
                            <>
                              <Zap className="w-3.5 h-3.5" />
                              <span>+ Poser en 1 clic ({oneClickType})</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section : Analyse complète des 11 jours fériés français 2026 */}
            <section id="calendrier" className="bg-white rounded-2xl border border-slate-200/80 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    Calendrier officiel des 11 jours fériés {optimizerYear}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Diagnostic automatique des ponts et week-ends prolongés en France
                  </p>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {holidaySummary.map((h) => (
                  <div
                    key={h.date}
                    className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{h.name}</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-600 font-mono-tabular">
                        {h.dayFull} {h.formattedDate} {optimizerYear}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold ${
                          h.status === 'pont_mardi_jeudi'
                            ? 'text-indigo-600'
                            : h.status === 'viaduc_mercredi'
                            ? 'text-amber-700'
                            : h.status === 'weekend_3j'
                            ? 'text-emerald-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {h.note}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Modal: Connexion / Inscription Supabase */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
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

            {user ? (
              <div className="space-y-4">
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs text-indigo-950 space-y-1">
                  <p className="font-bold">Sauvegarde auto activée ✓</p>
                  <p className="font-semibold text-indigo-700 break-all">{user.email}</p>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Vos {leaves.length} jours posés et vos soldes ({quotas.cp} CP · {quotas.rtt} RTT) sont synchronisés automatiquement dans le cloud.
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
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Soldes de départ 2026
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
              Ajustez votre nombre total de Congés Payés et de RTT pour l&apos;année. Vos jours déjà posés ({formatFrNumber(cpUsed)} CP et {formatFrNumber(rttUsed)} RTT) seront déduits automatiquement.
            </p>

            <form onSubmit={handleSaveQuotas} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Solde initial Congés Payés (CP)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="120"
                  autoFocus={quotaFocusField === 'cp'}
                  value={quotaCpInput}
                  onChange={(e) => setQuotaCpInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 focus:outline-indigo-600 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Solde initial RTT
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="120"
                  autoFocus={quotaFocusField === 'rtt'}
                  value={quotaRttInput}
                  onChange={(e) => setQuotaRttInput(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-indigo-600 focus:outline-indigo-600 font-mono-tabular"
                />
              </div>

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

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  min={new Date().toLocaleDateString('sv')}
                  max="2026-12-31"
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600 font-mono-tabular"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Durée (jours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="30"
                  value={formDays}
                  onChange={(e) => setFormDays(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-medium focus:outline-indigo-600 font-mono-tabular"
                />
              </div>

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
