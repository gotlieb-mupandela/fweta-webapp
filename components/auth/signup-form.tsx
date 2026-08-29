"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { signupAction } from "@/app/actions/auth";
import type { UserRole } from "@/types/enums";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS: { id: UserRole; label: string; hint: string }[] = [
  { id: "clipper", label: "Clipper", hint: "Earn per verified view" },
  { id: "influencer", label: "Influencer", hint: "Publish rates & get booked" },
  { id: "brand", label: "Business", hint: "Run campaigns & hire creators" },
];

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preset = searchParams.get("role");
  const initialRoles = useMemo<UserRole[]>(() => {
    if (preset === "brand") return ["brand"];
    if (preset === "creator") return ["clipper", "influencer"];
    return ["clipper"];
  }, [preset]);

  const [roles, setRoles] = useState<UserRole[]>(initialRoles);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleRole(role: UserRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  return (
    <div className="auth-shell">
      <aside className="auth-brand animate-fade-in">
        <Logo href="https://fweta.com" light size="lg" className="relative z-10" />
        <div className="relative z-10 max-w-md space-y-5">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-gold">Get started</p>
          <h2 className="font-display text-4xl leading-tight text-white xl:text-5xl">
            One account. Multiple ways to earn and grow.
          </h2>
          <p className="text-sm leading-relaxed text-white/65">
            Join as a creator, influencer, business — or all three. Switch roles anytime from
            settings.
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
            <Link href="/login" className="text-sm text-muted">
              Log in
            </Link>
          </div>

          <div className="mb-8 hidden items-center justify-between md:flex">
            <p className="text-sm text-muted">Create your workspace</p>
            <Link href="/login" className="text-sm font-medium text-foreground hover:text-gold">
              Log in
            </Link>
          </div>

          <h1 className="font-display text-[2.35rem] leading-none text-foreground md:text-5xl">
            Join fweta
          </h1>
          <p className="mt-3 text-sm text-muted">Choose how you show up on the marketplace.</p>
          <div className="hairline-gold my-7" />

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              startTransition(async () => {
                const res = await signupAction({
                  email: String(fd.get("email") || ""),
                  password: String(fd.get("password") || ""),
                  displayName: String(fd.get("displayName") || ""),
                  roles,
                });
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                router.push("/dashboard");
                router.refresh();
              });
            }}
          >
            <div>
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" required minLength={2} placeholder="Amara Nangolo" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@email.com" autoComplete="email" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label>I am joining as</Label>
              <div className="mt-2 grid gap-2">
                {ROLE_OPTIONS.map((opt) => {
                  const active = roles.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleRole(opt.id)}
                      className={cn(
                        "flex items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition",
                        active
                          ? "border-foreground bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                          : "border-border bg-surface-2/40 hover:border-border-strong",
                      )}
                    >
                      <span>
                        <span className="block text-sm font-medium">{opt.label}</span>
                        <span className="block text-xs text-muted">{opt.hint}</span>
                      </span>
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                          active ? "border-gold bg-gold text-white" : "border-border",
                        )}
                      >
                        {active ? "✓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <FieldError>{error}</FieldError>
            <Button type="submit" size="lg" className="mt-2" disabled={pending || roles.length === 0}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
