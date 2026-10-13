create or replace function public.require_pro_shared_calendar_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not exists (
    select 1
    from public.profiles
    where id = auth.uid() and is_pro = true
  ) then
    raise exception 'Cette fonctionnalité est réservée aux membres Pro';
  end if;
  return new;
end;
$$;

drop trigger if exists require_pro_user_relationship on public.user_relationships;
create trigger require_pro_user_relationship
  before insert or update on public.user_relationships
  for each row execute function public.require_pro_shared_calendar_access();

drop trigger if exists require_pro_calendar_group on public.calendar_groups;
create trigger require_pro_calendar_group
  before insert or update on public.calendar_groups
  for each row execute function public.require_pro_shared_calendar_access();

drop trigger if exists require_pro_calendar_group_member on public.calendar_group_members;
create trigger require_pro_calendar_group_member
  before insert or update on public.calendar_group_members
  for each row execute function public.require_pro_shared_calendar_access();

drop trigger if exists require_pro_calendar_group_invitation on public.calendar_group_invitations;
create trigger require_pro_calendar_group_invitation
  before insert or update on public.calendar_group_invitations
  for each row execute function public.require_pro_shared_calendar_access();

create or replace function public.list_my_calendar_groups()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  result jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.profiles where id = current_user_id and is_pro = true
  ) then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', groups.id,
      'name', groups.name,
      'ownerId', groups.owner_id
    ) order by groups.created_at),
    '[]'::jsonb
  )
  into result
  from public.calendar_group_members as memberships
  join public.calendar_groups as groups on groups.id = memberships.group_id
  where memberships.user_id = current_user_id;

  return result;
end;
$$;

create or replace function public.get_calendar_group_calendar(target_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  group_name text;
  group_members jsonb;
  group_leaves jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.profiles where id = current_user_id and is_pro = true
  ) then
    raise exception 'La gestion des groupes est réservée aux membres Pro';
  end if;

  select groups.name into group_name
  from public.calendar_groups as groups
  join public.calendar_group_members as memberships on memberships.group_id = groups.id
  where groups.id = target_group_id and memberships.user_id = current_user_id;
  if group_name is null then
    raise exception 'Groupe introuvable ou accès refusé';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', members.user_id,
      'name', coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), 'Membre'),
      'avatar', coalesce(nullif(users.raw_user_meta_data ->> 'avatar_emoji', ''), '👋')
    ) order by members.joined_at),
    '[]'::jsonb
  )
  into group_members
  from public.calendar_group_members as members
  join auth.users as users on users.id = members.user_id
  where members.group_id = target_group_id;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'memberId', members.user_id,
      'memberName', coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), 'Membre'),
      'date', leave_item -> 'date',
      'type', leave_item -> 'type',
      'days', leave_item -> 'days',
      'halfDay', leave_item -> 'halfDay'
    ) order by leave_item ->> 'date', members.joined_at),
    '[]'::jsonb
  )
  into group_leaves
  from public.calendar_group_members as members
  join auth.users as users on users.id = members.user_id
  left join public.user_settings as settings on settings.user_id = members.user_id
  cross join lateral (
    select case
      when jsonb_typeof(to_jsonb(settings.leaves)) = 'string'
        then coalesce(nullif(to_jsonb(settings.leaves) #>> '{}', '')::jsonb, '[]'::jsonb)
      else coalesce(to_jsonb(settings.leaves), '[]'::jsonb)
    end as leaves
  ) as saved
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(saved.leaves) = 'array' then saved.leaves else '[]'::jsonb end
  ) as entries(leave_item)
  where members.group_id = target_group_id
    and leave_item ? 'date'
    and leave_item ? 'type';

  return jsonb_build_object(
    'id', target_group_id,
    'name', group_name,
    'members', group_members,
    'leaves', group_leaves
  );
end;
$$;
