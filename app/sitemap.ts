import type { MetadataRoute } from "next";

import { readStore } from "@/lib/db/store";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com").replace(/\/$/, "");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/campaigns`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/influencers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/legal/creator-terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  try {
    const store = await readStore();
    for (const campaign of store.campaigns) {
      if (campaign.status !== "active") continue;
      entries.push({
        url: `${base}/campaigns/${campaign.id}`,
        lastModified: new Date(campaign.updatedAt),
        changeFrequency: "hourly",
        priority: 0.6,
      });
    }
    for (const profile of store.influencerProfiles) {
      if (!profile.published) continue;
      entries.push({
        url: `${base}/influencers/${profile.slug}`,
        lastModified: new Date(profile.updatedAt),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  } catch {
    // Public index still lists the stable routes when the store is unavailable.
  }

  return entries;
}
