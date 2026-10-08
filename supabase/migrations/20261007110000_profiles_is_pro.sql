create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists is_pro boolean not null default false;

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.protect_profile_is_pro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if coalesce(auth.jwt() -> 'app_metadata' ->> 'allow_pro_test_toggle', 'false') <> 'true' then
      if tg_op = 'INSERT' then
        new.is_pro := false;
      else
        new.is_pro := old.is_pro;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_is_pro on public.profiles;
create trigger protect_profile_is_pro
  before insert or update on public.profiles
  for each row execute function public.protect_profile_is_pro();

create or replace function public.set_my_pro_test_status(requested_is_pro boolean)
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
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'allow_pro_test_toggle', 'false') <> 'true' then
    raise exception 'Le compte n’est pas autorisé à tester le statut Pro';
  end if;

  insert into public.profiles (id, is_pro)
  values (current_user_id, requested_is_pro)
  on conflict (id) do update
    set is_pro = excluded.is_pro,
        updated_at = now();

  return requested_is_pro;
end;
$$;

revoke all on function public.set_my_pro_test_status(boolean) from public, anon;
grant execute on function public.set_my_pro_test_status(boolean) to authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
