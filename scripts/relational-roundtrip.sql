-- Local only. Round-trips the collections added in 20261017180000.
do $$
declare
  brand uuid := '11111111-1111-1111-1111-111111111111';
  creator uuid := '22222222-2222-2222-2222-222222222222';
  workspace uuid := '33333333-3333-3333-3333-333333333333';
  member uuid := '44444444-4444-4444-4444-444444444444';
  social uuid := '55555555-5555-5555-5555-555555555555';
  linked uuid := '66666666-6666-6666-6666-666666666666';
  campaign uuid := '77777777-7777-7777-7777-777777777777';
  submission uuid := '88888888-8888-8888-8888-888888888888';
  snap uuid := '99999999-9999-9999-9999-999999999999';
  note uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  dispatch uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  payload jsonb;
  loaded jsonb;
begin
  payload := jsonb_build_object(
    'profiles', jsonb_build_array(
      jsonb_build_object(
        'id', brand, 'email', 'brand@local.test', 'passwordHash', 'hash', 'displayName', 'Desert',
        'bio', '', 'roles', jsonb_build_array('brand'), 'primaryRole', 'brand',
        'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z',
        'onboarding', jsonb_build_object('version', 1, 'stepId', 'tour'),
        'journey', jsonb_build_object('dismissed', jsonb_build_array('first_campaign')),
        'activeWorkspaceId', workspace, 'credentialVersion', 1
      ),
      jsonb_build_object(
        'id', creator, 'email', 'creator@local.test', 'passwordHash', 'hash', 'displayName', 'Kai',
        'bio', '', 'roles', jsonb_build_array('clipper'), 'primaryRole', 'clipper',
        'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
      )
    ),
    'workspaces', jsonb_build_array(jsonb_build_object(
      'id', workspace, 'name', 'Desert', 'ownerUserId', brand,
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'workspaceMembers', jsonb_build_array(jsonb_build_object(
      'id', member, 'workspaceId', workspace, 'userId', creator, 'email', 'creator@local.test',
      'role', 'viewer', 'status', 'active',
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'linkedAccounts', jsonb_build_array(jsonb_build_object(
      'id', linked, 'userId', creator, 'platform', 'tiktok', 'handle', 'kai', 'bioCode', 'FWETA-1',
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'socialAccounts', jsonb_build_array(jsonb_build_object(
      'id', social, 'userId', creator, 'platform', 'tiktok', 'handle', 'kai', 'code', 'FWETA-1',
      'status', 'verified', 'isDefault', true,
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'campaigns', jsonb_build_array(jsonb_build_object(
      'id', campaign, 'brandId', brand, 'workspaceId', workspace, 'title', 'Pool test',
      'description', 'Cut the podcast', 'type', 'clipping', 'category', 'podcast', 'status', 'active',
      'budgetTotalCents', 100000, 'budgetSpentCents', 0, 'cpmCents', 5000,
      'maxPayoutPerSubmissionCents', 20000, 'platforms', jsonb_build_array('tiktok'),
      'requirements', 'Hook first', 'payModel', 'pool', 'minViews', 100, 'minPayoutCents', 0,
      'countries', jsonb_build_array('NA'), 'feeReservedCents', 10000,
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'submissions', jsonb_build_array(jsonb_build_object(
      'id', submission, 'campaignId', campaign, 'clipperId', creator, 'socialAccountId', social,
      'postUrl', 'https://www.tiktok.com/@kai/video/1', 'platform', 'tiktok', 'status', 'approved',
      'views', 1000, 'earningsCents', 0, 'baselineViews', 0, 'payableViews', 1000,
      'payoutState', 'reserved', 'fraudReasons', jsonb_build_array(),
      'createdAt', '2026-10-17T12:00:00.000Z', 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'viewSnapshots', jsonb_build_array(jsonb_build_object(
      'id', snap, 'submissionId', submission, 'views', 1000, 'source', 'admin', 'status', 'confirmed',
      'recordedAt', '2026-10-17T12:00:00.000Z'
    )),
    'wallets', jsonb_build_array(jsonb_build_object(
      'userId', brand, 'availableCents', 50000, 'pendingCents', 0, 'updatedAt', '2026-10-17T12:00:00.000Z'
    )),
    'notifications', jsonb_build_array(jsonb_build_object(
      'id', note, 'userId', creator, 'kind', 'campaign_live', 'title', 'Live', 'body', 'A campaign is live',
      'createdAt', '2026-10-17T12:00:00.000Z'
    )),
    'notificationDispatches', jsonb_build_array(jsonb_build_object(
      'id', dispatch, 'dedupeKey', 'campaign_live:test', 'createdAt', '2026-10-17T12:00:00.000Z'
    ))
  );
  perform fweta_save_store(payload);
  loaded := fweta_load_store();
  if jsonb_array_length(loaded->'socialAccounts') <> 1 then raise exception 'social accounts missing'; end if;
  if jsonb_array_length(loaded->'workspaces') <> 1 then raise exception 'workspaces missing'; end if;
  if jsonb_array_length(loaded->'workspaceMembers') <> 1 then raise exception 'members missing'; end if;
  if jsonb_array_length(loaded->'notifications') <> 1 then raise exception 'notifications missing'; end if;
  if jsonb_array_length(loaded->'linkedAccounts') <> 1 then raise exception 'linked accounts missing'; end if;
  if (loaded->'campaigns'->0->>'payModel') <> 'pool' then raise exception 'pay model missing'; end if;
  if (loaded->'campaigns'->0->>'workspaceId') <> workspace::text then raise exception 'workspace id missing'; end if;
  if (loaded->'submissions'->0->>'socialAccountId') <> social::text then raise exception 'social account id missing'; end if;
  if (loaded->'viewSnapshots'->0->>'status') <> 'confirmed' then raise exception 'snapshot status missing'; end if;
  if (loaded->'profiles'->0->'onboarding'->>'stepId') <> 'tour' then raise exception 'onboarding missing'; end if;
  if (loaded->'notificationDispatches'->0->>'dedupeKey') <> 'campaign_live:test' then raise exception 'dispatch missing'; end if;
end $$;
