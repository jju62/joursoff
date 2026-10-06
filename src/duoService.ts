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
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
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
  if (!data || typeof data !== 'object') {
    throw new Error('Les données du calendrier partagé sont invalides.');
  }
  const result = data as PartnerCalendar;
  return {
    partnerName: result.partnerName,
    partnerAvatar: result.partnerAvatar,
    leaves: Array.isArray(result.leaves) ? result.leaves : [],
  };
}

export async function unlinkDuo(): Promise<void> {
  const { error } = await supabase.rpc('unlink_user_relationship');
  throwOnError(error);
}
