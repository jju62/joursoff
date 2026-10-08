alter table public.user_settings
  add column if not exists quotas jsonb;

update public.user_settings
set quotas = jsonb_build_object(
  'cp', coalesce(cp_initial, 25),
  'rtt', coalesce(rtt_initial, 10)
)
where quotas is null;
