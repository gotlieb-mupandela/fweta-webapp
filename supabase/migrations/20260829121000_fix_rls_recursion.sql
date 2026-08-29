-- Break RLS recursion between campaigns, submissions, and profiles.
-- Policies that subquery sibling tables re-enter RLS and loop.

drop policy if exists campaigns_select_submitted on public.campaigns;
drop policy if exists profiles_select_related on public.profiles;

create or replace function private.clipper_submitted_to_campaign(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    where s.campaign_id = p_campaign_id
      and s.clipper_id = (select auth.uid())
  );
$$;

create or replace function private.can_view_related_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.submissions s
      join public.campaigns c on c.id = s.campaign_id
      where s.clipper_id = p_profile_id
        and c.brand_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.bookings b
      where (
        b.brand_id = (select auth.uid())
        and b.influencer_id = p_profile_id
      )
      or (
        b.influencer_id = (select auth.uid())
        and b.brand_id = p_profile_id
      )
    );
$$;

revoke all on function private.clipper_submitted_to_campaign(uuid) from public;
revoke all on function private.can_view_related_profile(uuid) from public;
grant execute on function private.clipper_submitted_to_campaign(uuid) to authenticated;
grant execute on function private.can_view_related_profile(uuid) to authenticated;

create policy campaigns_select_submitted on public.campaigns
  for select to authenticated
  using ((select private.clipper_submitted_to_campaign(id)));

create policy profiles_select_related on public.profiles
  for select to authenticated
  using ((select private.can_view_related_profile(id)));
