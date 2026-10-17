"use client";

import { SocialAccountsManager } from "@/components/onboarding/social-accounts";
import type { OnboardingDraft, SocialAccount } from "@/lib/db/types";

export function SocialStep({
  accounts,
  onDraft,
}: {
  draft: OnboardingDraft;
  accounts: SocialAccount[];
  onDraft: (draft: OnboardingDraft) => void;
}) {
  return <SocialAccountsManager initialAccounts={accounts} onDraft={onDraft} />;
}
