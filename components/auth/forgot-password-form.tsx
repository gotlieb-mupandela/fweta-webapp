"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MailCheck } from "lucide-react";

import { requestPasswordResetAction } from "@/app/actions/password-reset";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

const RESEND_COOLDOWN_SEC = 60;

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function send(address: string) {
    setError(null);
    startTransition(async () => {
      const res = await requestPasswordResetAction({ email: address });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSentTo(address.trim().toLowerCase());
      setCooldown(RESEND_COOLDOWN_SEC);
    });
  }

  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="auth-card">
        <Logo size="sm" />

        {sentTo ? (
          <div aria-live="polite">
            <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft text-gold-deep">
              <MailCheck className="h-6 w-6" aria-hidden />
            </div>
            <p className="mt-5 text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">Step 2 of 3</p>
            <h1 className="mt-3 font-display text-4xl leading-none text-foreground">Check your inbox</h1>
            <p className="mt-3 text-sm text-muted">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>, we sent a
              link to reset your password. It works once and expires in 30 minutes.
            </p>
            <ol className="mt-6 space-y-2 rounded-2xl border border-border bg-surface-2/50 p-4 text-sm text-muted">
              <li>1. Open the email from fweta.</li>
              <li>2. Tap <span className="font-medium text-foreground">Reset password</span>.</li>
              <li>3. Choose a new password and sign in.</li>
            </ol>
            <p className="mt-5 text-xs text-muted">No email after a minute? Check spam or promotions.</p>
            <FieldError>{error}</FieldError>
            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="button"
                size="lg"
                variant="secondary"
                disabled={pending || cooldown > 0}
                onClick={() => send(sentTo)}
              >
                {pending ? "Sending…" : cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend link"}
              </Button>
              <button
                type="button"
                className="text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => {
                  setSentTo(null);
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">Step 1 of 3</p>
            <h1 className="mt-3 font-display text-4xl leading-none text-foreground">Forgot password?</h1>
            <p className="mt-3 text-sm text-muted">
              Enter the email you use for fweta. We will send you a link to choose a new password.
            </p>
            <form
              className="mt-7 space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                send(email);
              }}
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@brand.co"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <FieldError>{error}</FieldError>
              <Button type="submit" size="lg" disabled={pending}>
                {pending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          </>
        )}

        <p className="mt-8 border-t border-border pt-6 text-center text-sm text-muted">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
