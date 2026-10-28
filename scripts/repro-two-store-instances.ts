/**
 * Two serverless instances, one shared store.
 *
 * Each instance has its own in-memory cache. The document lives in a shared
 * database (in memory, or local Postgres when this file is run directly).
 *
 * The pinned cache is the old read path: return whatever this process loaded
 * first. The coherent read checks revision and reloads when another instance
 * has written. Run: `npx tsx scripts/repro-two-store-instances.ts`
 */
import { execFileSync } from "node:child_process";
import { sessionGate } from "../lib/auth/session-gate";
import {
  createCoherentCache,
  readCoherent,
  readPinned,
  rememberCommit,
  type CoherentIo,
} from "../lib/db/read-coherence";
import { commitLoadedMutation, type CasResult } from "../lib/db/store-commit";

export type DemoStore = {
  profiles: {
    id: string;
    email: string;
    bio: string;
    hash: string;
    credentialVersion: number;
  }[];
  campaigns: { id: string }[];
  influencerProfiles: { userId: string }[];
  rateCards: { id: string }[];
};

export type SharedDocument = {
  load: () => Promise<{ store: DemoStore; revision: number }>;
  save: (store: DemoStore, expectedRevision: number | null) => Promise<CasResult>;
  readRevision: () => Promise<number | null>;
};

const USER_ID = "u";
const EMAIL = "qa@example.com";
const CAMPAIGN_ID = "c1";
const RATE_MESSAGE = "Create your public profile before adding rate cards.";

export function initialStore(): DemoStore {
  return {
    profiles: [
      {
        id: USER_ID,
        email: EMAIL,
        bio: "",
        hash: "old",
        credentialVersion: 0,
      },
    ],
    campaigns: [],
    influencerProfiles: [],
    rateCards: [],
  };
}

export function createMemoryDocument(initialRevision: number, initial: DemoStore): SharedDocument {
  let row = { revision: initialRevision, store: structuredClone(initial) };
  let tail: Promise<void> = Promise.resolve();

  return {
    async load() {
      return { store: structuredClone(row.store), revision: row.revision };
    },
    async readRevision() {
      return row.revision;
    },
    save(store, expectedRevision) {
      const run = tail.then(async () => {
        if (expectedRevision === null || row.revision !== expectedRevision) {
          return { ok: false as const, conflict: true as const };
        }
        row = { revision: row.revision + 1, store: structuredClone(store) };
        return { ok: true as const, revision: row.revision };
      });
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

function campaignHttp(store: DemoStore | null): "404" | "200" {
  if (!store?.campaigns.some((campaign) => campaign.id === CAMPAIGN_ID)) return "404";
  return "200";
}

function loginMessage(store: DemoStore | null): string {
  const profile = store?.profiles.find((item) => item.email === EMAIL);
  if (!profile || profile.hash !== "new") return "Invalid email or password.";
  return "ok";
}

function rateMessage(store: DemoStore | null): string {
  if (!store?.influencerProfiles.some((profile) => profile.userId === USER_ID)) return RATE_MESSAGE;
  return "ok";
}

function ioFor(doc: SharedDocument, loads: { count: number }): CoherentIo<DemoStore> {
  return {
    readRevision: () => doc.readRevision(),
    load: async () => {
      loads.count += 1;
      const loaded = await doc.load();
      return { value: loaded.store, revision: loaded.revision };
    },
  };
}

export type InstanceReport = {
  pinnedCampaign: "404" | "200";
  coherentCampaign: "404" | "200";
  pinnedLogin: string;
  coherentLogin: string;
  pinnedSession: ReturnType<typeof sessionGate>;
  coherentSession: ReturnType<typeof sessionGate>;
  pinnedRateCards: string;
  coherentRateCards: string;
  documentLoadsAfterWarm: number;
  blindStaleWriteConflicted: boolean;
  campaignSurvivedBlindWrite: boolean;
  coherentFormKeptBio: boolean;
  staleFormRevertedBio: boolean;
  bothAddsPresent: boolean;
};

/**
 * Instance A and instance B each warm a cache. A then saves the profile,
 * campaign, and influencer profile. B's pinned cache still has the old
 * document. B's coherent read follows the new revision.
 */
export async function demonstrateInstances(doc: SharedDocument): Promise<InstanceReport> {
  const loads = { count: 0 };
  const io = ioFor(doc, loads);
  const instanceA = createCoherentCache<DemoStore>();
  const instanceB = createCoherentCache<DemoStore>();

  await readCoherent(instanceA, io);
  await readCoherent(instanceB, io);
  const loadsAfterWarm = loads.count;

  const saved = await commitLoadedMutation({
    load: () => doc.load(),
    save: (store, expectedRevision) => doc.save(store, expectedRevision),
    clone: (store) => structuredClone(store),
    mutate: (store) => {
      const profile = store.profiles.find((item) => item.id === USER_ID);
      if (!profile) throw new Error("profile missing on fresh load");
      profile.bio = "kept";
      profile.hash = "new";
      profile.credentialVersion = 1;
      store.campaigns.push({ id: CAMPAIGN_ID });
      store.influencerProfiles.push({ userId: USER_ID });
    },
  });
  if (saved.revision === null) throw new Error("save did not return a revision");
  rememberCommit(instanceA, saved.value, saved.revision);

  const pinned = readPinned(instanceB);
  const pinnedCampaign = campaignHttp(pinned);
  const pinnedLogin = loginMessage(pinned);
  const pinnedSession = sessionGate(
    { credentialVersion: 1 },
    pinned
      ? { suspended: false, credentialVersion: pinned.profiles[0]?.credentialVersion ?? 0 }
      : null,
  );
  const pinnedRateCards = rateMessage(pinned);

  const coherent = await readCoherent(instanceB, io);
  const coherentCampaign = campaignHttp(coherent);
  const coherentLogin = loginMessage(coherent);
  const coherentSession = sessionGate(
    { credentialVersion: 1 },
    coherent
      ? { suspended: false, credentialVersion: coherent.profiles[0]?.credentialVersion ?? 0 }
      : null,
  );
  const coherentRateCards = rateMessage(coherent);

  // The old full-document upsert used the warm copy and the revision it
  // remembered. Compare-and-swap must reject that write.
  const blind = await doc.save(structuredClone(pinned ?? initialStore()), 1);
  const afterBlind = await doc.load();

  await commitLoadedMutation({
    load: () => doc.load(),
    save: (store, expectedRevision) => doc.save(store, expectedRevision),
    clone: (store) => structuredClone(store),
    mutate: (store) => {
      store.rateCards.push({ id: "r1" });
    },
  });
  const afterAdds = await doc.load();

  const seen = await readCoherent(instanceB, io);
  const formBio = seen?.profiles[0]?.bio ?? "";
  await commitLoadedMutation({
    load: () => doc.load(),
    save: (store, expectedRevision) => doc.save(store, expectedRevision),
    clone: (store) => structuredClone(store),
    mutate: (store) => {
      const profile = store.profiles.find((item) => item.id === USER_ID);
      if (profile) profile.bio = formBio;
    },
  });
  const afterCoherentForm = await doc.load();

  await commitLoadedMutation({
    load: () => doc.load(),
    save: (store, expectedRevision) => doc.save(store, expectedRevision),
    clone: (store) => structuredClone(store),
    mutate: (store) => {
      const profile = store.profiles.find((item) => item.id === USER_ID);
      if (profile) profile.bio = pinned?.profiles[0]?.bio ?? "";
    },
  });
  const afterStaleForm = await doc.load();

  return {
    pinnedCampaign,
    coherentCampaign,
    pinnedLogin,
    coherentLogin,
    pinnedSession,
    coherentSession,
    pinnedRateCards,
    coherentRateCards,
    documentLoadsAfterWarm: loads.count - loadsAfterWarm,
    blindStaleWriteConflicted: blind.ok === false,
    campaignSurvivedBlindWrite: afterBlind.store.campaigns.some((campaign) => campaign.id === CAMPAIGN_ID),
    coherentFormKeptBio: afterCoherentForm.store.profiles[0]?.bio === "kept",
    staleFormRevertedBio: afterStaleForm.store.profiles[0]?.bio === "",
    bothAddsPresent:
      afterAdds.store.campaigns.some((campaign) => campaign.id === CAMPAIGN_ID) &&
      afterAdds.store.rateCards.some((card) => card.id === "r1"),
  };
}

function psql(sql: string): string {
  // stderr is piped so an expected fweta_store_conflict does not look like a crash.
  return execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", "fweta_repro", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

function createPostgresDocument(): SharedDocument {
  return {
    async readRevision() {
      const text = psql("select revision::text from public.fweta_app_store where id = 'default'");
      if (!text) return null;
      const revision = Number(text);
      return Number.isSafeInteger(revision) ? revision : null;
    },
    async load() {
      const revisionText = psql("select revision::text from public.fweta_app_store where id = 'default'");
      const dataText = psql("select data::text from public.fweta_app_store where id = 'default'");
      const revision = Number(revisionText);
      if (!Number.isSafeInteger(revision) || !dataText) {
        throw new Error("postgres row missing");
      }
      return { store: JSON.parse(dataText) as DemoStore, revision };
    },
    async save(store, expectedRevision) {
      const payload = Buffer.from(JSON.stringify(store), "utf8").toString("base64");
      const expected = expectedRevision === null ? "null" : String(expectedRevision);
      try {
        const out = psql(
          `select public.fweta_cas_save_store(convert_from(decode('${payload}', 'base64'), 'utf8')::jsonb, ${expected})`,
        );
        const revision = Number(out);
        if (!Number.isSafeInteger(revision)) {
          throw new Error(`fweta_cas_save_store returned ${out}`);
        }
        return { ok: true, revision };
      } catch (err) {
        const text = err instanceof Error ? `${err.message}\n${"stderr" in err ? String((err as { stderr?: unknown }).stderr ?? "") : ""}` : String(err);
        if (text.includes("fweta_store_conflict")) return { ok: false, conflict: true };
        throw err;
      }
    },
  };
}

const SETUP_SQL = `
set client_min_messages = warning;
create schema if not exists auth;
create or replace function auth.role()
returns text
language sql
stable
as $$ select 'service_role'::text $$;

create table if not exists public.fweta_app_store (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  revision bigint not null default 0
);

create or replace function public.fweta_app_store_bump_revision()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.revision := 1;
    if NEW.updated_at is null then
      NEW.updated_at := now();
    end if;
    return NEW;
  end if;
  if NEW.data is distinct from OLD.data then
    NEW.revision := OLD.revision + 1;
    NEW.updated_at := now();
  else
    NEW.revision := OLD.revision;
  end if;
  return NEW;
end;
$$;

drop trigger if exists fweta_app_store_bump_revision on public.fweta_app_store;
create trigger fweta_app_store_bump_revision
before insert or update on public.fweta_app_store
for each row
execute function public.fweta_app_store_bump_revision();

create or replace function public.fweta_cas_save_store(payload jsonb, expected_revision bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_revision bigint;
  current_data jsonb;
  new_revision bigint;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'fweta store RPCs are limited to the service role' using errcode = '42501';
  end if;
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'fweta store payload must be a JSON object' using errcode = '22023';
  end if;
  select revision, data into existing_revision, current_data
  from public.fweta_app_store where id = 'default' for update;
  if not found then
    if expected_revision is not null then
      raise exception 'fweta_store_conflict' using errcode = '40001';
    end if;
    insert into public.fweta_app_store (id, data, updated_at)
    values ('default', payload, now())
    on conflict (id) do nothing
    returning revision into new_revision;
    if new_revision is null then
      raise exception 'fweta_store_conflict' using errcode = '40001';
    end if;
    return new_revision;
  end if;
  if expected_revision is null or existing_revision is distinct from expected_revision then
    raise exception 'fweta_store_conflict' using errcode = '40001';
  end if;
  update public.fweta_app_store
  set data = payload, updated_at = now()
  where id = 'default' and revision = expected_revision
  returning revision into new_revision;
  if new_revision is null then
    raise exception 'fweta_store_conflict' using errcode = '40001';
  end if;
  return new_revision;
end;
$$;

grant execute on function public.fweta_cas_save_store(jsonb, bigint) to public;
truncate public.fweta_app_store;
`;

function assertReport(report: InstanceReport, label: string) {
  const failures: string[] = [];
  const expect = (name: string, actual: unknown, wanted: unknown) => {
    if (actual !== wanted) failures.push(`${name}: got ${String(actual)}, wanted ${String(wanted)}`);
  };
  expect("pinnedCampaign", report.pinnedCampaign, "404");
  expect("coherentCampaign", report.coherentCampaign, "200");
  expect("pinnedLogin", report.pinnedLogin, "Invalid email or password.");
  expect("coherentLogin", report.coherentLogin, "ok");
  expect("pinnedSession", report.pinnedSession, "expired");
  expect("coherentSession", report.coherentSession, "ok");
  expect("pinnedRateCards", report.pinnedRateCards, RATE_MESSAGE);
  expect("coherentRateCards", report.coherentRateCards, "ok");
  expect("documentLoadsAfterWarm", report.documentLoadsAfterWarm > 0, true);
  expect("blindStaleWriteConflicted", report.blindStaleWriteConflicted, true);
  expect("campaignSurvivedBlindWrite", report.campaignSurvivedBlindWrite, true);
  expect("coherentFormKeptBio", report.coherentFormKeptBio, true);
  expect("staleFormRevertedBio", report.staleFormRevertedBio, true);
  expect("bothAddsPresent", report.bothAddsPresent, true);
  if (failures.length > 0) {
    throw new Error(`${label} failed\n${failures.join("\n")}\n${JSON.stringify(report, null, 2)}`);
  }
  console.log(`${label} ok`);
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const memory = createMemoryDocument(1, initialStore());
  assertReport(await demonstrateInstances(memory), "in-memory shared document");

  try {
    execFileSync("sudo", ["-u", "postgres", "psql", "-d", "postgres", "-c", "select 1"], {
      stdio: "ignore",
    });
  } catch {
    console.log("local postgres not reachable; skipped the database run");
    return;
  }

  execFileSync("sudo", ["-u", "postgres", "psql", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "select 1 from pg_database where datname = 'fweta_repro'"], {
    stdio: "ignore",
  });
  const exists = execFileSync(
    "sudo",
    ["-u", "postgres", "psql", "-d", "postgres", "-t", "-A", "-c", "select 1 from pg_database where datname = 'fweta_repro'"],
    { encoding: "utf8" },
  ).trim();
  if (exists !== "1") {
    execFileSync("sudo", ["-u", "postgres", "createdb", "fweta_repro"], { stdio: "inherit" });
  }
  execFileSync("sudo", ["-u", "postgres", "psql", "-d", "fweta_repro", "-v", "ON_ERROR_STOP=1"], {
    input: SETUP_SQL,
    encoding: "utf8",
  });

  const postgres = createPostgresDocument();
  const seeded = await postgres.save(initialStore(), null);
  if (!seeded.ok) throw new Error("could not seed the local postgres row");
  assertReport(await demonstrateInstances(postgres), "local postgres fweta_cas_save_store");
}

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("scripts/repro-two-store-instances.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
