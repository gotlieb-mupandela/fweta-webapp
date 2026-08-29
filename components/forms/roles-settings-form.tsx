"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateRolesAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/input";
import type { UserRole } from "@/types/enums";

const ROLES: UserRole[] = ["brand", "influencer", "clipper"];

export function RolesSettingsForm({
  roles,
  primaryRole,
}: {
  roles: UserRole[];
  primaryRole: UserRole;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const selected = ROLES.filter((r) => fd.get(`role-${r}`) === "on");
        setError(null);
        startTransition(async () => {
          const res = await updateRolesAction({
            roles: selected,
            primaryRole: String(fd.get("primaryRole") || selected[0]) as UserRole,
          });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label>Roles</Label>
        <div className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`role-${r}`} defaultChecked={roles.includes(r)} />
              {r}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="primaryRole">Primary role</Label>
        <select id="primaryRole" name="primaryRole" defaultValue={primaryRole} className="input-capsule w-full">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update roles"}
      </Button>
    </form>
  );
}
