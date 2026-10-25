"use client";

import { useState } from "react";

import { updateRolesAction } from "@/app/actions/settings";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Label } from "@/components/ui/input";
import type { UserRole } from "@/types/enums";

const ROLES: UserRole[] = ["brand", "influencer", "clipper"];

export function RolesSettingsForm({
  roles,
  primaryRole,
}: {
  roles: UserRole[];
  primaryRole: UserRole;
}) {
  const save = useTimedSave();
  const [selected, setSelected] = useState<UserRole[]>(roles.filter((role) => ROLES.includes(role)));
  const [primary, setPrimary] = useState<UserRole>(primaryRole);

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected.length) {
          save.fail("Pick at least one role.");
          return;
        }
        const nextPrimary = selected.includes(primary) ? primary : selected[0];
        void (async () => {
          const outcome = await save.run(() =>
            updateRolesAction({
              roles: selected,
              primaryRole: nextPrimary,
            }),
          );
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            save.fail(outcome.result.error);
            return;
          }
          setSelected(outcome.result.roles.filter((role) => ROLES.includes(role)));
          setPrimary(outcome.result.primaryRole);
          save.succeed("Roles saved.");
          save.refresh();
        })();
      }}
    >
      <div>
        <Label>Roles</Label>
        <div className="mt-2 space-y-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`role-${role}`}
                checked={selected.includes(role)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, role]
                      : current.filter((item) => item !== role),
                  );
                }}
              />
              {role}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="primaryRole">Primary role</Label>
        <select
          id="primaryRole"
          name="primaryRole"
          value={primary}
          onChange={(event) => setPrimary(event.target.value as UserRole)}
          className="input-capsule w-full"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      </div>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Saving..." : "Update roles"}
      </Button>
    </form>
  );
}
