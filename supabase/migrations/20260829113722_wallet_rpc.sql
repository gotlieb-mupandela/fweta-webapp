-- Atomic wallet + ledger updates. SECURITY DEFINER so callers do not need
-- direct UPDATE on wallets. Authorization is enforced in the function body.

create or replace function public.adjust_wallet(
  p_user_id uuid,
  p_available_delta integer,
  p_pending_delta integer,
  p_type public.ledger_entry_type,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text := coalesce(
    current_setting('request.jwt.claims', true)::json ->> 'role',
    ''
  );
  caller uuid := auth.uid();
  allowed boolean := false;
  wallet public.wallets%rowtype;
  amount integer;
  entry_id uuid;
begin
  if jwt_role = 'service_role' then
    allowed := true;
  elsif (select private.is_admin()) then
    allowed := true;
  elsif caller is not null and caller = p_user_id then
    allowed := true;
  elsif caller is not null and p_reference_id is not null
    and p_reference_type in ('booking_escrow', 'booking_refund', 'booking_release') then
    select exists (
      select 1
      from public.bookings b
      where b.id = p_reference_id
        and (b.brand_id = caller or b.influencer_id = caller)
    ) into allowed;
  end if;

  if not allowed then
    raise exception 'Not allowed to adjust this wallet' using errcode = '42501';
  end if;

  amount := abs(p_available_delta);
  if amount = 0 then
    amount := abs(p_pending_delta);
  end if;
  if amount <= 0 then
    raise exception 'Ledger amount must be positive';
  end if;

  insert into public.wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if wallet.available_cents + p_available_delta < 0 then
    raise exception 'Insufficient available balance.';
  end if;
  if wallet.pending_cents + p_pending_delta < 0 then
    raise exception 'Insufficient pending balance.';
  end if;

  update public.wallets
  set
    available_cents = wallet.available_cents + p_available_delta,
    pending_cents = wallet.pending_cents + p_pending_delta,
    updated_at = now()
  where user_id = p_user_id
  returning * into wallet;

  insert into public.ledger_entries (
    user_id,
    amount_cents,
    type,
    reason,
    reference_type,
    reference_id,
    balance_after_available_cents,
    balance_after_pending_cents
  )
  values (
    p_user_id,
    amount,
    p_type,
    p_reason,
    p_reference_type,
    p_reference_id,
    wallet.available_cents,
    wallet.pending_cents
  )
  returning id into entry_id;

  return jsonb_build_object(
    'wallet', jsonb_build_object(
      'userId', wallet.user_id,
      'availableCents', wallet.available_cents,
      'pendingCents', wallet.pending_cents,
      'updatedAt', wallet.updated_at
    ),
    'entry', jsonb_build_object(
      'id', entry_id,
      'userId', p_user_id,
      'amountCents', amount,
      'type', p_type,
      'reason', p_reason,
      'referenceType', p_reference_type,
      'referenceId', p_reference_id,
      'balanceAfterAvailableCents', wallet.available_cents,
      'balanceAfterPendingCents', wallet.pending_cents
    )
  );
end;
$$;

revoke all on function public.adjust_wallet(
  uuid, integer, integer, public.ledger_entry_type, text, text, uuid
) from public, anon;

grant execute on function public.adjust_wallet(
  uuid, integer, integer, public.ledger_entry_type, text, text, uuid
) to authenticated, service_role;
