create table if not exists public.user_relationships (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid references auth.users(id) on delete cascade,
  invite_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint user_relationships_not_self check (partner_id is null or owner_id <> partner_id),
  constraint user_relationships_status_partner check (
    (status = 'pending' and partner_id is null)
    or (status = 'accepted' and partner_id is not null)
  )
);

create unique index if not exists user_relationships_owner_active_idx
  on public.user_relationships (owner_id)
  where status = 'accepted';

create unique index if not exists user_relationships_partner_active_idx
  on public.user_relationships (partner_id)
  where status = 'accepted';

alter table public.user_relationships enable row level security;

drop policy if exists "Users can view their own relationships" on public.user_relationships;
create policy "Users can view their own relationships"
  on public.user_relationships
  for select
  to authenticated
  using (auth.uid() = owner_id or auth.uid() = partner_id);

revoke all on public.user_relationships from anon, authenticated;
grant select on public.user_relationships to authenticated;

create or replace function public.create_user_invitation()
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

  if exists (
    select 1
    from public.user_relationships
    where status = 'accepted'
      and (owner_id = current_user_id or partner_id = current_user_id)
  ) then
    raise exception 'You are already linked to another user';
  end if;

  delete from public.user_relationships
  where owner_id = current_user_id and status = 'pending';

  loop
    generated_code := 'JOURSOFF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    begin
      insert into public.user_relationships (owner_id, invite_code)
      values (current_user_id, generated_code);
      return generated_code;
    exception when unique_violation then
      continue;
    end;
  end loop;
end;
$$;

create or replace function public.accept_user_invitation(invitation_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation public.user_relationships%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into invitation
  from public.user_relationships
  where invite_code = upper(trim(invitation_code))
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Invitation code is invalid or already used';
  end if;

  if invitation.owner_id = current_user_id then
    raise exception 'You cannot accept your own invitation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(least(current_user_id::text, invitation.owner_id::text), 0));
  perform pg_advisory_xact_lock(hashtextextended(greatest(current_user_id::text, invitation.owner_id::text), 0));

  if exists (
    select 1
    from public.user_relationships
    where status = 'accepted'
      and (
        owner_id in (current_user_id, invitation.owner_id)
        or partner_id in (current_user_id, invitation.owner_id)
      )
  ) then
    raise exception 'One of these users is already linked to another account';
  end if;

  update public.user_relationships
  set partner_id = current_user_id, status = 'accepted'
  where id = invitation.id;

  delete from public.user_relationships
  where owner_id = current_user_id and status = 'pending';
end;
$$;

create or replace function public.get_my_user_relationship()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  relationship public.user_relationships%rowtype;
  partner_metadata jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into relationship
  from public.user_relationships
  where owner_id = current_user_id or partner_id = current_user_id
  order by (status = 'accepted') desc, created_at desc
  limit 1;

  if not found then
    return null;
  end if;

  if relationship.status = 'accepted' then
    select raw_user_meta_data
    into partner_metadata
    from auth.users
    where id = case
      when relationship.owner_id = current_user_id then relationship.partner_id
      else relationship.owner_id
    end;
  end if;

  return jsonb_build_object(
    'id', relationship.id,
    'inviteCode', case when relationship.owner_id = current_user_id then relationship.invite_code else null end,
    'status', relationship.status,
    'partnerUserId', case
      when relationship.owner_id = current_user_id then relationship.partner_id
      else relationship.owner_id
    end,
    'partnerName', coalesce(nullif(partner_metadata ->> 'display_name', ''), 'Mon partenaire'),
    'partnerAvatar', coalesce(nullif(partner_metadata ->> 'avatar_emoji', ''), '👋')
  );
end;
$$;

create or replace function public.get_linked_user_calendar()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  partner_user_id uuid;
  partner_metadata jsonb;
  stored_leaves jsonb;
  calendar_leaves jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select case
      when owner_id = current_user_id then partner_id
      else owner_id
    end
  into partner_user_id
  from public.user_relationships
  where status = 'accepted'
    and (owner_id = current_user_id or partner_id = current_user_id)
  limit 1;

  if partner_user_id is null then
    raise exception 'No linked user';
  end if;

  select raw_user_meta_data
  into partner_metadata
  from auth.users
  where id = partner_user_id;

  select case
      when jsonb_typeof(to_jsonb(settings.leaves)) = 'string'
        then coalesce(nullif(to_jsonb(settings.leaves) #>> '{}', '')::jsonb, '[]'::jsonb)
      else coalesce(to_jsonb(settings.leaves), '[]'::jsonb)
    end
  into stored_leaves
  from public.user_settings as settings
  where settings.user_id = partner_user_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', leave_item -> 'date',
        'type', leave_item -> 'type',
        'days', leave_item -> 'days',
        'halfDay', leave_item -> 'halfDay'
      )
      order by leave_item ->> 'date'
    ),
    '[]'::jsonb
  )
  into calendar_leaves
  from jsonb_array_elements(
    case when jsonb_typeof(stored_leaves) = 'array' then stored_leaves else '[]'::jsonb end
  ) as items(leave_item)
  where leave_item ? 'date'
    and leave_item ->> 'type' in ('CP', 'RTT');

  return jsonb_build_object(
    'partnerName', coalesce(nullif(partner_metadata ->> 'display_name', ''), 'Mon partenaire'),
    'partnerAvatar', coalesce(nullif(partner_metadata ->> 'avatar_emoji', ''), '👋'),
    'leaves', calendar_leaves
  );
end;
$$;

create or replace function public.unlink_user_relationship()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.user_relationships
  where owner_id = current_user_id or partner_id = current_user_id;
end;
$$;

revoke all on function public.create_user_invitation() from public, anon;
revoke all on function public.accept_user_invitation(text) from public, anon;
revoke all on function public.get_my_user_relationship() from public, anon;
revoke all on function public.get_linked_user_calendar() from public, anon;
revoke all on function public.unlink_user_relationship() from public, anon;
grant execute on function public.create_user_invitation() to authenticated;
grant execute on function public.accept_user_invitation(text) to authenticated;
grant execute on function public.get_my_user_relationship() to authenticated;
grant execute on function public.get_linked_user_calendar() to authenticated;
grant execute on function public.unlink_user_relationship() to authenticated;
