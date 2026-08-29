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
    <div className="bg-atmosphere flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-md animate-soft-scale">
        <div className="mb-10 flex items-center justify-between">
          <Logo />
          <Link href="/login" className="text-sm text-muted hover:text-foreground">
            Log in
          </Link>
        </div>

        <h1 className="font-display text-4xl text-foreground">Join fweta</h1>
        <p className="mt-2 text-sm text-muted">One account. Choose how you show up on the marketplace.</p>

        <form
          className="mt-8 space-y-4"
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
            <Input id="email" name="email" type="email" required placeholder="you@email.com" />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
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
                      "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                      active ? "border-foreground bg-white" : "border-border bg-white/60",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium">{opt.label}</span>
                      <span className="block text-xs text-muted">{opt.hint}</span>
                    </span>
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-full border",
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
          <Button type="submit" size="lg" disabled={pending || roles.length === 0}>
            {pending ? "Creating…" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}
