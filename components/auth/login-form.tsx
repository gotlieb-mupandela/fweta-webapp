"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { loginAction } from "@/app/actions/auth";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const oauthError = searchParams.get("error");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="auth-shell">
      <aside className="auth-brand animate-fade-in">
        <Logo href="https://fweta.com" light size="lg" className="relative z-10" />
        <div className="relative z-10 max-w-md space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">fweta app</p>
          <h2 className="font-display text-4xl leading-tight text-white xl:text-5xl">
            Your workspace for campaigns, bookings, and payouts.
          </h2>
          <p className="text-sm leading-relaxed text-white/65">
            Sign in to manage creator commerce — budgets, submissions, escrow, and EFT withdrawals
            in one place.
          </p>
        </div>
        <p className="relative z-10 text-xs text-white/40">
          Marketing site ·{" "}
          <a href="https://fweta.com" className="text-white/70 underline-offset-2 hover:underline">
            fweta.com
          </a>
        </p>
      </aside>

      <div className="auth-panel bg-atmosphere">
        <div className="auth-card animate-soft-scale">
          <div className="mb-8 flex items-center justify-between md:hidden">
            <Logo size="sm" />
            <a href="https://fweta.com" className="text-xs text-muted">
              fweta.com
            </a>
          </div>

          <div className="mb-8 hidden items-center justify-between md:flex">
            <p className="text-sm text-muted">Welcome back</p>
            <Link href="/signup" className="text-sm font-medium text-foreground hover:text-gold">
              Create account
            </Link>
          </div>

          <h1 className="font-display text-[2.35rem] leading-none text-foreground md:text-5xl">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-muted">Access your fweta workspace.</p>
          <div className="hairline-gold my-7" />

          {oauthError ? <FieldError>{OAUTH_ERROR_MESSAGES[oauthError] ?? OAUTH_ERROR_MESSAGES["google-failed"]}</FieldError> : null}

          <a
            href={`/api/auth/google?next=${encodeURIComponent(next)}`}
            className="inline-flex h-[3.15rem] w-full items-center justify-center gap-2.5 rounded-2xl border border-border bg-white px-6 text-[15px] font-medium tracking-tight text-foreground transition duration-150 hover:border-foreground/25 hover:bg-surface active:scale-[0.99]"
          >
            <GoogleIcon />
            Continue with Google
          </a>

          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            or with email
            <span className="h-px flex-1 bg-border" />
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              startTransition(async () => {
                const res = await loginAction({
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                router.push(next);
                router.refresh();
              });
            }}
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@brand.co" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
              />
            </div>
            <FieldError>{error}</FieldError>
            <Button type="submit" size="lg" className="mt-2" disabled={pending}>
              {pending ? "Signing in…" : "Continue"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted md:hidden">
            No account?{" "}
            <Link href="/signup" className="font-medium text-foreground">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  "google-not-configured": "Google sign-in isn't set up yet. Use email + password for now.",
  "google-cancelled": "Google sign-in was cancelled. Try again when ready.",
  "google-suspended": "This account has been suspended. Contact support.",
  "google-failed": "Google sign-in failed. Check your account and try again.",
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.7 0 10.3 0 12s.5 3.3 1.4 4.7l3.8-2.3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.4 6.7l3.8 2.9c1-2.9 3.7-4.9 6.8-4.9z"
      />
    </svg>
  );
}
