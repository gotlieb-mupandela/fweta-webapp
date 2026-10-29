"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import { endDateHasPassed } from "@/lib/campaigns/dates";
import { adjustFundedBudget, allocateCampaignFunds, isCampaignFunded, returnUnusedCampaignFunds } from "@/lib/campaigns/fund";
import { canViewCampaign } from "@/lib/campaigns/public";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Campaign } from "@/lib/db/types";
import { hydrateCampaign } from "@/lib/rewards/content-rewards";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import { pollSubmissionViews } from "@/lib/jobs/poll-submission-views";
import type { CampaignStatus } from "@/types/enums";

function assertBrand(roles: string[]) {
  if (!roles.includes("brand") && !roles.includes("admin")) {
    return false;
  }
  return true;
}

export async function listBrandCampaigns() {
  const session = await getSession();
  if (!session || !assertBrand(session.roles)) return [];
  const store = await readStore();
  return store.campaigns
    .filter((c) => (session.roles.includes("admin") ? true : c.brandId === session.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCampaign(id: string) {
  const session = await getSession();
  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === id) ?? null;
  if (!canViewCampaign(session, campaign)) return null;
  return campaign;
}

export async function createCampaignAction(raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const parsed = campaignCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid campaign details." };
  }

  const now = nowIso();
  const campaign = hydrateCampaign({
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
    rules: "",
    assets: [],
    minPayoutCents: 0,
    minViews: 0,
    payModel: "cpm",
    countries: ["NA"],
    feeReservedCents: 0,
    feeChargedCents: 0,
    feeRefundedCents: 0,
    unspentReturnedCents: 0,
    poolSettledAt: null,
    closedAt: null,
    startDate: null,
    endDate: parsed.data.endDate ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Atomic: create + fund in one write so a crash can't leave an
  // unfunded "active" campaign or orphan a wallet debit.
  try {
    await updateStore((s) => {
      if (endDateHasPassed(campaign.endDate)) {
        throw new Error("End date must be in the future.");
      }
      s.campaigns.push(campaign);
      if (campaign.status === "active") {
        allocateCampaignFunds(s, campaign);
      }
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not fund campaign." };
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  return { ok: true as const, id: campaign.id };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid campaign details." };
  }

  // Status changes go through setCampaignStatusAction, which handles funding.
  const updates = { ...parsed.data };
  delete updates.status;

  try {
    await updateStore((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) throw new Error("Campaign not found.");
      if (c.brandId !== session.id && !session.roles.includes("admin")) {
        throw new Error("Campaign not found.");
      }
      if (updates.endDate && endDateHasPassed(updates.endDate)) {
        throw new Error("End date must be in the future.");
      }
      const nextBudget = updates.budgetTotalCents;
      if (nextBudget !== undefined && nextBudget !== c.budgetTotalCents) {
        adjustFundedBudget(s, c, nextBudget);
      }
      Object.assign(c, updates, { updatedAt: nowIso() });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  revalidatePath("/dashboard/brand");
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true as const };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };

  try {
    await updateStore((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) throw new Error("Campaign not found.");
      if (c.brandId !== session.id && !session.roles.includes("admin")) {
        throw new Error("Not allowed.");
      }
      // Atomic fund + activate: previously two writes, so a crash could
      // debit the wallet without flipping status (or vice versa).
      if (status === "active" && endDateHasPassed(c.endDate)) {
        throw new Error("End date must be in the future.");
      }
      if (status === "active" && c.status !== "active") {
        allocateCampaignFunds(s, c);
      }
      if (status === "completed" && c.status !== "completed") {
        returnUnusedCampaignFunds(s, c);
      }
      c.status = status;
      c.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: true as const };
}

const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export async function refreshCampaignEarningsAction(id: string) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === id);
  if (!campaign || (campaign.brandId !== session.id && !session.roles.includes("admin"))) {
    return { ok: false as const, error: "Campaign not found." };
  }
  if (campaign.status !== "active") {
    return { ok: false as const, error: "Only active campaigns earn. Activate it first." };
  }

  let waitMs = 0;
  await updateStore((s) => {
    const c = s.campaigns.find((x) => x.id === id);
    if (!c) return;
    const last = c.viewsRefreshedAt ? new Date(c.viewsRefreshedAt).getTime() : 0;
    waitMs = REFRESH_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) return;
    c.viewsRefreshedAt = nowIso();
  });
  if (waitMs > 0) {
    return {
      ok: false as const,
      error: `Views were refreshed recently. Try again in ${Math.ceil(waitMs / 60000)} min.`,
    };
  }

  const result = await pollSubmissionViews([id]);
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath(`/dashboard/brand/campaigns/${id}/submissions`);
  revalidatePath("/dashboard/brand/submissions");
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const, updated: result.updated, creditedCents: result.creditedCents };
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
    viewsRefreshedAt: null,
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
      if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
        throw new Error("Not allowed.");
      }
      const related = s.submissions.filter((sub) => sub.campaignId === id);
      if (related.some((sub) => sub.status === "approved" && sub.earningsCents > 0)) {
        throw new Error(
          "Cannot delete a campaign that has already paid clippers. Mark it completed instead.",
        );
      }
      if (isCampaignFunded(s, campaign.id)) {
        returnUnusedCampaignFunds(s, campaign);
      }
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
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/campaigns");
  return { ok: true as const };
}

