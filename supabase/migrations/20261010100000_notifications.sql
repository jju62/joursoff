alter table public.profiles
  add column if not exists notification_preferences jsonb not null default
    '{"departure_reminders":true,"bridge_alerts":true,"sunny_bridge_alerts":false,"pro_balance_alerts":false,"duo_group_alerts":true}'::jsonb;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  keys jsonb not null,
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_https_endpoint check (endpoint like 'https://%'),
  constraint push_subscriptions_valid_keys check (
    jsonb_typeof(keys) = 'object'
    and jsonb_typeof(keys -> 'p256dh') = 'string'
    and jsonb_typeof(keys -> 'auth') = 'string'
  )
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;
create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notification_deliveries (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from anon, authenticated;

create or replace function public.update_my_notification_preferences(p_preferences jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_is_pro boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_preferences is null or coalesce(jsonb_typeof(p_preferences), '') <> 'object'
    or coalesce(jsonb_typeof(p_preferences -> 'departure_reminders'), '') <> 'boolean'
    or coalesce(jsonb_typeof(p_preferences -> 'bridge_alerts'), '') <> 'boolean'
    or coalesce(jsonb_typeof(p_preferences -> 'sunny_bridge_alerts'), '') <> 'boolean'
    or coalesce(jsonb_typeof(p_preferences -> 'pro_balance_alerts'), '') <> 'boolean'
    or coalesce(jsonb_typeof(p_preferences -> 'duo_group_alerts'), '') <> 'boolean' then
    raise exception 'Préférences de notifications invalides';
  end if;

  select is_pro into current_is_pro
  from public.profiles
  where id = current_user_id;

  if coalesce(current_is_pro, false) = false and (
    (p_preferences ->> 'sunny_bridge_alerts')::boolean
    or (p_preferences ->> 'pro_balance_alerts')::boolean
  ) then
    raise exception 'Les notifications Pro nécessitent un compte Pro';
  end if;

  insert into public.profiles (id, notification_preferences)
  values (current_user_id, p_preferences)
  on conflict (id) do update
    set notification_preferences = excluded.notification_preferences,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.update_my_notification_preferences(jsonb) from public, anon;
grant execute on function public.update_my_notification_preferences(jsonb) to authenticated;

create or replace function public.update_my_departure_city(p_departure_city text)
returns boolean
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
  if p_departure_city is not null and length(trim(p_departure_city)) > 120 then
    raise exception 'Ville de départ invalide';
  end if;

  insert into public.profiles (id, departure_city)
  values (current_user_id, nullif(trim(p_departure_city), ''))
  on conflict (id) do update
    set departure_city = nullif(trim(excluded.departure_city), ''),
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.update_my_departure_city(text) from public, anon;
grant execute on function public.update_my_departure_city(text) to authenticated;
