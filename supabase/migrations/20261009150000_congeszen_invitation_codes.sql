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
    generated_code := 'ZEN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
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

create or replace function public.create_calendar_group_invitation(target_group_id uuid)
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
  if not exists (
    select 1 from public.calendar_groups
    where id = target_group_id and owner_id = current_user_id
  ) then
    raise exception 'Seul le créateur du groupe peut inviter des membres';
  end if;

  generated_code := 'ZEN-GRP-' || upper(substr(gen_random_uuid()::text, 1, 8));
  insert into public.calendar_group_invitations (group_id, invite_code)
  values (target_group_id, generated_code);
  return generated_code;
end;
$$;
