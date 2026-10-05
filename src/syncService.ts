import { supabase } from './supabase';
import { LeaveItem } from './App';

export interface UserQuotas {
  cp: number;
  rtt: number;
}

export async function fetchUserSettings(userId: string): Promise<{
  leaves: LeaveItem[] | null;
  quotas: UserQuotas | null;
}> {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('Erreur lecture user_settings:', error.message);
      return { leaves: null, quotas: null };
    }

    if (!data) {
      return { leaves: null, quotas: null };
    }

    let leaves: LeaveItem[] | null = null;
    let quotas: UserQuotas | null = null;

    // Parser les feuilles de congés
    if (Array.isArray(data.leaves)) {
      leaves = data.leaves;
    } else if (typeof data.leaves === 'string') {
      try {
        leaves = JSON.parse(data.leaves);
      } catch {}
    } else if (data.data?.leaves) {
      leaves = data.data.leaves;
    } else if (data.settings?.leaves) {
      leaves = data.settings.leaves;
    }

    // Parser les soldes CP / RTT
    if (data.cp_initial !== undefined || data.rtt_initial !== undefined) {
      quotas = {
        cp: Number(data.cp_initial ?? 25),
        rtt: Number(data.rtt_initial ?? 10),
      };
    } else if (data.quotas && typeof data.quotas === 'object') {
      quotas = {
        cp: Number(data.quotas.cp ?? 25),
        rtt: Number(data.quotas.rtt ?? 10),
      };
    } else if (typeof data.quotas === 'string') {
      try {
        const q = JSON.parse(data.quotas);
        quotas = { cp: Number(q.cp ?? 25), rtt: Number(q.rtt ?? 10) };
      } catch {}
    } else if (data.cp_quota !== undefined || data.rtt_quota !== undefined) {
      quotas = {
        cp: Number(data.cp_quota ?? 25),
        rtt: Number(data.rtt_quota ?? 10),
      };
    } else if (data.data?.quotas) {
      quotas = data.data.quotas;
    } else if (data.settings?.quotas) {
      quotas = data.settings.quotas;
    }

    return { leaves, quotas };
  } catch (err) {
    console.error('Erreur inattendue fetchUserSettings:', err);
    return { leaves: null, quotas: null };
  }
}

export async function syncToCloud(
  leaves: LeaveItem[],
  quotas: UserQuotas
): Promise<boolean> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError) {
      alert(authError.message);
      return false;
    }

    const authUser = authData?.user;
    if (!authUser) {
      alert("Erreur de synchronisation Supabase : Aucun utilisateur connecté (supabase.auth.getUser() est vide). Veuillez vous connecter.");
      return false;
    }

    const userId = authUser.id;
    const updatedAt = new Date().toISOString();

    const payload: Record<string, any> = {
      user_id: userId,
      leaves: leaves,
      cp_initial: quotas.cp,
      rtt_initial: quotas.rtt,
      updated_at: updatedAt,
    };

    let { error } = await supabase
      .from('user_settings')
      .upsert(payload, { onConflict: 'user_id' });

    // Si Postgres échoue car user_id n'a pas de contrainte UNIQUE explicite
    if (error && error.message?.includes('ON CONFLICT')) {
      const { data: existing } = await supabase
        .from('user_settings')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      const fallbackRes = await supabase
        .from('user_settings')
        .upsert({
          ...(existing?.id ? { id: existing.id } : { id: userId }),
          ...payload,
        });
      error = fallbackRes.error;
    }

    if (error) {
      alert(error.message);
      console.error('Erreur Supabase upsert user_settings:', error);
      return false;
    }

    return true;
  } catch (err: any) {
    const message = err?.message || String(err);
    alert(message);
    console.error('Erreur saveUserSettings / syncToCloud:', err);
    return false;
  }
}

export const saveUserSettings = async (
  _userId: string,
  leaves: LeaveItem[],
  quotas: UserQuotas
): Promise<boolean> => {
  return syncToCloud(leaves, quotas);
};
