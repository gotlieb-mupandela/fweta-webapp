"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { uploadKycDocumentAction } from "@/app/actions/growth";
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
        const file = fd.get("idDocument");
        startTransition(async () => {
          const res = await saveKycAction({
            legalName: String(fd.get("legalName") || ""),
            idNumber: String(fd.get("idNumber") || ""),
            country: String(fd.get("country") || "NA"),
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          if (!(file instanceof File) || file.size === 0) {
            setError("Upload a photo of your ID.");
            return;
          }
          const uploadData = new FormData();
          uploadData.set("idDocument", file);
          const uploaded = await uploadKycDocumentAction(uploadData);
          if (!uploaded.ok) setError(uploaded.error);
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
      <div>
        <Label htmlFor="idDocument">ID photo</Label>
        <Input id="idDocument" name="idDocument" type="file" accept="image/png,image/jpeg,image/webp" required />
        <p className="mt-1 text-xs text-muted">PNG, JPG, or WebP. An admin reviews it before the first payout.</p>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save identity"}
      </Button>
    </form>
  );
}
