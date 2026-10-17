"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveKycAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";

export function KycForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
          const res = await saveKycAction({
            legalName: String(fd.get("legalName") || ""),
            idNumber: String(fd.get("idNumber") || ""),
            country: String(fd.get("country") || "NA"),
          });
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="legalName">Legal name</Label>
        <Input id="legalName" name="legalName" required autoComplete="name" />
      </div>
      <div>
        <Label htmlFor="idNumber">ID number</Label>
        <Input id="idNumber" name="idNumber" required autoComplete="off" />
        <p className="mt-1 text-xs text-muted">Stored encrypted. It is not asked at signup.</p>
      </div>
      <div>
        <Label htmlFor="country">Country</Label>
        <Input id="country" name="country" required defaultValue="NA" maxLength={2} />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save identity"}
      </Button>
    </form>
  );
}
