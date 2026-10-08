alter table public.profiles
  add column if not exists has_completed_onboarding boolean not null default false,
  add column if not exists departure_city text,
  add column if not exists school_zone text,
  add column if not exists annual_cp numeric not null default 25,
  add column if not exists cp_renewal_month integer not null default 6,
  add column if not exists has_rtt boolean not null default false,
  add column if not exists annual_rtt numeric not null default 0,
  add column if not exists rtt_mode text not null default 'fixed';

create or replace function public.complete_my_onboarding(
  p_departure_city text,
  p_school_zone text,
  p_annual_cp numeric,
  p_cp_renewal_month integer,
  p_has_rtt boolean,
  p_annual_rtt numeric,
  p_rtt_mode text
)
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
  if p_school_zone is null or p_school_zone not in ('A', 'B', 'C', 'hors_zone') then
    raise exception 'Zone de vacances scolaires invalide';
  end if;
  if p_annual_cp is null or p_annual_cp < 0 or p_annual_cp > 100 then
    raise exception 'Le nombre annuel de CP doit être compris entre 0 et 100';
  end if;
  if p_cp_renewal_month is null or p_cp_renewal_month < 1 or p_cp_renewal_month > 12 then
    raise exception 'Mois de renouvellement des CP invalide';
  end if;
  if p_has_rtt is null then
    raise exception 'Précisez si vous bénéficiez de RTT';
  end if;
  if p_has_rtt and (p_annual_rtt is null or p_annual_rtt < 0 or p_annual_rtt > 120) then
    raise exception 'Le nombre annuel de RTT doit être compris entre 0 et 120';
  end if;
  if p_has_rtt and (p_rtt_mode is null or p_rtt_mode not in ('fixed', 'monthly')) then
    raise exception 'Mode d’attribution des RTT invalide';
  end if;

  insert into public.profiles (
    id,
    has_completed_onboarding,
    departure_city,
    school_zone,
    annual_cp,
    cp_renewal_month,
    has_rtt,
    annual_rtt,
    rtt_mode
  )
  values (
    current_user_id,
    true,
    nullif(trim(p_departure_city), ''),
    p_school_zone,
    p_annual_cp,
    p_cp_renewal_month,
    p_has_rtt,
    case when p_has_rtt then p_annual_rtt else 0 end,
    case when p_has_rtt then p_rtt_mode else 'fixed' end
  )
  on conflict (id) do update
    set has_completed_onboarding = excluded.has_completed_onboarding,
        departure_city = coalesce(excluded.departure_city, profiles.departure_city),
        school_zone = excluded.school_zone,
        annual_cp = excluded.annual_cp,
        cp_renewal_month = excluded.cp_renewal_month,
        has_rtt = excluded.has_rtt,
        annual_rtt = excluded.annual_rtt,
        rtt_mode = excluded.rtt_mode,
        updated_at = now();

  return true;
end;
$$;

revoke all on function public.complete_my_onboarding(text, text, numeric, integer, boolean, numeric, text) from public, anon;
grant execute on function public.complete_my_onboarding(text, text, numeric, integer, boolean, numeric, text) to authenticated;
