-- Allow brands to cancel campaigns (unused budget is refunded in the app ledger).
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'cancelled';
