import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { OnboardingData } from '../components/OnboardingWizard';

type AuthContextValue = {
  user: User | null;
  isPro: boolean;
  setIsPro: (value: boolean) => Promise<void>;
  hasCompletedOnboarding: boolean;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type AuthProviderProps = {
  children: ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isPro, setIsProState] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const updateIsPro = useCallback((value: boolean) => {
    setIsProState(value);
  }, []);

  const ensureProfileExists = useCallback(async (currentUser: User) => {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: currentUser.id }, { onConflict: 'id' });
    if (error) throw error;
  }, []);

  const loadProfile = useCallback(async (currentUser: User | null, requestGeneration: number) => {
    if (!currentUser) {
      updateIsPro(false);
      setHasCompletedOnboarding(false);
      return;
    }

    await ensureProfileExists(currentUser);

    const { data, error } = await supabase
      .from('profiles')
      .select('is_pro, has_completed_onboarding')
      .eq('id', currentUser.id)
      .maybeSingle();
    if (error) throw error;
    if (generation.current !== requestGeneration) return;
    updateIsPro(data?.is_pro === true);
    setHasCompletedOnboarding(data?.has_completed_onboarding === true);
  }, [ensureProfileExists, updateIsPro]);

  useEffect(() => {
    let active = true;
    const applySession = (nextUser: User | null) => {
      const requestGeneration = ++generation.current;
      setUser(nextUser);
      void loadProfile(nextUser, requestGeneration)
        .catch((error: unknown) => {
          if (!active || generation.current !== requestGeneration) return;
          console.error('Impossible de charger le profil Supabase :', error);
          updateIsPro(false);
          setHasCompletedOnboarding(false);
        })
        .finally(() => {
          if (active && generation.current === requestGeneration) setLoading(false);
        });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        window.setTimeout(() => {
          if (active) applySession(session?.user ?? null);
        }, 0);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) throw error;
      applySession(data.session?.user ?? null);
    }).catch((error: unknown) => {
      if (!active) return;
      console.error('Impossible de vérifier la session Supabase :', error);
      setUser(null);
      updateIsPro(false);
      setHasCompletedOnboarding(false);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
      generation.current += 1;
    };
  }, [loadProfile, updateIsPro]);

  const setIsPro = useCallback(async (value: boolean) => {
    if (!import.meta.env.DEV) {
      throw new Error('Le basculeur Pro est disponible uniquement en développement.');
    }
    if (!user) throw new Error('Connectez-vous pour enregistrer le statut Pro de test.');

    const previousValue = isPro;
    updateIsPro(value);
    try {
      const { data, error } = await supabase.rpc('set_my_pro_test_status', {
        requested_is_pro: value,
      });
      if (error) throw error;
      if (data !== value) {
        throw new Error('Supabase n’a pas confirmé la mise à jour du statut Pro.');
      }
    } catch (error) {
      updateIsPro(previousValue);
      throw error;
    }
  }, [isPro, updateIsPro, user]);

  const completeOnboarding = useCallback(async (data: OnboardingData) => {
    if (!user) throw new Error('Connectez-vous pour enregistrer votre configuration.');

    if (data.departureCity) {
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { departure_city: data.departureCity },
      });
      if (metadataError) throw metadataError;
    }

    const { data: completed, error } = await supabase.rpc('complete_my_onboarding', {
      p_departure_city: data.departureCity?.name ?? null,
      p_school_zone: data.schoolZone,
      p_annual_cp: data.annualCp,
      p_cp_renewal_month: data.renewalMonth,
      p_has_rtt: data.hasRtt,
      p_annual_rtt: data.annualRtt,
      p_rtt_mode: data.rttMode,
    });
    if (error) throw error;
    if (completed !== true) throw new Error('Supabase n’a pas confirmé la fin de la configuration.');

    setHasCompletedOnboarding(true);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, isPro, setIsPro, hasCompletedOnboarding, completeOnboarding, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  return context;
}
