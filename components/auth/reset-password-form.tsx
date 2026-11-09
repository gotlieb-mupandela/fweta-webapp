"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Check, CircleCheck, Eye, EyeOff, LinkIcon } from "lucide-react";

import { resetPasswordAction } from "@/app/actions/password-reset";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const INVALID_LINK = "This reset link is invalid or has expired. Request a new one.";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          required
          minLength={8}
          maxLength={72}
          autoFocus={autoFocus}
          autoComplete="new-password"
          className="pr-12"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-foreground"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-2 text-sm transition-colors", ok ? "text-success" : "text-muted")}>
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border",
          ok ? "border-success bg-success text-white" : "border-border",
        )}
      >
        {ok ? <Check className="h-3 w-3" aria-hidden /> : null}
      </span>
      {children}
    </li>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkDead, setLinkDead] = useState(!token);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const longEnough = password.length >= 8 && password.length <= 72;
  const mixed = /[a-zA-Z]/.test(password) && /[^a-zA-Z]/.test(password);
  const matches = password.length > 0 && password === confirm;
  const ready = longEnough && matches;

  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => router.push("/login?reset=1"), 2500);
    return () => clearTimeout(id);
  }, [done, router]);

  if (linkDead) {
    return (
      <Shell>
        <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">
          <LinkIcon className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-5 font-display text-4xl leading-none text-foreground">Link expired</h1>
        <p className="mt-3 text-sm text-muted">
          {INVALID_LINK.replace(" Request a new one.", "")} Reset links work once and last 30 minutes.
        </p>
        <Link
          href="/forgot-password"
          className="mt-7 flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-white hover:bg-black"
        >
          Send a new link
        </Link>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div aria-live="polite">
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft text-gold-deep">
            <CircleCheck className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-5 font-display text-4xl leading-none text-foreground">Password updated</h1>
          <p className="mt-3 text-sm text-muted">
            You are all set. Every other session was signed out, and we emailed you a confirmation. Taking you to sign
            in…
          </p>
          <Link
            href="/login?reset=1"
            className="mt-7 flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-white hover:bg-black"
          >
            Sign in now
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-gold-deep">Step 3 of 3</p>
      <h1 className="mt-3 font-display text-4xl leading-none text-foreground">Choose a new password</h1>
      <p className="mt-3 text-sm text-muted">Pick something you haven&apos;t used on fweta before.</p>
      <form
        className="mt-7 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          setError(null);
          startTransition(async () => {
            const res = await resetPasswordAction({ token, password, confirmPassword: confirm });
            if (!res.ok) {
              if (res.error === INVALID_LINK) setLinkDead(true);
              else setError(res.error);
              return;
            }
            setPassword("");
            setConfirm("");
            setDone(true);
          });
        }}
      >
        <PasswordField id="password" label="New password" value={password} onChange={setPassword} autoFocus />
        <PasswordField id="confirmPassword" label="Confirm new password" value={confirm} onChange={setConfirm} />
        <ul className="space-y-1.5" aria-label="Password requirements">
          <Rule ok={longEnough}>8 to 72 characters</Rule>
          <Rule ok={mixed}>Letters plus a number or symbol (recommended)</Rule>
          <Rule ok={matches}>Both passwords match</Rule>
        </ul>
        <FieldError>{error}</FieldError>
        <Button type="submit" size="lg" disabled={pending || !ready}>
          {pending ? "Saving…" : "Update password"}
        </Button>
      </form>
      <p className="mt-8 border-t border-border pt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="auth-card">
        <Logo size="sm" />
        {children}
      </div>
    </div>
  );
}
