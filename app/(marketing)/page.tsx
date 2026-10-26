import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: { absolute: "Fweta" },
  description: "Fweta workspace for campaigns, bookings, and payouts for African creators.",
};

/** App entry. Marketing lives on fweta.com. This product starts at auth. */
export default async function RootPage() {
  let session = null;
  try {
    session = await getSession();
  } catch {
    // ignore
  }
  redirect(session ? "/dashboard" : "/login");
}
