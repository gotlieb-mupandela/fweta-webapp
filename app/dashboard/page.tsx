import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

export default async function DashboardIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const role = session.roles.includes(session.primaryRole) ? session.primaryRole : session.roles[0];
  if (!role) redirect("/dashboard/settings/roles");
  redirect(`/dashboard/${role}`);
}
