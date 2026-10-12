import { useEffect, useState } from 'react';
import { Bell, CalendarClock, CloudSun, Crown, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../supabase';

type NotificationPreferences = {
  departure_reminders: boolean;
  bridge_alerts: boolean;
  sunny_bridge_alerts: boolean;
  pro_balance_alerts: boolean;
  duo_group_alerts: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  departure_reminders: true,
  bridge_alerts: true,
  sunny_bridge_alerts: false,
  pro_balance_alerts: false,
  duo_group_alerts: true,
};

type UserProfileProps = {
  userId: string;
  isPro: boolean;
  onUpgrade: (feature: string) => void;
};

function decodeVapidKey(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(window.atob(base64), (character) => character.charCodeAt(0));
}

async function enablePush(userId: string) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Les notifications push ne sont pas prises en charge par ce navigateur.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Autorisez les notifications dans les réglages de votre navigateur pour les activer.');
  }

  let vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    const { data, error } = await supabase.functions.invoke('send-notifications', {
      body: { action: 'get-vapid-public-key' },
    });
    if (error) throw error;
    vapidPublicKey = data?.publicKey;
  }
  if (!vapidPublicKey) {
    throw new Error('Le service push n’est pas configuré sur le serveur. Vérifiez les secrets VAPID et redéployez send-notifications.');
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidKey(vapidPublicKey),
    });
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Le navigateur a créé un abonnement push incomplet.');
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  }, { onConflict: 'endpoint' });
  if (error) throw error;
}

export function UserProfile({ userId, isPro, onUpgrade }: UserProfileProps) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!active) return;
      const stored = data?.notification_preferences;
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const storedPreferences = stored as Record<string, unknown>;
        setPreferences({
          ...DEFAULT_PREFERENCES,
          ...Object.fromEntries(
            Object.entries(DEFAULT_PREFERENCES).map(([key, defaultValue]) => [
              key,
              typeof storedPreferences[key] === 'boolean' ? storedPreferences[key] : defaultValue,
            ])
          ),
        });
      } else {
        setPreferences(DEFAULT_PREFERENCES);
      }
    })()
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Impossible de charger les préférences de notifications :', error);
        setErrorMessage('Impossible de charger vos préférences de notifications.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  const updatePreference = async (key: keyof NotificationPreferences) => {
    const nextEnabled = !preferences[key];
    if (!isPro && (key === 'sunny_bridge_alerts' || key === 'pro_balance_alerts')) {
      onUpgrade(key === 'sunny_bridge_alerts' ? 'les alertes météo sur les ponts' : 'les opportunités Pro et rappels de solde');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      if (nextEnabled) await enablePush(userId);

      const next = { ...preferences, [key]: nextEnabled };
      const { data, error } = await supabase.rpc('update_my_notification_preferences', {
        p_preferences: next,
      });
      if (error) throw error;
      if (data !== true) throw new Error('Supabase n’a pas confirmé la mise à jour des préférences.');
      setPreferences(next);
    } catch (error) {
      console.error('Impossible de mettre à jour les préférences de notifications :', error);
      setErrorMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer vos préférences.');
    } finally {
      setSaving(false);
    }
  };

  const options: {
    key: keyof NotificationPreferences;
    label: string;
    description: string;
    icon: typeof Bell;
    pro?: boolean;
  }[] = [
    {
      key: 'departure_reminders',
      label: 'Rappels de départ en congé',
      description: 'Un rappel « Prépare ta valise ! » à J-3.',
      icon: CalendarClock,
    },
    {
      key: 'bridge_alerts',
      label: 'Alertes ponts & opportunités',
      description: 'Repère les ponts à venir que tu n’as pas encore posés.',
      icon: Bell,
    },
    {
      key: 'sunny_bridge_alerts',
      label: 'Alerte Météo & Soleil sur les ponts',
      description: 'Un conseil personnalisé si plus de 22 °C et du soleil sont prévus.',
      icon: CloudSun,
      pro: true,
    },
    {
      key: 'pro_balance_alerts',
      label: 'Opportunités Pro & Rappels de solde critique',
      description: 'Bilan d’optimisation et rappel de CP avant leur renouvellement.',
      icon: Sparkles,
      pro: true,
    },
    {
      key: 'duo_group_alerts',
      label: 'Alertes Congés Duo & Groupes',
      description: 'Recevoir un push quand mon partenaire ou un membre du groupe pose un congé.',
      icon: Bell,
    },
  ];

  return (
    <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3.5 space-y-3">
      <h4 className="flex items-center gap-2 text-xs font-extrabold text-slate-800">
        <Bell className="h-4 w-4 text-indigo-600" />
        Mes Notifications
      </h4>
      <div className="space-y-2">
        {options.map(({ key, label, description, icon: Icon, pro }) => {
          const locked = pro && !isPro;
          return (
            <div key={key} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
              <Icon className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[11px] font-bold leading-snug text-slate-800">
                  {label}
                  {locked && <Crown className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-600" aria-label="Réservé Pro" />}
                </p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">{description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={label}
                aria-checked={preferences[key]}
                aria-disabled={loading || saving}
                disabled={loading || saving}
                onClick={() => void updatePreference(key)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  preferences[key] ? 'bg-indigo-600' : 'bg-slate-300'
                } disabled:cursor-wait disabled:opacity-60`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    preferences[key] ? 'left-5.5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      {(loading || saving) && (
        <p className="flex items-center gap-1.5 text-[10px] text-slate-500" role="status">
          <Loader2 className="h-3 w-3 animate-spin" />
          {loading ? 'Chargement des préférences…' : 'Enregistrement…'}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-xl bg-red-50 p-2.5 text-[10px] font-semibold text-red-700">
          {errorMessage}
        </p>
      )}
      <p className="text-[10px] leading-relaxed text-slate-500">
        Les notifications nécessitent l’autorisation de votre navigateur et une connexion internet.
      </p>
    </section>
  );
}
