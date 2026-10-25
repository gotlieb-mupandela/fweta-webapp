import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Open your fweta workspace.",
};

export default async function DashboardIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(`/dashboard/${session.primaryRole}`);
}
