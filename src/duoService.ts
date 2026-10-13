import { supabase } from './supabase';

export type DuoRelationship = {
  id: string;
  inviteCode: string | null;
  status: 'pending' | 'accepted';
  partnerUserId: string | null;
  partnerName: string;
  partnerAvatar: string;
};

export type SharedLeave = {
  date: string;
  type: 'CP' | 'RTT';
  days: number;
  halfDay?: 'morning' | 'afternoon';
};

export type PartnerCalendar = {
  partnerName: string;
  partnerAvatar: string;
  leaves: SharedLeave[];
  cpBalance: number;
  rttBalance: number;
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getDuoRelationship(): Promise<DuoRelationship | null> {
  const { data, error } = await supabase.rpc('get_my_user_relationship');
  throwOnError(error);
  return (data as DuoRelationship | null) ?? null;
}

export async function createDuoInvitation(): Promise<string> {
  const { data, error } = await supabase.rpc('create_user_invitation');
  throwOnError(error);
  if (typeof data !== 'string') throw new Error('La création du code de partage a échoué.');
  return data;
}

export async function acceptDuoInvitation(code: string): Promise<void> {
  const { error } = await supabase.rpc('accept_user_invitation', { invitation_code: code });
  throwOnError(error);
}

export async function getPartnerCalendar(): Promise<PartnerCalendar> {
  const { data, error } = await supabase.rpc('get_linked_user_calendar');
  throwOnError(error);
  if (!isRecord(data)) {
    throw new Error('Les données du calendrier partagé sont invalides.');
  }
  if (
    typeof data.partnerName !== 'string' ||
    typeof data.partnerAvatar !== 'string' ||
    typeof data.cpBalance !== 'number' ||
    !Number.isFinite(data.cpBalance) ||
    typeof data.rttBalance !== 'number' ||
    !Number.isFinite(data.rttBalance) ||
    !Array.isArray(data.leaves)
  ) {
    throw new Error('Les données du calendrier partagé sont incomplètes.');
  }
  const leaves = data.leaves.map((item: unknown): SharedLeave => {
    if (
      !isRecord(item) ||
      typeof item.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      (item.type !== 'CP' && item.type !== 'RTT') ||
      typeof item.days !== 'number' ||
      !Number.isFinite(item.days) ||
      (item.halfDay !== undefined && item.halfDay !== null && item.halfDay !== 'morning' && item.halfDay !== 'afternoon')
    ) {
      throw new Error('Un congé partagé reçu est invalide.');
    }
    return {
      date: item.date,
      type: item.type,
      days: item.days,
      ...(item.halfDay ? { halfDay: item.halfDay } : {}),
    };
  });
  return {
    partnerName: data.partnerName,
    partnerAvatar: data.partnerAvatar,
    leaves,
    cpBalance: data.cpBalance,
    rttBalance: data.rttBalance,
  };
}

export async function unlinkDuo(): Promise<void> {
  const { error } = await supabase.rpc('unlink_user_relationship');
  throwOnError(error);
}
