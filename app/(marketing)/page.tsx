import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

/** App entry — marketing lives on fweta.com; this product starts at auth. */
export default async function RootPage() {
  let session = null;
  try {
    session = await getSession();
  } catch {
    // ignore
  }
  redirect(session ? "/dashboard" : "/login");
}
