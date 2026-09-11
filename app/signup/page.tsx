import { Suspense } from "react";

import { SignupForm } from "@/components/auth/signup-form";
import { seedDemoAccounts } from "@/lib/auth/session";

export default async function SignupPage() {
  try {
    await seedDemoAccounts();
  } catch {
    // ignore seed failures — form still works for new signups
  }

  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
