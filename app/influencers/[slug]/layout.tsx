import type { Metadata } from "next";

import { readStore } from "@/lib/db/store";
import { publicCreatorChoices } from "@/lib/public/creators";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const store = await readStore();
    const profile = publicCreatorChoices(store.influencerProfiles, store.profiles).find(
      (row) => row.slug === slug,
    );
    if (!profile) return { title: "Influencer" };
    const description = (profile.headline || profile.bio).replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      title: profile.displayName,
      description,
      openGraph: { title: profile.displayName, description },
    };
  } catch {
    return { title: "Influencer" };
  }
}

export default function InfluencerDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
