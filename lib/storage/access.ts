import type { DatabaseStore } from "@/lib/db/types";

export function kycOwnerIds(store: Pick<DatabaseStore, "profiles">, path: string): string[] {
  return store.profiles.filter((profile) => profile.kyc?.documentPath === path).map((profile) => profile.id);
}

export function screenshotOwnerIds(
  store: Pick<DatabaseStore, "viewSnapshots" | "submissions">,
  path: string,
): string[] {
  const ids = new Set<string>();
  for (const snap of store.viewSnapshots) {
    if (snap.screenshotPath !== path) continue;
    const submission = store.submissions.find((item) => item.id === snap.submissionId);
    if (submission) ids.add(submission.clipperId);
  }
  return [...ids];
}

export function ugcOwnerIds(store: Pick<DatabaseStore, "ugcDeliveries" | "ugcBriefs">, path: string): string[] {
  const ids = new Set<string>();
  for (const delivery of store.ugcDeliveries) {
    if (!delivery.files.some((file) => file.name === path)) continue;
    ids.add(delivery.creatorId);
    const brief = store.ugcBriefs.find((item) => item.id === delivery.briefId);
    if (brief) ids.add(brief.brandId);
  }
  return [...ids];
}

export function publishedAvatarPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = "/api/avatars/";
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}
