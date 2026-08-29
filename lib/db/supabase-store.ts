import { createClient } from "@supabase/supabase-js";

import type { DatabaseStore } from "./types";

const STORE_ROW_ID = "default";

const emptyStore = (): DatabaseStore => ({
  profiles: [],
  campaigns: [],
  submissions: [],
  viewSnapshots: [],
  wallets: [],
  ledgerEntries: [],
  payoutMethods: [],
  withdrawalRequests: [],
  influencerProfiles: [],
  rateCards: [],
  bookings: [],
  brandDeposits: [],
  fraudFlags: [],
});

export function isSupabaseStoreEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadStoreFromSupabase(): Promise<DatabaseStore | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fweta_app_store")
    .select("data")
    .eq("id", STORE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.warn("[fweta] Supabase store load failed:", error.message);
    return null;
  }

  if (!data?.data || typeof data.data !== "object") {
    return null;
  }

  return { ...emptyStore(), ...(data.data as DatabaseStore) };
}

export async function saveStoreToSupabase(store: DatabaseStore): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("fweta_app_store").upsert(
    {
      id: STORE_ROW_ID,
      data: store,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.warn("[fweta] Supabase store save failed:", error.message);
    return false;
  }

  return true;
}
