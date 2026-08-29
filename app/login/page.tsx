import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { seedDemoAccounts } from "@/lib/auth/session";

export default async function LoginPage() {
  try {
    await seedDemoAccounts();
  } catch {
    // ignore seed failures — form still works for new signups
  }

  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
