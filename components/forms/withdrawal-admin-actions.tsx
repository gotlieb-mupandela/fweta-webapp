"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { markWithdrawalPaidAction, rejectWithdrawalAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function WithdrawalAdminActions({ withdrawalId }: { withdrawalId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await markWithdrawalPaidAction(
              withdrawalId,
              String(fd.get("ref") || "") || undefined,
            );
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        <div>
          <Label htmlFor={`ref-${withdrawalId}`} className="sr-only">
            Bank reference
          </Label>
          <Input
            id={`ref-${withdrawalId}`}
            name="ref"
            placeholder="EFT ref"
            className="h-9 w-32"
          />
        </div>
        <Button size="sm" variant="gold" type="submit" disabled={pending}>
          Mark paid
        </Button>
      </form>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!window.confirm("Reject this withdrawal and return funds to the creator?")) return;
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await rejectWithdrawalAction(
              withdrawalId,
              String(fd.get("note") || "") || undefined,
            );
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        <div>
          <Label htmlFor={`note-${withdrawalId}`} className="sr-only">
            Reject note
          </Label>
          <Input
            id={`note-${withdrawalId}`}
            name="note"
            placeholder="Reject reason"
            className="h-9 w-40"
          />
        </div>
        <Button size="sm" variant="danger" type="submit" disabled={pending}>
          Reject
        </Button>
      </form>
      <FieldError>{error}</FieldError>
    </div>
  );
}
