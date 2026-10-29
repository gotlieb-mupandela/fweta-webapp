import type { MetadataRoute } from "next";

import { readStore } from "@/lib/db/store";
import { directoryCategoryPath, isPublicListing, publicBusinesses } from "@/lib/directory/public";
import { publicCreatorChoices } from "@/lib/public/creators";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://app.fweta.com").replace(/\/$/, "");
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/campaigns`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${base}/influencers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/directory`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/faq`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/verify-email`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
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
    for (const profile of publicCreatorChoices(store.influencerProfiles, store.profiles)) {
      entries.push({
        url: `${base}/influencers/${profile.slug}`,
        lastModified: new Date(profile.updatedAt),
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
    const seen = new Set<string>();
    for (const listing of publicBusinesses(store)) {
      if (!isPublicListing(listing)) continue;
      entries.push({
        url: `${base}/business/${listing.slug}`,
        lastModified: new Date(listing.updatedAt),
        changeFrequency: "weekly",
        priority: 0.7,
      });
      const path = directoryCategoryPath(listing.city, listing.category);
      if (!seen.has(path)) {
        seen.add(path);
        entries.push({
          url: `${base}${path}`,
          lastModified: new Date(listing.updatedAt),
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    }
    for (const portfolio of store.creatorPortfolios) {
      if (!portfolio.published) continue;
      entries.push({
        url: `${base}/creators/${portfolio.userId}`,
        lastModified: new Date(portfolio.updatedAt),
        changeFrequency: "weekly",
        priority: 0.4,
      });
    }
  } catch {
    // Public index still lists the stable routes when the store is unavailable.
  }

  return entries;
}
