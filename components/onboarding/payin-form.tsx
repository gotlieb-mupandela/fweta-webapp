"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmPayInAction, requestPayInAction } from "@/app/actions/payin";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Textarea } from "@/components/ui/input";

export function PayInRequestForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const fd = new FormData(form);
        const amount = parseFloat(String(fd.get("amount") || ""));
        if (Number.isNaN(amount) || amount <= 0) {
          setError("Enter a valid amount.");
          return;
        }
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const res = await requestPayInAction(Math.round(amount * 100), String(fd.get("note") || "") || undefined);
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            setSuccess("Request saved. An admin confirms the transfer before the wallet is credited.");
            router.refresh();
          }
        });
      }}
    >
      <div>
        <Label htmlFor="amount">Amount (NAD)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required placeholder="1000.00" />
      </div>
      <div>
        <Label htmlFor="note">EFT reference (optional)</Label>
        <Textarea id="note" name="note" placeholder="The reference you put on the transfer" />
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending..." : "Request confirmation"}
      </Button>
    </form>
  );
}

export function ConfirmPayInButton({ depositId }: { depositId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await confirmPayInAction(depositId);
            if (!res.ok) setError(res.error);
            else router.refresh();
          });
        }}
      >
        {pending ? "Confirming..." : "Confirm transfer"}
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
