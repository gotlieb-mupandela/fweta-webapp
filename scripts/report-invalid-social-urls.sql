-- Review only. This file is not a migration and it changes no rows.
-- Do not run it with supabase db push.
-- Do not apply supabase/migrations/20260830153000_fweta_app_store_grants.sql.
--
-- Lists profile rows whose TikTok, Instagram, Facebook, YouTube, or X
-- values are not safe profile links: spaces, error-page text, or a
-- doubled host such as tiktok.com/@tiktok.com/@name.
-- The raw URL is not selected.

with socials as (
  select id::text as id, 'fweta_profiles' as source, key, value
  from public.fweta_profiles
  cross join lateral jsonb_each_text(coalesce(socials, '{}'::jsonb))
  union all
  select id::text, 'fweta_influencer_profiles', key, value
  from public.fweta_influencer_profiles
  cross join lateral jsonb_each_text(coalesce(socials, '{}'::jsonb))
)
select
  id,
  source,
  key as platform,
  case
    when value ~* 'requested url|all we know|the request|could not|access denied|\merror\M' then 'error-page-text'
    when value ~ '[[:space:]]' then 'spaces'
    when value ~* 'tiktok\.com/@tiktok\.com|instagram\.com/instagram\.com|facebook\.com/facebook\.com' then 'doubled-host'
    when value ~* '/(reel|reels|p|video|watch|shorts|status)/' then 'post-link'
    else 'check-manually'
  end as reason
from socials
where key in ('tiktok', 'instagram', 'facebook', 'youtube', 'x')
  and (
    value ~ '[[:space:]]'
    or value ~* 'requested url|all we know|the request|could not|access denied|\merror\M'
    or value ~* 'tiktok\.com/@tiktok\.com|instagram\.com/instagram\.com|facebook\.com/facebook\.com'
    or value ~* '/(reel|reels|p|video|watch|shorts|status)/'
  )
order by source, id, key;
