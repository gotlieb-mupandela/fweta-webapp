import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { getProfileById, readSessionAccess } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";

export default async function OnboardingPage() {
  const access = await readSessionAccess();
  if (access.status === "suspended" || access.status === "expired") {
    redirect(`/api/auth/end-session?reason=${access.status}`);
  }
  if (access.status !== "ok") redirect("/login?next=/onboarding");
  const session = access.session;

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  if (!needsOnboarding(profile)) {
    redirect("/dashboard");
  }

  return <OnboardingWizard roles={profile.roles} />;
}
