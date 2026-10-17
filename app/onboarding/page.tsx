import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import type { CampaignDefaults } from "@/components/onboarding/campaign-step";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import {
  bootstrapDraft,
  checklistItems,
  depositInstructions,
  isChecklistComplete,
  isLegacyAccount,
  isStepId,
  needsOnboarding,
  resumeStepId,
  splitCampaignRules,
  stepIdsFor,
} from "@/lib/onboarding/model";

export const metadata: Metadata = {
  title: "Setup",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");

  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === session.id);
  if (!profile) redirect("/login");
  if (profile.roles.includes("admin") && profile.roles.length === 1) redirect("/dashboard");
  if (isLegacyAccount(profile)) redirect("/dashboard");

  const stepIds = stepIdsFor(profile.roles, profile.primaryRole);
  const draft = bootstrapDraft(profile);
  const hasPayout = store.payoutMethods.some((method) => method.userId === profile.id);
  const items = checklistItems(profile, { hasPayout });
  const fullyDone = !needsOnboarding(profile) && isChecklistComplete(items);
  if (fullyDone && !params.step) redirect("/dashboard");

  const initialStepId =
    isStepId(params.step) && stepIds.includes(params.step) ? params.step : resumeStepId(stepIds, draft);

  const campaign = draft.campaignId
    ? store.campaigns.find((item) => item.id === draft.campaignId && item.brandId === profile.id)
    : undefined;
  const campaignDefaults: CampaignDefaults | null = campaign
    ? {
        title: campaign.title,
        brief: campaign.description,
        rules: splitCampaignRules(campaign.requirements),
        type: campaign.type,
        category: campaign.category,
        budgetNad: (campaign.budgetTotalCents / 100).toFixed(2),
        cpmNad: (campaign.cpmCents / 100).toFixed(2),
        maxPayoutNad: (campaign.maxPayoutPerSubmissionCents / 100).toFixed(2),
        minViews: String(draft.minViews ?? 0),
        platforms: campaign.platforms,
      }
    : null;

  return (
    <OnboardingWizard
      boot={{
        roles: profile.roles,
        primaryRole: profile.primaryRole,
        email: profile.email,
        draft,
        initialStepId,
        avatarUrl: profile.avatarUrl,
        hasPayout,
        campaignDefaults,
        deposit: depositInstructions(profile.id, {
          bankName: process.env.FWETA_DEPOSIT_BANK_NAME,
          accountName: process.env.FWETA_DEPOSIT_ACCOUNT_NAME,
          accountNumber: process.env.FWETA_DEPOSIT_ACCOUNT_NUMBER,
          branchCode: process.env.FWETA_DEPOSIT_BRANCH_CODE,
        }),
        campaigns: store.campaigns
          .filter((item) => item.status === "active")
          .map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            type: item.type,
            status: item.status,
            cpmCents: item.cpmCents,
            budgetRemainingCents: Math.max(0, item.budgetTotalCents - item.budgetSpentCents),
            platforms: item.platforms,
          })),
      }}
    />
  );
}
