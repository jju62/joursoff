create table if not exists public.calendar_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_group_members (
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.calendar_group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists calendar_group_members_user_idx
  on public.calendar_group_members (user_id, group_id);

alter table public.calendar_groups enable row level security;
alter table public.calendar_group_members enable row level security;
alter table public.calendar_group_invitations enable row level security;

revoke all on public.calendar_groups, public.calendar_group_members, public.calendar_group_invitations
  from anon, authenticated;

create or replace function public.create_calendar_group(group_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_group public.calendar_groups%rowtype;
  clean_name text := trim(group_name);
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 60 then
    raise exception 'Le nom du groupe doit contenir entre 1 et 60 caractères';
  end if;

  insert into public.calendar_groups (owner_id, name)
  values (current_user_id, clean_name)
  returning * into created_group;

  insert into public.calendar_group_members (group_id, user_id)
  values (created_group.id, current_user_id);

  return jsonb_build_object(
    'id', created_group.id,
    'name', created_group.name,
    'ownerId', created_group.owner_id
  );
end;
$$;

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

create or replace function public.create_calendar_group_invitation(target_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  generated_code text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not exists (
    select 1 from public.calendar_groups
    where id = target_group_id and owner_id = current_user_id
  ) then
    raise exception 'Seul le créateur du groupe peut inviter des membres';
  end if;

  generated_code := 'JOURSOFF-GRP-' || upper(substr(gen_random_uuid()::text, 1, 8));
  insert into public.calendar_group_invitations (group_id, invite_code)
  values (target_group_id, generated_code);
  return generated_code;
end;
$$;

create or replace function public.accept_calendar_group_invitation(invitation_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_group_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select group_id into target_group_id
  from public.calendar_group_invitations
  where invite_code = upper(trim(invitation_code));
  if target_group_id is null then
    raise exception 'Code d’invitation de groupe invalide';
  end if;

  insert into public.calendar_group_members (group_id, user_id)
  values (target_group_id, current_user_id)
  on conflict (group_id, user_id) do nothing;
  return target_group_id;
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

revoke all on function public.create_calendar_group(text) from public, anon;
revoke all on function public.list_my_calendar_groups() from public, anon;
revoke all on function public.create_calendar_group_invitation(uuid) from public, anon;
revoke all on function public.accept_calendar_group_invitation(text) from public, anon;
revoke all on function public.get_calendar_group_calendar(uuid) from public, anon;
grant execute on function public.create_calendar_group(text) to authenticated;
grant execute on function public.list_my_calendar_groups() to authenticated;
grant execute on function public.create_calendar_group_invitation(uuid) to authenticated;
grant execute on function public.accept_calendar_group_invitation(text) to authenticated;
grant execute on function public.get_calendar_group_calendar(uuid) to authenticated;
