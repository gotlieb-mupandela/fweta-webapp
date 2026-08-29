import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
