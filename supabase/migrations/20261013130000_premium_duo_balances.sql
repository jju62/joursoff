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
  stored_quotas jsonb;
  calendar_leaves jsonb;
  today_date date := current_date;
  now_timestamp timestamptz := now();
  quota_cp numeric;
  quota_rtt numeric;
  quota_rtt_mode text;
  quota_rtt_monthly numeric;
  quota_rtt_current_balance numeric;
  quota_rtt_balance_date date;
  quota_rtt_max numeric;
  quota_period_start text;
  quota_period_end text;
  period_start_date date;
  period_end_date date;
  period_start_year integer;
  period_end_year integer;
  cp_balance numeric;
  rtt_balance numeric;
  rtt_used numeric := 0;
  months_since_anchor integer;
  event record;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = current_user_id and is_pro = true
  ) then
    raise exception 'Le mode Duo est réservé aux membres Pro';
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

  select
    case
      when jsonb_typeof(to_jsonb(settings.leaves)) = 'string'
        then coalesce(nullif(to_jsonb(settings.leaves) #>> '{}', '')::jsonb, '[]'::jsonb)
      else coalesce(to_jsonb(settings.leaves), '[]'::jsonb)
    end,
    coalesce(
      settings.quotas,
      jsonb_build_object(
        'cp', coalesce(settings.cp_initial, 25),
        'rtt', coalesce(settings.rtt_initial, 10)
      ),
      jsonb_build_object('cp', 25, 'rtt', 10)
    )
  into stored_leaves, stored_quotas
  from public.user_settings as settings
  where settings.user_id = partner_user_id;

  stored_leaves := coalesce(stored_leaves, '[]'::jsonb);
  stored_quotas := coalesce(stored_quotas, jsonb_build_object('cp', 25, 'rtt', 10));

  quota_cp := coalesce(nullif(stored_quotas ->> 'cp', '')::numeric, 25);
  quota_rtt := coalesce(nullif(stored_quotas ->> 'rtt', '')::numeric, 10);
  quota_rtt_mode := case when stored_quotas ->> 'rttMode' = 'monthly' then 'monthly' else 'fixed' end;
  quota_rtt_monthly := coalesce(nullif(stored_quotas ->> 'rttMonthly', '')::numeric, 1);
  quota_rtt_current_balance := coalesce(
    nullif(stored_quotas ->> 'rttCurrentBalance', '')::numeric,
    quota_rtt
  );
  quota_rtt_balance_date := coalesce(
    nullif(stored_quotas ->> 'rttBalanceDate', '')::date,
    today_date
  );
  if stored_quotas ? 'rttMax' then
    quota_rtt_max := nullif(stored_quotas ->> 'rttMax', '')::numeric;
  else
    quota_rtt_max := quota_rtt;
  end if;

  quota_period_start := coalesce(stored_quotas ->> 'periodStart', '01-01');
  quota_period_end := coalesce(stored_quotas ->> 'periodEnd', '12-31');
  if quota_period_start !~ '^\d{2}-\d{2}$' or quota_period_end !~ '^\d{2}-\d{2}$' then
    raise exception 'La période des soldes du partenaire est invalide';
  end if;
  period_start_year := extract(year from today_date)::integer;
  if to_char(today_date, 'MM-DD') < quota_period_start then
    period_start_year := period_start_year - 1;
  end if;
  period_end_year := period_start_year + case when quota_period_end <= quota_period_start then 1 else 0 end;
  period_start_date := to_date(period_start_year::text || '-' || quota_period_start, 'YYYY-MM-DD');
  period_end_date := to_date(period_end_year::text || '-' || quota_period_end, 'YYYY-MM-DD');

  select quota_cp - coalesce(sum((leave_item ->> 'days')::numeric), 0)
  into cp_balance
  from jsonb_array_elements(
    case when jsonb_typeof(stored_leaves) = 'array' then stored_leaves else '[]'::jsonb end
  ) as items(leave_item)
  where leave_item ->> 'type' = 'CP'
    and (leave_item ->> 'date')::date between period_start_date and period_end_date;

  if quota_rtt_mode = 'monthly' then
    if stored_quotas ? 'rttMax' and jsonb_typeof(stored_quotas -> 'rttMax') = 'null' then
      rtt_balance := quota_rtt_current_balance;
    else
      rtt_balance := least(quota_rtt_current_balance, coalesce(quota_rtt_max, quota_rtt_current_balance));
    end if;
    rtt_balance := greatest(0, rtt_balance);
    months_since_anchor :=
      (extract(year from today_date)::integer - extract(year from quota_rtt_balance_date)::integer) * 12
      + extract(month from today_date)::integer - extract(month from quota_rtt_balance_date)::integer;

    for event in
      select event_rows.event_timestamp, event_rows.event_kind, event_rows.days
      from (
        select
          ((quota_rtt_balance_date + make_interval(months => month_offsets.month_offset))::date::timestamp at time zone 'UTC') as event_timestamp,
          'accrual'::text as event_kind,
          quota_rtt_monthly as days,
          0 as event_order
        from generate_series(1, greatest(0, months_since_anchor)) as month_offsets(month_offset)
        where quota_rtt_balance_date + make_interval(months => month_offsets.month_offset) <= today_date
        union all
        select
          nullif(leave_item ->> 'recordedAt', '')::timestamptz as event_timestamp,
          'leave'::text as event_kind,
          (leave_item ->> 'days')::numeric as days,
          1 as event_order
        from jsonb_array_elements(
          case when jsonb_typeof(stored_leaves) = 'array' then stored_leaves else '[]'::jsonb end
        ) as items(leave_item)
        where leave_item ->> 'type' = 'RTT'
          and leave_item ->> 'date' >= today_date::text
          and nullif(leave_item ->> 'recordedAt', '')::timestamptz
            between (quota_rtt_balance_date::timestamp at time zone 'UTC') and now_timestamp
      ) as event_rows
      order by event_rows.event_timestamp, event_rows.event_order
    loop
      if event.event_kind = 'accrual' then
        rtt_balance := rtt_balance + event.days;
        if not (stored_quotas ? 'rttMax' and jsonb_typeof(stored_quotas -> 'rttMax') = 'null') then
          rtt_balance := least(rtt_balance, coalesce(quota_rtt_max, rtt_balance));
        end if;
      else
        rtt_balance := rtt_balance - event.days;
        rtt_used := rtt_used + event.days;
      end if;
    end loop;
  else
    select quota_rtt - coalesce(sum((leave_item ->> 'days')::numeric), 0)
    into rtt_balance
    from jsonb_array_elements(
      case when jsonb_typeof(stored_leaves) = 'array' then stored_leaves else '[]'::jsonb end
    ) as items(leave_item)
    where leave_item ->> 'type' = 'RTT'
      and (leave_item ->> 'date')::date between period_start_date and period_end_date;
  end if;

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
    'leaves', calendar_leaves,
    'cpBalance', cp_balance,
    'rttBalance', rtt_balance
  );
end;
$$;
