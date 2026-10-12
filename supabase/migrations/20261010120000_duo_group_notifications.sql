alter table public.profiles
  alter column notification_preferences set default
    '{"departure_reminders":true,"bridge_alerts":true,"sunny_bridge_alerts":false,"pro_balance_alerts":false,"duo_group_alerts":true}'::jsonb;

update public.profiles
set notification_preferences = notification_preferences || '{"duo_group_alerts":true}'::jsonb
where not (notification_preferences ? 'duo_group_alerts');

create table if not exists public.leave_change_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_leaves jsonb not null,
  current_leaves jsonb not null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0
);

create index if not exists leave_change_events_pending_idx
  on public.leave_change_events (created_at)
  where processed_at is null;

alter table public.leave_change_events enable row level security;
revoke all on public.leave_change_events from anon, authenticated;

create or replace function public.enqueue_leave_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_value jsonb := '[]'::jsonb;
  current_value jsonb;
begin
  current_value := coalesce(to_jsonb(new.leaves), '[]'::jsonb);
  if jsonb_typeof(current_value) = 'string' then
    begin
      current_value := coalesce(nullif(current_value #>> '{}', '')::jsonb, '[]'::jsonb);
    exception when invalid_text_representation then
      current_value := '[]'::jsonb;
    end;
  end if;
  if jsonb_typeof(current_value) <> 'array' then
    current_value := '[]'::jsonb;
  end if;

  if tg_op = 'UPDATE' then
    previous_value := coalesce(to_jsonb(old.leaves), '[]'::jsonb);
    if jsonb_typeof(previous_value) = 'string' then
      begin
        previous_value := coalesce(nullif(previous_value #>> '{}', '')::jsonb, '[]'::jsonb);
      exception when invalid_text_representation then
        previous_value := '[]'::jsonb;
      end;
    end if;
    if jsonb_typeof(previous_value) <> 'array' then
      previous_value := '[]'::jsonb;
    end if;
    if previous_value = current_value then
      return new;
    end if;
  end if;

  insert into public.leave_change_events (user_id, previous_leaves, current_leaves)
  values (new.user_id, previous_value, current_value);
  return new;
end;
$$;

drop trigger if exists enqueue_leave_change_event on public.user_settings;
create trigger enqueue_leave_change_event
  after insert or update on public.user_settings
  for each row execute function public.enqueue_leave_change_event();

create or replace function public.claim_leave_change_events(
  p_user_id uuid default null,
  p_limit integer default 50
)
returns setof public.leave_change_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  with candidates as (
    select events.id
    from public.leave_change_events as events
    where events.processed_at is null
      and (events.claimed_at is null or events.claimed_at < now() - interval '5 minutes')
      and (p_user_id is null or events.user_id = p_user_id)
    order by events.created_at, events.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  update public.leave_change_events as events
  set claimed_at = now(),
      attempts = events.attempts + 1
  from candidates
  where events.id = candidates.id
  returning events.*;
end;
$$;

revoke all on function public.claim_leave_change_events(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_leave_change_events(uuid, integer) to service_role;
