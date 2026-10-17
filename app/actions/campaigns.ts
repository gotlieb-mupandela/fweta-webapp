"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import { allocateCampaignFunds, isCampaignFunded } from "@/lib/campaigns/fund";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import { notifyCampaignLive } from "@/lib/notifications/events";
import type { Campaign, CampaignAsset } from "@/lib/db/types";
import { campaignsVisibleToBrand, canEditCampaign } from "@/lib/onboarding/access";
import { ensureOwnedWorkspace } from "@/lib/onboarding/workspaces";
import { finalizeCampaign, refundUnspentCampaign } from "@/lib/rewards/earnings";
import {
  DEFAULT_COUNTRY_CODES,
  DEFAULT_MIN_VIEWS,
  campaignIsDiscoverable,
  remainingBudgetCents,
} from "@/lib/rewards/content-rewards";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import type { CampaignStatus } from "@/types/enums";

function assertBrand(roles: string[]) {
  if (!roles.includes("brand") && !roles.includes("admin")) {
    return false;
  }
  return true;
}

function zodMessage(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Invalid campaign details.";
}

export async function listBrandCampaigns() {
  const session = await getSession();
  if (!session || !assertBrand(session.roles)) return [];
  const store = await readStore();
  return campaignsVisibleToBrand(store, session).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCampaign(id: string) {
  const store = await readStore();
  return store.campaigns.find((c) => c.id === id) ?? null;
}

export async function createCampaignAction(raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const parsed = campaignCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) };

  const now = nowIso();
  const assets: CampaignAsset[] = (parsed.data.assets ?? []).map((asset) => ({
    id: newId(),
    label: asset.label,
    url: asset.url,
  }));
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
    minPayoutCents: parsed.data.minPayoutCents ?? 0,
    minViews: parsed.data.minViews ?? DEFAULT_MIN_VIEWS,
    payModel: parsed.data.payModel ?? "cpm",
    countries: parsed.data.countries?.length ? parsed.data.countries : [...DEFAULT_COUNTRY_CODES],
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    maxPayoutPerSubmissionCents: parsed.data.maxPayoutPerSubmissionCents,
    platforms: parsed.data.platforms,
    requirements: parsed.data.requirements ?? "",
    rules: parsed.data.rules ?? "",
    assets,
    startDate: parsed.data.startDate || null,
    endDate: parsed.data.endDate || null,
    createdAt: now,
    updatedAt: now,
  };

  // Atomic: create + fund in one write so a crash can't leave an
  // unfunded "active" campaign or orphan a wallet debit.
  try {
    await updateStore((s) => {
      const profile = s.profiles.find((item) => item.id === session.id);
      if (profile?.roles.includes("brand")) {
        const workspaceId = ensureOwnedWorkspace(s, profile, now, newId);
        if (workspaceId) campaign.workspaceId = workspaceId;
      }
      s.campaigns.push(campaign);
      if (campaign.status === "active") allocateCampaignFunds(s, campaign);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not fund campaign." };
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/deposits");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  if (campaign.status === "active") {
    await notifyCampaignLive(campaign.id);
  }
  return { ok: true as const, id: campaign.id };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: zodMessage(parsed.error) };

  let found = false;
  try {
    await updateStore((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) return;
      if (!canEditCampaign(s, session, c)) return;
      const nextBudget = parsed.data.budgetTotalCents;
      if (nextBudget !== undefined && nextBudget < c.budgetSpentCents) {
        throw new Error("Budget can't be lower than the amount already paid to creators.");
      }
      if (
        c.status === "completed" &&
        nextBudget !== undefined &&
        nextBudget !== c.budgetTotalCents
      ) {
        throw new Error("Completed campaigns can't change budget.");
      }
      found = true;
      const next = { ...parsed.data };
      // Status changes go through setCampaignStatusAction so funding stays in sync.
      delete next.status;
      if (isCampaignFunded(s, c.id) || c.status === "active" || c.status === "paused" || c.status === "completed") {
        delete next.budgetTotalCents;
        delete next.payModel;
        delete next.minViews;
      }
      if (next.assets) {
        c.assets = next.assets.map((asset) => ({
          id: newId(),
          label: asset.label,
          url: asset.url,
        }));
        delete next.assets;
      }
      if ("startDate" in next) c.startDate = next.startDate || null;
      if ("endDate" in next) c.endDate = next.endDate || null;
      delete next.startDate;
      delete next.endDate;
      Object.assign(c, next, { updatedAt: nowIso() });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  if (!found) return { ok: false as const, error: "Campaign not found." };
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand/analytics");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true as const };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };

  let becameActive = false;
  try {
    await updateStore((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) throw new Error("Campaign not found.");
      if (!canEditCampaign(s, session, c)) {
        throw new Error("Not allowed.");
      }
      if (status === "active" && c.status !== "active") {
        allocateCampaignFunds(s, c);
        becameActive = true;
      }
      c.status = status;
      c.updatedAt = nowIso();
      if (status === "completed") finalizeCampaign(s, c, Date.now());
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  if (becameActive) await notifyCampaignLive(id);
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/analytics");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true as const };
}

export async function duplicateCampaignAction(id: string) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
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
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await updateStore((s) => {
    s.campaigns.push(copy);
  });
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const, id: copy.id };
}

export async function deleteCampaignAction(id: string) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };

  try {
    await updateStore((s) => {
      const idx = s.campaigns.findIndex((x) => x.id === id);
      if (idx === -1) throw new Error("Campaign not found.");
      const campaign = s.campaigns[idx];
      if (!canEditCampaign(s, session, campaign)) {
        throw new Error("Not allowed.");
      }
      const related = s.submissions.filter((sub) => sub.campaignId === id);
      if (related.some((sub) => sub.status === "approved" && sub.earningsCents > 0)) {
        throw new Error(
          "Cannot delete a campaign that has already paid clippers. Mark it completed instead.",
        );
      }
      refundUnspentCampaign(s, campaign, Date.now());
      const submissionIds = new Set(related.map((sub) => sub.id));
      s.submissions = s.submissions.filter((sub) => sub.campaignId !== id);
      s.viewSnapshots = s.viewSnapshots.filter((snap) => !submissionIds.has(snap.submissionId));
      s.campaigns.splice(idx, 1);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/analytics");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/campaigns");
  return { ok: true as const };
}

export type DiscoverSort = "newest" | "budget" | "rate" | "paid";

export type DiscoverCampaign = {
  campaign: Campaign;
  approvedClips: number;
};

export async function listActiveCampaignsPublic(filters?: {
  platform?: string;
  type?: string;
  category?: string;
  q?: string;
  sort?: string;
  payModel?: string;
  country?: string;
}): Promise<DiscoverCampaign[]> {
  const store = await readStore();
  const counts = new Map<string, number>();
  for (const submission of store.submissions) {
    if (submission.status !== "approved") continue;
    counts.set(submission.campaignId, (counts.get(submission.campaignId) ?? 0) + 1);
  }

  const sort = (filters?.sort ?? "newest") as DiscoverSort;
  const rows = store.campaigns
    .filter((c) => campaignIsDiscoverable(c))
    .filter((c) => (filters?.type ? c.type === filters.type : true))
    .filter((c) =>
      filters?.category
        ? c.category.toLowerCase() === filters.category.toLowerCase()
        : true,
    )
    .filter((c) =>
      filters?.platform ? c.platforms.includes(filters.platform as never) : true,
    )
    .filter((c) => (filters?.payModel === "cpm" || filters?.payModel === "pool" ? c.payModel === filters.payModel : true))
    .filter((c) => {
      const country = filters?.country === undefined ? "NA" : filters.country;
      if (!country || country === "all") return true;
      return c.countries.includes(country);
    })
    .filter((c) =>
      filters?.q
        ? `${c.title} ${c.category} ${c.description} ${c.requirements}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    )
    .map((campaign) => ({
      campaign,
      approvedClips: counts.get(campaign.id) ?? 0,
    }));

  rows.sort((a, b) => {
    if (sort === "budget") {
      return remainingBudgetCents(b.campaign) - remainingBudgetCents(a.campaign);
    }
    if (sort === "rate") return b.campaign.cpmCents - a.campaign.cpmCents;
    if (sort === "paid") return b.campaign.budgetSpentCents - a.campaign.budgetSpentCents;
    return b.campaign.createdAt.localeCompare(a.campaign.createdAt);
  });
  return rows;
}

export async function listDiscoverCategories(): Promise<string[]> {
  const store = await readStore();
  const categories = new Set<string>();
  for (const campaign of store.campaigns) {
    if (campaignIsDiscoverable(campaign) && campaign.category.trim()) {
      categories.add(campaign.category.trim());
    }
  }
  return [...categories].sort((a, b) => a.localeCompare(b));
}
