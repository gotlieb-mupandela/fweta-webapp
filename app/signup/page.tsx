import { Suspense } from "react";

import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <SignupForm />
    </Suspense>
  );
}
