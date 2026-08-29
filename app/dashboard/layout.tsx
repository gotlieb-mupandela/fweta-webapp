import { redirect } from "next/navigation";

import { AppShell } from "@/components/dashboard/app-shell";
import { getSession, seedDemoAccounts } from "@/lib/auth/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await seedDemoAccounts();
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <AppShell
      role={session.primaryRole}
      roles={session.roles}
      displayName={session.displayName}
    >
      {children}
    </AppShell>
  );
}
