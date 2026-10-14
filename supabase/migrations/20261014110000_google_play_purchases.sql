create table if not exists public.google_play_purchases (
  purchase_token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null,
  order_id text,
  created_at timestamptz not null default now()
);

alter table public.google_play_purchases enable row level security;
revoke all on public.google_play_purchases from public, anon, authenticated;
grant all on public.google_play_purchases to service_role;
