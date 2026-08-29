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

function normalizeStore(raw: unknown): DatabaseStore | null {
  if (!raw || typeof raw !== "object") return null;
  return { ...emptyStore(), ...(raw as DatabaseStore) };
}

function hasData(store: DatabaseStore): boolean {
  return (
    store.profiles.length > 0 ||
    store.campaigns.length > 0 ||
    store.submissions.length > 0
  );
}

async function loadJsonBlob(): Promise<DatabaseStore | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fweta_app_store")
    .select("data")
    .eq("id", STORE_ROW_ID)
    .maybeSingle();

  if (error || !data?.data) return null;
  return normalizeStore(data.data);
}

async function saveJsonBlob(store: DatabaseStore): Promise<boolean> {
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
    console.warn("[fweta] JSON blob save failed:", error.message);
    return false;
  }
  return true;
}

async function loadRelationalStore(): Promise<DatabaseStore | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fweta_load_store");

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational load failed:", error.message);
    }
    return null;
  }

  return normalizeStore(data);
}

async function saveRelationalStore(store: DatabaseStore): Promise<boolean> {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("fweta_save_store", { payload: store });

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational save failed:", error.message);
    }
    return false;
  }
  return true;
}

export async function loadStoreFromSupabase(): Promise<DatabaseStore | null> {
  const relational = await loadRelationalStore();
  if (relational && hasData(relational)) {
    return relational;
  }

  const jsonBlob = await loadJsonBlob();
  if (jsonBlob && hasData(jsonBlob)) {
    // Migrate legacy JSON blob → relational tables when schema exists
    await saveRelationalStore(jsonBlob).catch(() => undefined);
    return jsonBlob;
  }

  return relational ?? jsonBlob;
}

export async function saveStoreToSupabase(store: DatabaseStore): Promise<boolean> {
  const relationalOk = await saveRelationalStore(store);
  const jsonOk = await saveJsonBlob(store);
  return relationalOk || jsonOk;
}
