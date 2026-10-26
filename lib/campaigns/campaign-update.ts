import { isCampaignFunded } from "@/lib/campaigns/fund";
import { newId, nowIso } from "@/lib/db/store";
import type { Campaign, DatabaseStore } from "@/lib/db/types";
import { campaignUpdateSchema, type CampaignUpdateInput } from "@/lib/validations/campaign";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import { formatMoney } from "@/lib/utils";
import type { CampaignStatus } from "@/types/enums";

export type CampaignActor = {
  id: string;
  roles: readonly string[];
};

/**
 * Status moves only along this table. completed has no exit.
 * A campaign with closedAt or settledAt is terminal before this table is checked.
 */
export const CAMPAIGN_STATUS_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  draft: ["active", "completed"],
  pending: ["active", "completed"],
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: [],
};

export const CAMPAIGN_STATUS_EDIT_ERROR = "Campaign status cannot be changed from the edit form.";
export const CAMPAIGN_MONEY_LOCK_ERROR =
  "Budget, rate, and pay model stay fixed once the campaign is funded or leaves draft.";
export const CAMPAIGN_CLOSED_STATUS_ERROR = "A closed or completed campaign cannot change status.";
export const CAMPAIGN_TRANSITION_ERROR = "That status change is not allowed.";

function assertBrandActor(actor: CampaignActor) {
  if (!actor.roles.includes("brand") && !actor.roles.includes("admin")) {
    throw new Error("Brand role required.");
  }
}

function campaignOwned(actor: CampaignActor, campaign: Campaign) {
  return campaign.brandId === actor.id || actor.roles.includes("admin");
}

function moneyFieldsLocked(store: DatabaseStore, campaign: Campaign): boolean {
  if (campaign.closedAt || campaign.settledAt) return true;
  if (campaign.status !== "draft") return true;
  return isCampaignFunded(store, campaign.id);
}

function campaignTerminal(campaign: Campaign): boolean {
  return Boolean(campaign.closedAt || campaign.settledAt || campaign.status === "completed");
}

function rawStatusAttempt(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  if (!Object.prototype.hasOwnProperty.call(raw, "status")) return false;
  return (raw as { status?: unknown }).status != null;
}

function assignDefined<K extends keyof Campaign>(campaign: Campaign, key: K, value: Campaign[K] | undefined) {
  if (value !== undefined) campaign[key] = value;
}

function assignAllowedFields(campaign: Campaign, data: CampaignUpdateInput, lockMoney: boolean) {
  assignDefined(campaign, "title", data.title);
  assignDefined(campaign, "description", data.description);
  assignDefined(campaign, "type", data.type);
  assignDefined(campaign, "category", data.category);
  assignDefined(campaign, "minPayoutCents", data.minPayoutCents);
  assignDefined(campaign, "minViews", data.minViews);
  assignDefined(campaign, "countries", data.countries);
  assignDefined(campaign, "maxPayoutPerSubmissionCents", data.maxPayoutPerSubmissionCents);
  assignDefined(campaign, "platforms", data.platforms);
  assignDefined(campaign, "requirements", data.requirements);
  assignDefined(campaign, "rules", data.rules);
  assignDefined(campaign, "captionGuide", data.captionGuide);
  assignDefined(campaign, "hashtags", data.hashtags);
  assignDefined(campaign, "requiredChecks", data.requiredChecks);
  assignDefined(campaign, "startDate", data.startDate);
  assignDefined(campaign, "endDate", data.endDate);
  if (data.assets !== undefined) {
    campaign.assets = data.assets.map((asset) => ({
      id: newId(),
      label: asset.label,
      url: asset.url,
    }));
  }
  if (lockMoney) return;
  assignDefined(campaign, "budgetTotalCents", data.budgetTotalCents);
  assignDefined(campaign, "cpmCents", data.cpmCents);
  assignDefined(campaign, "payModel", data.payModel);
}

/**
 * Edit fields the brand is allowed to change. Status is not one of them.
 * Budget, rate, and pay model stay put once the campaign leaves draft or is funded.
 * Must run inside updateStore so a refusal writes nothing.
 */
export function updateCampaignInStore(store: DatabaseStore, actor: CampaignActor, id: string, raw: unknown) {
  assertBrandActor(actor);
  if (rawStatusAttempt(raw)) throw new Error(CAMPAIGN_STATUS_EDIT_ERROR);

  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid campaign details.");

  const campaign = store.campaigns.find((row) => row.id === id);
  if (!campaign) throw new Error("Campaign not found.");
  if (!campaignOwned(actor, campaign)) throw new Error("Not allowed.");

  const data = parsed.data;
  const locked = moneyFieldsLocked(store, campaign);
  const budgetChanged = data.budgetTotalCents !== undefined && data.budgetTotalCents !== campaign.budgetTotalCents;
  const rateChanged = data.cpmCents !== undefined && data.cpmCents !== campaign.cpmCents;
  const modelChanged = data.payModel !== undefined && data.payModel !== campaign.payModel;
  const closedModelWrite = campaignTerminal(campaign) && data.payModel !== undefined;
  if (locked && (budgetChanged || rateChanged || modelChanged || closedModelWrite)) {
    throw new Error(CAMPAIGN_MONEY_LOCK_ERROR);
  }

  assignAllowedFields(campaign, data, locked);
  campaign.updatedAt = nowIso();
}

/**
 * Status changes follow CAMPAIGN_STATUS_TRANSITIONS. closedAt, settledAt, and
 * completed have no exit. Activating still debits the budget when it is not funded yet.
 * Must run inside updateStore so a refusal writes nothing.
 */
export function setCampaignStatusInStore(
  store: DatabaseStore,
  actor: CampaignActor,
  id: string,
  status: CampaignStatus,
) {
  assertBrandActor(actor);
  const campaign = store.campaigns.find((row) => row.id === id);
  if (!campaign) throw new Error("Campaign not found.");
  if (!campaignOwned(actor, campaign)) throw new Error("Not allowed.");

  if (campaignTerminal(campaign)) throw new Error(CAMPAIGN_CLOSED_STATUS_ERROR);

  const allowed = CAMPAIGN_STATUS_TRANSITIONS[campaign.status];
  if (!allowed.includes(status)) throw new Error(CAMPAIGN_TRANSITION_ERROR);

  if (status === "active" && campaign.status !== "active" && !isCampaignFunded(store, campaign.id)) {
    const wallet = store.wallets.find((row) => row.userId === campaign.brandId);
    if (!wallet || wallet.availableCents < campaign.budgetTotalCents) {
      throw new Error(
        `Insufficient wallet balance. You need ${formatMoney(campaign.budgetTotalCents)} available. Submit an EFT deposit and wait for admin confirmation, then publish.`,
      );
    }
    applyWalletDelta(store, {
      userId: campaign.brandId,
      availableDelta: -campaign.budgetTotalCents,
      type: "debit",
      reason: "Campaign budget allocated",
      referenceType: "campaign_fund",
      referenceId: campaign.id,
    });
  }

  campaign.status = status;
  campaign.updatedAt = nowIso();
}
