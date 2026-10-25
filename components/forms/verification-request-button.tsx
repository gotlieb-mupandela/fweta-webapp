"use client";

import { requestVerificationCodeAction } from "@/app/actions/verification";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess } from "@/components/ui/input";

export function VerificationRequestButton({ pendingAlready }: { pendingAlready: boolean }) {
  const save = useTimedSave();

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={save.pending || pendingAlready}
        onClick={() => {
          void (async () => {
            const outcome = await save.run(() => requestVerificationCodeAction());
            if (outcome.status !== "ok") return;
            if (!outcome.result.ok) {
              save.fail(outcome.result.error);
              return;
            }
            save.succeed("Bio code created.");
            save.refresh();
          })();
        }}
      >
        {save.pending ? "Creating..." : pendingAlready ? "Code already issued" : "Get a bio code"}
      </Button>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
    </div>
  );
}
