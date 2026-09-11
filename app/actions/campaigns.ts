"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import {
  isCampaignFunded,
  leftoverCampaignBudgetCents,
  refundUnusedCampaignBudget,
} from "@/lib/campaigns/fund";
import { newId, nowIso, readStore, updateStore } from "@/lib/db/store";
import type { Campaign } from "@/lib/db/types";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { formatMoney } from "@/lib/utils";
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
  const store = await readStore();
  return store.campaigns.find((c) => c.id === id) ?? null;
}

export async function createCampaignAction(raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
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

  // Atomic: create + fund in one write so a crash can't leave an
  // unfunded "active" campaign or orphan a wallet debit.
  try {
    await updateStore((s) => {
      s.campaigns.push(campaign);
      if (campaign.status === "active" && !isCampaignFunded(s, campaign.id)) {
        const wallet = s.wallets.find((w) => w.userId === session.id);
        if (!wallet || wallet.availableCents < campaign.budgetTotalCents) {
          throw new Error(
            `Insufficient wallet balance. You need ${formatMoney(campaign.budgetTotalCents)} available — record a deposit first.`,
          );
        }
        applyWalletDelta(s, {
          userId: session.id,
          availableDelta: -campaign.budgetTotalCents,
          type: "debit",
          reason: "Campaign budget allocated",
          referenceType: "campaign_fund",
          referenceId: campaign.id,
        });
      }
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not fund campaign." };
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/analytics");
  revalidatePath("/dashboard/settings/wallet");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/campaigns");
  return { ok: true as const, id: campaign.id };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid campaign details." };

  try {
    await updateStore((s) => {
      const c = s.campaigns.find((x) => x.id === id);
      if (!c) throw new Error("Campaign not found.");
      if (c.brandId !== session.id && !session.roles.includes("admin")) {
        throw new Error("Not allowed.");
      }
      if (c.status === "completed" || c.status === "cancelled") {
        const nextBudget = parsed.data.budgetTotalCents;
        const nextCpm = parsed.data.cpmCents;
        const nextMax = parsed.data.maxPayoutPerSubmissionCents;
        if (
          (nextBudget !== undefined && nextBudget !== c.budgetTotalCents) ||
          (nextCpm !== undefined && nextCpm !== c.cpmCents) ||
          (nextMax !== undefined && nextMax !== c.maxPayoutPerSubmissionCents) ||
          (parsed.data.status !== undefined && parsed.data.status !== c.status)
        ) {
          throw new Error("Money and status fields are locked after a campaign ends.");
        }
      }

      const nextBudget = parsed.data.budgetTotalCents;
      if (
        nextBudget !== undefined &&
        nextBudget !== c.budgetTotalCents &&
        isCampaignFunded(s, c.id)
      ) {
        if (nextBudget < c.budgetSpentCents) {
          throw new Error(
            `Budget cannot be below amount already spent (${formatMoney(c.budgetSpentCents)}).`,
          );
        }
        const delta = nextBudget - c.budgetTotalCents;
        if (delta > 0) {
          applyWalletDelta(s, {
            userId: c.brandId,
            availableDelta: -delta,
            type: "debit",
            reason: "Campaign budget increased",
            referenceType: "campaign_fund",
            referenceId: c.id,
          });
        } else if (delta < 0) {
          applyWalletDelta(s, {
            userId: c.brandId,
            availableDelta: -delta,
            type: "credit",
            reason: "Campaign budget decreased — unused funds returned",
            referenceType: "campaign_refund",
            referenceId: c.id,
          });
        }
      }

      Object.assign(c, parsed.data, { updatedAt: nowIso() });
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not update campaign." };
  }
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
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
      if (
        (c.status === "completed" || c.status === "cancelled") &&
        (status === "active" || status === "paused" || status === "draft" || status === "pending")
      ) {
        throw new Error("Ended campaigns can’t be reactivated. Duplicate it to launch again.");
      }
      // Atomic fund + activate: previously two writes, so a crash could
      // debit the wallet without flipping status (or vice versa).
      if (status === "active" && c.status !== "active" && !isCampaignFunded(s, c.id)) {
        const wallet = s.wallets.find((w) => w.userId === c.brandId);
        if (!wallet || wallet.availableCents < c.budgetTotalCents) {
          throw new Error(
            `Insufficient wallet balance. You need ${formatMoney(c.budgetTotalCents)} available — record a deposit first.`,
          );
        }
        applyWalletDelta(s, {
          userId: c.brandId,
          availableDelta: -c.budgetTotalCents,
          type: "debit",
          reason: "Campaign budget allocated",
          referenceType: "campaign_fund",
          referenceId: c.id,
        });
      }
      if (status === "completed" || status === "cancelled") {
        refundUnusedCampaignBudget(s, c);
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

export async function deleteCampaignAction(id: string) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };

  try {
    await updateStore((s) => {
      const index = s.campaigns.findIndex((x) => x.id === id);
      if (index < 0) throw new Error("Campaign not found.");
      const campaign = s.campaigns[index];
      if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
        throw new Error("Not allowed.");
      }
      const related = s.submissions.filter((sub) => sub.campaignId === campaign.id);
      if (related.some((sub) => sub.status === "approved" && sub.earningsCents > 0)) {
        throw new Error(
          "Cannot delete a campaign that has already paid clippers. Cancel or mark it completed instead.",
        );
      }
      refundUnusedCampaignBudget(s, campaign);
      const submissionIds = new Set(related.map((sub) => sub.id));
      for (const flag of s.fraudFlags) {
        if (!submissionIds.has(flag.submissionId)) continue;
        const sub = related.find((x) => x.id === flag.submissionId);
        if (!sub) continue;
        const clipper = s.profiles.find((p) => p.id === sub.clipperId);
        flag.clipperName ??= clipper?.displayName || clipper?.email || "Unknown clipper";
        flag.campaignTitle ??= campaign.title;
        flag.postUrl ??= sub.postUrl;
      }
      s.submissions = s.submissions.filter((sub) => sub.campaignId !== campaign.id);
      s.viewSnapshots = s.viewSnapshots.filter((snap) => !submissionIds.has(snap.submissionId));
      s.campaigns.splice(index, 1);
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Could not delete campaign." };
  }

  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
  revalidatePath("/dashboard/brand/analytics");
  revalidatePath("/dashboard/clipper/campaigns");
  revalidatePath("/dashboard/clipper/submissions");
  revalidatePath("/dashboard/admin/fraud");
  revalidatePath("/dashboard/admin");
  revalidatePath("/campaigns");
  return { ok: true as const };
}

export async function cancelCampaignAction(id: string) {
  return setCampaignStatusAction(id, "cancelled");
}

export async function getCampaignBudgetSummary(id: string) {
  const session = await requireSession();
  const store = await readStore();
  const campaign = store.campaigns.find((c) => c.id === id);
  if (!campaign) return null;
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) return null;
  const related = store.submissions.filter((s) => s.campaignId === id);
  return {
    funded: isCampaignFunded(store, campaign.id),
    leftoverCents: leftoverCampaignBudgetCents(store, campaign),
    submissionCount: related.length,
    paidSubmissionCount: related.filter((s) => s.status === "approved" && s.earningsCents > 0)
      .length,
  };
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
