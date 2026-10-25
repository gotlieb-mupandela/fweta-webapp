import "server-only";

import { readStore } from "@/lib/db/store";

/** Full campaign row for server pages. Not a client action. */
export async function getCampaign(id: string) {
  const store = await readStore();
  return store.campaigns.find((c) => c.id === id) ?? null;
}

/** Active campaigns for public browse. Not a client action. */
export async function listActiveCampaignsPublic(filters?: {
  platform?: string;
  type?: string;
  q?: string;
}) {
  const store = await readStore();
  return store.campaigns
    .filter((c) => c.status === "active")
    .filter((c) => (filters?.type ? c.type === filters.type : true))
    .filter((c) =>
      filters?.platform ? c.platforms.includes(filters.platform as never) : true,
    )
    .filter((c) =>
      filters?.q
        ? `${c.title} ${c.category} ${c.description}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
