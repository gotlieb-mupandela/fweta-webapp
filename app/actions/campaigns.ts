"use server";

import { revalidatePath } from "next/cache";

import { getSession, requireSession } from "@/lib/auth/session";
import { isCampaignFunded } from "@/lib/campaigns/fund";
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
  return { ok: true as const, id: campaign.id };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  if (!assertBrand(session.roles)) return { ok: false as const, error: "Brand role required." };
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
      c.status = status;
      c.updatedAt = nowIso();
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Failed." };
  }
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  revalidatePath("/dashboard/brand");
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
