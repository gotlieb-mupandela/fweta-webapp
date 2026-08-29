"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { fundCampaignFromWallet } from "@/lib/campaigns/fund";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Campaign } from "@/lib/db/types";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import type { CampaignStatus } from "@/types/enums";

function assertBrand(roles: string[]) {
  if (!roles.includes("brand") && !roles.includes("admin")) {
    throw new Error("Brand role required");
  }
}

export async function listBrandCampaigns() {
  const session = await requireSession();
  assertBrand(session.roles);
  const store = await readStore();
  return store.campaigns
    .filter((c) => (session.roles.includes("admin") ? true : c.brandId === session.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCampaign(id: string) {
  const store = await readStore();
  return store.campaigns.find((c) => c.id === id) ?? null;
}

export async function createCampaignAction(raw: unknown) {
  const session = await requireSession();
  assertBrand(session.roles);
  const parsed = campaignCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid campaign details." };

  const now = nowIso();
  const campaign: Campaign = {
    id: newId(),
    brandId: session.id,
    title: parsed.data.title,
    description: parsed.data.description,
    type: parsed.data.type,
    category: parsed.data.category,
    status: parsed.data.status ?? "draft",
    budgetTotalCents: parsed.data.budgetTotalCents,
    budgetSpentCents: 0,
    cpmCents: parsed.data.cpmCents,
    maxPayoutPerSubmissionCents: parsed.data.maxPayoutPerSubmissionCents,
    platforms: parsed.data.platforms,
    requirements: parsed.data.requirements ?? "",
    endDate: parsed.data.endDate ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await updateStore((s) => {
    s.campaigns.push(campaign);
  });

  if (campaign.status === "active") {
    const funded = await fundCampaignFromWallet({
      brandId: session.id,
      campaignId: campaign.id,
      budgetCents: campaign.budgetTotalCents,
    });
    if (!funded.ok) {
      await updateStore((s) => {
        s.campaigns = s.campaigns.filter((c) => c.id !== campaign.id);
      });
      return funded;
    }
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  return { ok: true as const, id: campaign.id };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  assertBrand(session.roles);
  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid campaign details." };

  let found = false;
  await updateStore((s) => {
    const c = s.campaigns.find((x) => x.id === id);
    if (!c) return;
    if (c.brandId !== session.id && !session.roles.includes("admin")) return;
    found = true;
    Object.assign(c, parsed.data, { updatedAt: nowIso() });
  });
  if (!found) return { ok: false as const, error: "Campaign not found." };
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  const session = await requireSession();
  assertBrand(session.roles);

  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === id);
  if (!campaign) return { ok: false as const, error: "Campaign not found." };
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Not allowed." };
  }

  if (status === "active") {
    const funded = await fundCampaignFromWallet({
      brandId: campaign.brandId,
      campaignId: campaign.id,
      budgetCents: campaign.budgetTotalCents,
    });
    if (!funded.ok) return funded;
  }

  await updateStore((s) => {
    const c = s.campaigns.find((x) => x.id === id);
    if (!c) return;
    c.status = status;
    c.updatedAt = nowIso();
  });
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  return { ok: true as const };
}

export async function duplicateCampaignAction(id: string) {
  const session = await requireSession();
  assertBrand(session.roles);
  const store = await readStore();
  const source = store.campaigns.find((c) => c.id === id && c.brandId === session.id);
  if (!source) return { ok: false as const, error: "Campaign not found." };

  const now = nowIso();
  const copy: Campaign = {
    ...source,
    id: newId(),
    title: `${source.title} (copy)`,
    status: "draft",
    budgetSpentCents: 0,
    createdAt: now,
    updatedAt: now,
  };
  await updateStore((s) => {
    s.campaigns.push(copy);
  });
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const, id: copy.id };
}

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
