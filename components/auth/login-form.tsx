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

          <div className="mt-8 rounded-2xl border border-border bg-surface-2/60 px-4 py-3 text-[11px] leading-relaxed text-muted">
            <p className="font-medium text-foreground">Demo · password123</p>
            <p className="mt-1">brand@ · creator@ · clipper@ · admin@fweta.test</p>
          </div>
        </div>
      </div>
    </div>
  );
}
