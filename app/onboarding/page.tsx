import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getProfileById, getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/onboarding");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  if (!needsOnboarding(profile)) {
    redirect("/dashboard");
  }

  return <OnboardingWizard roles={profile.roles} />;
}
