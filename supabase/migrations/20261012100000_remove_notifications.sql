drop trigger if exists enqueue_leave_change_event on public.user_settings;

drop function if exists public.enqueue_leave_change_event();
drop function if exists public.claim_leave_change_events(uuid, integer);
drop function if exists public.update_my_notification_preferences(jsonb);

drop table if exists public.leave_change_events;
drop table if exists public.notification_deliveries;
drop table if exists public.push_subscriptions;

alter table public.profiles
  drop column if exists notification_preferences;

do $$
declare
  scheduled_job record;
begin
  if to_regclass('cron.job') is not null then
    for scheduled_job in execute
      'select jobid from cron.job where command ilike ''%/functions/v1/send-notifications%'''
    loop
      execute 'select cron.unschedule($1)' using scheduled_job.jobid;
    end loop;
  end if;
end;
$$;