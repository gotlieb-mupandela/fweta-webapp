"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { switchPrimaryRoleAction } from "@/app/actions/auth";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

const ROLE_LABEL: Record<UserRole, string> = {
  brand: "Brand",
  clipper: "Clipper",
  influencer: "Influencer",
  admin: "Admin",
};

export function RoleSwitcher({
  roles,
  current,
  compact = false,
}: {
  roles: UserRole[];
  current: UserRole;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (roles.length <= 1) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-xl border border-border bg-surface-2/80 font-medium capitalize text-muted",
          compact ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        )}
      >
        {ROLE_LABEL[current]}
      </span>
    );
  }

  function switchRole(next: UserRole) {
    if (next === current || pending) return;
    startTransition(async () => {
      const res = await switchPrimaryRoleAction(next);
      if (!res.ok) return;
      router.push(`/dashboard/${next}`);
      router.refresh();
    });
  }

  return (
    <div className={cn("relative", compact ? "w-full" : "w-full")}>
      <label className="sr-only" htmlFor="role-switcher">
        Switch role
      </label>
      <div className="relative">
        <select
          id="role-switcher"
          value={current}
          disabled={pending}
          onChange={(e) => switchRole(e.target.value as UserRole)}
          className={cn(
            "w-full appearance-none border border-border bg-white font-medium capitalize text-foreground outline-none transition",
            "hover:border-foreground/20 focus:border-foreground focus:ring-2 focus:ring-gold/25",
            "disabled:opacity-60",
            compact
              ? "h-10 rounded-xl pl-3 pr-9 text-xs"
              : "h-11 rounded-2xl pl-3.5 pr-10 text-sm",
          )}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <ChevronsUpDown
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
          aria-hidden
        />
      </div>
      {pending ? (
        <p className="mt-1.5 text-[11px] text-muted">Switching…</p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
          <Check className="size-3 text-gold" aria-hidden />
          Active workspace
        </p>
      )}
    </div>
  );
}
