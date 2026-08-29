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
    <div className="bg-atmosphere flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md animate-soft-scale">
        <div className="mb-10 flex items-center justify-between">
          <Logo />
          <Link href="/signup" className="text-sm text-muted hover:text-foreground">
            Create account
          </Link>
        </div>

        <h1 className="font-display text-4xl text-foreground">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Log in to manage campaigns, bookings, and payouts.</p>

        <form
          className="mt-8 space-y-4"
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
            <Input id="email" name="email" type="email" required placeholder="you@brand.co" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Signing in…" : "Log in"}
          </Button>
        </form>

        <div className="mt-8 rounded-3xl border border-border bg-white/80 p-4 text-xs text-muted">
          <p className="font-medium text-foreground">Demo accounts (password: password123)</p>
          <ul className="mt-2 space-y-1">
            <li>brand@fweta.test</li>
            <li>creator@fweta.test (influencer + clipper)</li>
            <li>clipper@fweta.test</li>
            <li>admin@fweta.test</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
