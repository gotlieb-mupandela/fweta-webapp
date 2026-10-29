"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, Lock, Mail } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({
  nextPath = "/dashboard",
  email = "",
  notice = null,
}: {
  nextPath?: string;
  email?: string;
  notice?: string | null;
}) {
  const router = useRouter();
  const next = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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
            Sign in to manage creator commerce: budgets, submissions, escrow, and EFT withdrawals
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
          <div className="mb-10 flex items-center justify-between min-[960px]:hidden">
            <Logo size="sm" />
            <a href="https://fweta.com" className="text-xs text-muted hover:text-foreground">
              fweta.com
            </a>
          </div>

          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">
            Welcome back
          </p>
          <h1 className="mt-3 font-display text-[2.35rem] leading-none text-foreground md:text-5xl">
            Sign in
          </h1>
          <p className="mt-3 text-sm text-muted">
            Access your fweta workspace with email and password.
          </p>
          <div className="hairline-gold my-7" />

          <form
            className="space-y-5"
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
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-light"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  defaultValue={email || undefined}
                  placeholder="you@brand.co"
                  autoComplete="email"
                  className="has-leading-icon"
                  aria-invalid={error ? true : undefined}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-gold-deep underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-light"
                  aria-hidden
                />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  autoComplete="current-password"
                  className="has-leading-icon has-trailing-action"
                  aria-invalid={error ? true : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <EyeOff className="h-[18px] w-[18px]" aria-hidden />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" aria-hidden />
                  )}
                </button>
              </div>
            </div>

            {notice && !error ? <p className="text-sm text-success">{notice}</p> : null}

            {error ? (
              <div
                role="alert"
                className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-3 text-sm text-danger"
              >
                <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" size="lg" className="group mt-1" disabled={pending}>
              {pending ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 border-t border-border pt-6 text-center text-sm text-muted">
            New to fweta?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline-offset-4 hover:text-gold-deep hover:underline"
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
