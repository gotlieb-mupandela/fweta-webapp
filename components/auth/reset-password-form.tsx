"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resetPasswordAction } from "@/app/actions/password-reset";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : "This reset link is invalid or has expired. Request a new one.");
  const [pending, startTransition] = useTransition();

  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="auth-card">
        <Logo size="sm" />
        <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">Account</p>
        <h1 className="mt-3 font-display text-4xl leading-none text-foreground">Reset password</h1>
        <p className="mt-3 text-sm text-muted">Choose a new password of at least 8 characters.</p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setError(null);
            startTransition(async () => {
              const res = await resetPasswordAction({
                token,
                password: String(data.get("password") || ""),
                confirmPassword: String(data.get("confirmPassword") || ""),
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              form.reset();
              router.push("/login?reset=1");
            });
          }}
        >
          <div>
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" disabled={pending || !token}>
            {pending ? "Saving…" : "Update password"}
          </Button>
        </form>
        <p className="mt-8 border-t border-border pt-6 text-center text-sm text-muted">
          <Link href="/forgot-password" className="font-medium text-foreground underline-offset-4 hover:underline">
            Request a new link
          </Link>
        </p>
      </div>
    </div>
  );
}
