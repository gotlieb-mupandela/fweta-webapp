-- Project still uses legacy default privileges (ALL to anon/authenticated).
-- RLS does not apply to TRUNCATE; strip extras and keep explicit DML only.

revoke all on table
  public.profiles,
  public.campaigns,
  public.submissions,
  public.view_snapshots,
  public.wallets,
  public.ledger_entries,
  public.payout_methods,
  public.withdrawal_requests,
  public.influencer_profiles,
  public.rate_cards,
  public.bookings,
  public.brand_deposits,
  public.fraud_flags
from anon, authenticated;

grant select on table public.campaigns to anon;
grant select on table public.influencer_profiles to anon;
grant select on table public.rate_cards to anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;
grant select, insert, update on table public.submissions to authenticated;
grant select on table public.view_snapshots to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.ledger_entries to authenticated;
grant select, insert, update, delete on table public.payout_methods to authenticated;
grant select, insert, update on table public.withdrawal_requests to authenticated;
grant select, insert, update, delete on table public.influencer_profiles to authenticated;
grant select, insert, update, delete on table public.rate_cards to authenticated;
grant select, insert, update on table public.bookings to authenticated;
grant select, insert, update on table public.brand_deposits to authenticated;
grant select, insert, update on table public.fraud_flags to authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
