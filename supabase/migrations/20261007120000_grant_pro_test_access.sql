create table if not exists public.pro_test_access_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.pro_test_access_admins enable row level security;
revoke all on public.pro_test_access_admins from public, anon, authenticated;

create or replace function public.grant_pro_test_access()
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

  if not exists (
    select 1
    from public.pro_test_access_admins as admins
    where admins.user_id = current_user_id
  ) then
    raise exception 'Ce compte n’est pas autorisé à activer l’accès Pro de test';
  end if;

  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    '{"allow_pro_test_toggle": true}'::jsonb
  where id = current_user_id;

  if not found then
    raise exception 'Compte Supabase introuvable';
  end if;

  return true;
end;
$$;

revoke all on function public.grant_pro_test_access() from public, anon;
grant execute on function public.grant_pro_test_access() to authenticated;
