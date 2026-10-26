import type { Metadata } from "next";

import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create a Fweta account for campaigns, bookings, and payouts.",
};

// Read ?role= on the server. useSearchParams() in the client form made Next
// prerender a client-only shell, which production showed as "Loading…" or
// "Page unavailable" before a business could create an account.
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const params = await searchParams;
  return <SignupForm presetRole={params.role} />;
}
