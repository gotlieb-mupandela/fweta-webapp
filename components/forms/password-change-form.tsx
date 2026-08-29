"use client";

import { useState, useTransition } from "react";

import { changePasswordAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function PasswordChangeForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSuccess(false);
        startTransition(async () => {
          const res = await changePasswordAction({
            currentPassword: String(fd.get("currentPassword") || ""),
            newPassword: String(fd.get("newPassword") || ""),
            confirmPassword: String(fd.get("confirmPassword") || ""),
          });
          if (!res.ok) setError(res.error);
          else {
            setSuccess(true);
            e.currentTarget.reset();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="currentPassword">Current password</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required minLength={8} />
      </div>
      <div>
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={8} />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={8} />
      </div>
      <FieldError>{error}</FieldError>
      {success ? <p className="text-sm text-success">Password updated.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating…" : "Change password"}
      </Button>
    </form>
  );
}
