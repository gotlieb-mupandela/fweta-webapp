import { Suspense } from "react";

import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { ProductTour } from "@/components/onboarding/tour";
import { readStore } from "@/lib/db/store";
import {
  checklistItems,
  completionPercent,
  isBrandRole,
  isCreatorRole,
  shouldOfferProductTour,
  shouldShowChecklist,
} from "@/lib/onboarding/model";
import type { UserRole } from "@/types/enums";

export async function DashboardOnboarding({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  const store = await readStore();
  const profile = store.profiles.find((item) => item.id === userId);
  if (!profile) return null;

  const hasPayout = store.payoutMethods.some((method) => method.userId === userId);
  const items = checklistItems(profile, { hasPayout });
  const showChecklist = shouldShowChecklist(profile, { hasPayout });
  const replayHref = `/dashboard/${role}?tour=1`;

  return (
    <>
      {showChecklist ? (
        <OnboardingChecklist items={items} percent={completionPercent(items)} replayHref={replayHref} />
      ) : null}
      <Suspense fallback={null}>
        <ProductTour
          role={role}
          creator={isCreatorRole(profile.roles)}
          brand={isBrandRole(profile.roles)}
          enabled={shouldOfferProductTour(profile)}
        />
      </Suspense>
    </>
  );
}
