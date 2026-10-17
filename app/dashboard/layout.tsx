import { redirect } from "next/navigation";

import type { Metadata } from "next";

import { AppShell } from "@/components/dashboard/app-shell";
import { sessionGate } from "@/lib/auth/session-gate";
import { getProfileById, getSession } from "@/lib/auth/session";
import { needsOnboarding } from "@/lib/onboarding/steps";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  const gate = sessionGate(session, profile);
  if (gate === "suspended" || gate === "expired") {
    redirect(`/api/auth/end-session?reason=${gate}`);
  }
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
