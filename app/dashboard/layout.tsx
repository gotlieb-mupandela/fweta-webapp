import { redirect } from "next/navigation";

import { AppShell } from "@/components/dashboard/app-shell";
import { getProfileById, getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (profile && needsOnboarding(profile)) {
    redirect("/onboarding");
  }

  const role =
    session.roles.includes(session.primaryRole) ? session.primaryRole : session.roles[0] ?? "clipper";

  return (
    <AppShell
      role={role}
      roles={session.roles.length ? session.roles : [role]}
      displayName={session.displayName}
    >
      {children}
    </AppShell>
  );
}
