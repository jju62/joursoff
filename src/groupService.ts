import { supabase } from './supabase';

export type CalendarGroup = {
  id: string;
  name: string;
  ownerId: string;
};

export type GroupMember = {
  id: string;
  name: string;
  avatar: string;
};

export type GroupLeave = {
  memberId: string;
  memberName: string;
  date: string;
  type: 'CP' | 'RTT';
  days: number;
  halfDay?: 'morning' | 'afternoon';
};

export type GroupCalendar = {
  id: string;
  name: string;
  members: GroupMember[];
  leaves: GroupLeave[];
};

function throwOnError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function getCalendarGroups(): Promise<CalendarGroup[]> {
  const { data, error } = await supabase.rpc('list_my_calendar_groups');
  throwOnError(error);
  if (!Array.isArray(data)) throw new Error('La liste des groupes reçue est invalide.');
  return data.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.ownerId !== 'string'
    ) {
      throw new Error('Un groupe reçu est invalide.');
    }
    return {
      id: item.id,
      name: item.name,
      ownerId: item.ownerId,
    };
  });
}

export async function createCalendarGroup(name: string): Promise<CalendarGroup> {
  const { data, error } = await supabase.rpc('create_calendar_group', { group_name: name });
  throwOnError(error);
  if (
    !isRecord(data) ||
    typeof data.id !== 'string' ||
    typeof data.name !== 'string' ||
    typeof data.ownerId !== 'string'
  ) {
    throw new Error('La création du groupe a retourné des données invalides.');
  }
  return {
    id: data.id,
    name: data.name,
    ownerId: data.ownerId,
  };
}

export async function createCalendarGroupInvitation(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_calendar_group_invitation', {
    target_group_id: groupId,
  });
  throwOnError(error);
  if (typeof data !== 'string' || !data) throw new Error('Le code d’invitation du groupe est invalide.');
  return data;
}

export async function acceptCalendarGroupInvitation(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_calendar_group_invitation', {
    invitation_code: code,
  });
  throwOnError(error);
  if (typeof data !== 'string') throw new Error('Le groupe rejoint est invalide.');
  return data;
}

export async function getGroupCalendar(groupId: string): Promise<GroupCalendar> {
  const { data, error } = await supabase.rpc('get_calendar_group_calendar', {
    target_group_id: groupId,
  });
  throwOnError(error);
  if (!isRecord(data)) {
    throw new Error('Les données du calendrier de groupe sont invalides.');
  }

  if (
    data.id !== groupId ||
    typeof data.name !== 'string' ||
    !Array.isArray(data.members) ||
    !Array.isArray(data.leaves)
  ) {
    throw new Error('Les données du calendrier de groupe sont incomplètes.');
  }

  const members = data.members.map((member: unknown): GroupMember => {
    if (
      !isRecord(member) ||
      typeof member.id !== 'string' ||
      typeof member.name !== 'string' ||
      typeof member.avatar !== 'string'
    ) {
      throw new Error('Un membre du groupe reçu est invalide.');
    }
    return { id: member.id, name: member.name, avatar: member.avatar };
  });
  const leaves = data.leaves.map((leave: unknown): GroupLeave => {
    if (
      !isRecord(leave) ||
      typeof leave.memberId !== 'string' ||
      typeof leave.memberName !== 'string' ||
      typeof leave.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(leave.date) ||
      (leave.type !== 'CP' && leave.type !== 'RTT') ||
      typeof leave.days !== 'number' ||
      !Number.isFinite(leave.days) ||
      (leave.halfDay !== undefined && leave.halfDay !== 'morning' && leave.halfDay !== 'afternoon')
    ) {
      throw new Error('Un congé partagé du groupe reçu est invalide.');
    }
    return {
      memberId: leave.memberId,
      memberName: leave.memberName,
      date: leave.date,
      type: leave.type,
      days: leave.days,
      ...(leave.halfDay ? { halfDay: leave.halfDay } : {}),
    };
  });
  return { id: groupId, name: data.name, members, leaves };
}
