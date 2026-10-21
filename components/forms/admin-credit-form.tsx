"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminCreditWalletAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";
import { formatMoney } from "@/lib/utils";

export function AdminCreditForm({
  users,
  presetUserId,
  title = "Credit wallet",
}: {
  users: { id: string; email: string; displayName?: string }[];
  presetUserId?: string;
  title?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = users.find((user) => user.id === presetUserId) ?? null;

  return (
    <form
      className="panel max-w-md space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const amount = parseFloat(String(fd.get("amount") || ""));
        if (Number.isNaN(amount) || amount <= 0) {
          setError("Enter a valid amount.");
          return;
        }
        setError(null);
        setSuccess(null);
        startTransition(async () => {
          const res = await adminCreditWalletAction(
            String(fd.get("userId") || presetUserId || ""),
            Math.round(amount * 100),
            String(fd.get("reason") || ""),
          );
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            setSuccess(
              `Credited ${formatMoney(Math.round(amount * 100))}. Available balance is now ${formatMoney(res.availableCents)}. Ledger ${res.entryId} records the credit.`,
            );
            router.refresh();
          }
        });
      }}
    >
      <h3 className="font-display text-xl">{title}</h3>
      <p className="text-sm text-muted">
        Manual EFT only. This credits the wallet and writes a ledger row with your admin email.
      </p>
      {locked ? (
        <input type="hidden" name="userId" value={locked.id} />
      ) : (
        <div>
          <Label htmlFor="userId">User</Label>
          <select id="userId" name="userId" required className="input-capsule w-full" defaultValue="">
            <option value="">Select user</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName ? `${u.displayName} (${u.email})` : u.email}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <Label htmlFor="amount">Amount (NAD)</Label>
        <Input id="amount" name="amount" type="number" step="0.01" min="0.01" required />
      </div>
      <div>
        <Label htmlFor="reason">Reason</Label>
        <Input id="reason" name="reason" placeholder="EFT reference or note" />
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Crediting…" : "Credit wallet"}
      </Button>
    </form>
  );
}
