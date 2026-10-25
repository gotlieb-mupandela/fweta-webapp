"use client";

import { changePasswordAction } from "@/app/actions/settings";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";

export function PasswordChangeForm() {
  const save = useTimedSave();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        void (async () => {
          const outcome = await save.run(() =>
            changePasswordAction({
              currentPassword: String(fd.get("currentPassword") || ""),
              newPassword: String(fd.get("newPassword") || ""),
              confirmPassword: String(fd.get("confirmPassword") || ""),
            }),
          );
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            save.fail(outcome.result.error);
            return;
          }
          form.reset();
          save.succeed("Password updated.");
        })();
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
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Updating..." : "Change password"}
      </Button>
    </form>
  );
}
