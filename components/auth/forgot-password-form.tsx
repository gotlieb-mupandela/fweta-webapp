"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="auth-card">
        <Logo size="sm" />
        <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">Account</p>
        <h1 className="mt-3 font-display text-4xl leading-none text-foreground">Forgot password</h1>
        <p className="mt-3 text-sm text-muted">
          Enter the email on your fweta account. If it matches, we send a reset link.
        </p>
        <form
          className="mt-7 space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const email = String(new FormData(form).get("email") || "");
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const res = await requestPasswordResetAction({ email });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setMessage(res.message);
              form.reset();
            });
          }}
        >
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@brand.co" />
          </div>
          <FieldError>{error}</FieldError>
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
        <p className="mt-8 border-t border-border pt-6 text-center text-sm text-muted">
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
