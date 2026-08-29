-- Harden profile writes, clipper campaign reads, and submission updates.

create or replace function private.protect_profile_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'role',
    ''
  );
  caller_is_admin boolean := false;
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  caller_is_admin := private.is_admin();

  if tg_op = 'INSERT' then
    if not caller_is_admin then
      new.roles := array_remove(new.roles, 'admin'::public.user_role);
      if new.roles is null or cardinality(new.roles) = 0 then
        new.roles := array['clipper']::public.user_role[];
      end if;
      if new.primary_role = 'admin' then
        new.primary_role := new.roles[1];
      end if;
      new.suspended := false;
    end if;
    return new;
  end if;

  if not caller_is_admin then
    new.id := old.id;
    new.email := old.email;
    new.suspended := old.suspended;
    new.roles := array_remove(new.roles, 'admin'::public.user_role);
    if new.roles is null or cardinality(new.roles) = 0 then
      new.roles := old.roles;
    end if;
    if new.primary_role = 'admin' or not (new.primary_role = any (new.roles)) then
      new.primary_role := new.roles[1];
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_write on public.profiles;
create trigger profiles_protect_write
  before insert or update on public.profiles
  for each row execute function private.protect_profile_write();

revoke all on function private.protect_profile_write() from public;

-- Clippers can still see campaigns they submitted to after the campaign ends.
create policy campaigns_select_submitted on public.campaigns
  for select to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      where s.campaign_id = campaigns.id
        and s.clipper_id = (select auth.uid())
    )
  );

-- Brands/influencers can read counterpart display names.
create policy profiles_select_related on public.profiles
  for select to authenticated
  using (
    exists (
      select 1
      from public.submissions s
      join public.campaigns c on c.id = s.campaign_id
      where s.clipper_id = profiles.id
        and c.brand_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.bookings b
      where (
        b.brand_id = (select auth.uid())
        and b.influencer_id = profiles.id
      )
      or (
        b.influencer_id = (select auth.uid())
        and b.brand_id = profiles.id
      )
    )
  );

-- Clippers insert submissions; they must not self-approve.
drop policy if exists submissions_update on public.submissions;

create policy submissions_update_reviewers on public.submissions
  for update to authenticated
  using (
    exists (
      select 1
      from public.campaigns c
      where c.id = submissions.campaign_id
        and c.brand_id = (select auth.uid())
    )
    or (select private.is_admin())
  )
  with check (
    exists (
      select 1
      from public.campaigns c
      where c.id = submissions.campaign_id
        and c.brand_id = (select auth.uid())
    )
    or (select private.is_admin())
  );
