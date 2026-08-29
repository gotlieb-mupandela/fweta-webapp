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

export function normalizeStore(raw: unknown): DatabaseStore | null {
  if (!raw || typeof raw !== "object") return null;
  const base = emptyStore();
  const input = raw as Record<string, unknown>;
  const store = { ...base, ...input } as DatabaseStore;

  // Supabase JSON may contain null arrays — coerce so .filter/.map never throw.
  (Object.keys(base) as (keyof DatabaseStore)[]).forEach((key) => {
    if (!Array.isArray(store[key])) {
      (store as Record<string, unknown>)[key] = [];
    }
  });

  return store;
}

function hasData(store: DatabaseStore): boolean {
  return (
    store.profiles.length > 0 ||
    store.campaigns.length > 0 ||
    store.submissions.length > 0
  );
}

async function loadJsonBlob(): Promise<DatabaseStore | null> {
  try {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fweta_app_store")
    .select("data")
    .eq("id", STORE_ROW_ID)
    .maybeSingle();

  if (error || !data?.data) return null;
  return normalizeStore(data.data);
  } catch (err) {
    console.warn("[fweta] JSON blob load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function saveJsonBlob(store: DatabaseStore): Promise<boolean> {
  try {
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
  } catch (err) {
    console.warn("[fweta] JSON blob save failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function loadRelationalStore(): Promise<DatabaseStore | null> {
  try {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("fweta_load_store");

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational load failed:", error.message);
    }
    return null;
  }

  return normalizeStore(data);
  } catch (err) {
    console.warn("[fweta] Relational load failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function saveRelationalStore(store: DatabaseStore): Promise<boolean> {
  try {
  const supabase = createServiceClient();
  const { error } = await supabase.rpc("fweta_save_store", { payload: store });

  if (error) {
    if (!error.message.includes("Could not find the function")) {
      console.warn("[fweta] Relational save failed:", error.message);
    }
    return false;
  }
  return true;
  } catch (err) {
    console.warn("[fweta] Relational save failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function loadStoreFromSupabase(): Promise<DatabaseStore | null> {
  try {
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
  } catch (err) {
    console.warn("[fweta] loadStoreFromSupabase failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function saveStoreToSupabase(store: DatabaseStore): Promise<boolean> {
  const relationalOk = await saveRelationalStore(store);
  const jsonOk = await saveJsonBlob(store);
  return relationalOk || jsonOk;
}
