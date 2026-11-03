/**
 * Review-only report of stored social links that are not profile URLs.
 *
 * Reads a local store JSON file. It does not connect to a database,
 * does not update rows, and must not be pointed at production.
 * Do not run supabase db push. Do not apply
 * supabase/migrations/20260830153000_fweta_app_store_grants.sql.
 *
 * Usage: npx tsx scripts/report-invalid-social-urls.ts [path-to-store.json]
 */
import { readFileSync } from "node:fs";

import { normalizeSocialProfileUrl } from "@/lib/social/profile-url";
import type { SocialPlatform } from "@/types/enums";

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "facebook", "youtube", "x"];

type Row = {
  source: string;
  id: string;
  platform: SocialPlatform;
  reason: string;
};

function reasonFor(platform: SocialPlatform, value: string): string | null {
  const parsed = normalizeSocialProfileUrl(platform, value);
  if (parsed.ok) {
    if (parsed.url && parsed.url !== value.trim()) return "needs-canonical-form";
    return null;
  }
  if (/error page/i.test(parsed.message)) return "error-page-text";
  if (/spaces/i.test(parsed.message)) return "spaces";
  if (/post link/i.test(parsed.message)) return "post-link";
  if (/not an? /i.test(parsed.message)) return "wrong-host";
  return "invalid-profile-url";
}

function scan(source: string, rows: unknown): Row[] {
  if (!Array.isArray(rows)) return [];
  const found: Row[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { id?: unknown; socials?: unknown };
    const id = typeof record.id === "string" ? record.id : "unknown";
    const socials = record.socials;
    if (!socials || typeof socials !== "object") continue;
    for (const platform of PLATFORMS) {
      const value = (socials as Record<string, unknown>)[platform];
      if (typeof value !== "string" || !value.trim()) continue;
      const reason = reasonFor(platform, value);
      if (reason) found.push({ source, id, platform, reason });
    }
  }
  return found;
}

const path = process.argv[2] ?? "data/store.json";
let raw: string;
try {
  raw = readFileSync(path, "utf8");
} catch {
  console.log(`No store file at ${path}. Nothing to report.`);
  process.exit(0);
}

const store = JSON.parse(raw) as { profiles?: unknown; influencerProfiles?: unknown };
const hits = [
  ...scan("profiles", store.profiles),
  ...scan("influencerProfiles", store.influencerProfiles),
];

if (hits.length === 0) {
  console.log("No invalid social URLs in this file.");
  process.exit(0);
}

console.log(`${hits.length} invalid social URL${hits.length === 1 ? "" : "s"} for review:`);
for (const hit of hits) {
  console.log(`${hit.source}\t${hit.id}\t${hit.platform}\t${hit.reason}`);
}
