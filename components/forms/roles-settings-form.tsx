"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateRolesAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Label } from "@/components/ui/input";
import type { UserRole } from "@/types/enums";

const ROLES: UserRole[] = ["brand", "influencer", "clipper"];

const ROLE_LABEL: Record<string, string> = {
  brand: "Brand",
  influencer: "Influencer",
  clipper: "Clipper",
  admin: "Admin",
};

export function RolesSettingsForm({
  roles,
  primaryRole,
}: {
  roles: UserRole[];
  primaryRole: UserRole;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const selected = ROLES.filter((r) => fd.get(`role-${r}`) === "on");
        const primaryRole = String(fd.get("primaryRole") || "") as UserRole;
        setSuccess(false);
        if (selected.length === 0) {
          setError("Pick at least one role.");
          return;
        }
        if (!selected.includes(primaryRole)) {
          setError("Choose a primary role you have turned on.");
          return;
        }
        setError(null);
        startTransition(async () => {
          try {
            const res = await updateRolesAction({
              roles: selected,
              primaryRole,
            });
            if (!res.ok) setError(res.error);
            else {
              setSuccess(true);
              router.refresh();
            }
          } catch {
            setError("Could not update roles. Try again.");
          }
        });
      }}
    >
      <div>
        <Label>Roles</Label>
        <div className="mt-2 space-y-2">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`role-${r}`} defaultChecked={roles.includes(r)} />
              {ROLE_LABEL[r]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="primaryRole">Primary role</Label>
        <select id="primaryRole" name="primaryRole" defaultValue={primaryRole} className="input-capsule w-full">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success ? "Roles saved." : null}</FieldSuccess>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Update roles"}
      </Button>
    </form>
  );
}
