import type { Metadata } from "next";

import { readStore } from "@/lib/db/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const store = await readStore();
    const campaign = store.campaigns.find((row) => row.id === id && row.status === "active");
    if (!campaign) return { title: "Campaign" };
    const description = campaign.description.replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      title: campaign.title,
      description,
      openGraph: { title: campaign.title, description },
    };
  } catch {
    return { title: "Campaign" };
  }
}

export default function CampaignDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
