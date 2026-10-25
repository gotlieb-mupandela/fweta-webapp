"use client";

import { useState } from "react";

import { uploadKycDocumentAction } from "@/app/actions/growth";
import { saveKycAction } from "@/app/actions/wallet";
import { useTimedSave } from "@/components/forms/use-timed-save";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label } from "@/components/ui/input";
import { kycSchema } from "@/lib/validations/withdrawal";

export function KycForm() {
  const save = useTimedSave();
  const [legalName, setLegalName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [country, setCountry] = useState("NA");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <form
      className="max-w-md space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = kycSchema.safeParse({ legalName, idNumber, country });
        if (!parsed.success) {
          setFileError(null);
          save.fail(parsed.error.issues[0]?.message ?? "Check the identity details.");
          return;
        }
        if (!file || file.size === 0) {
          setFileError("Upload a photo of your ID.");
          save.fail("Check the highlighted fields.");
          return;
        }
        setFileError(null);
        void (async () => {
          const outcome = await save.run(async () => {
            const res = await saveKycAction(parsed.data);
            if (!res.ok) return res;
            const uploadData = new FormData();
            uploadData.set("idDocument", file);
            const uploaded = await uploadKycDocumentAction(uploadData);
            return uploaded;
          });
          if (outcome.status !== "ok") return;
          if (!outcome.result.ok) {
            save.fail(outcome.result.error);
            return;
          }
          save.succeed("Identity submitted. An admin verifies it before the first payout.");
          save.refresh();
        })();
      }}
    >
      <div>
        <Label htmlFor="legalName">Legal name</Label>
        <Input
          id="legalName"
          name="legalName"
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
          required
          autoComplete="name"
        />
      </div>
      <div>
        <Label htmlFor="idNumber">ID number</Label>
        <Input
          id="idNumber"
          name="idNumber"
          value={idNumber}
          onChange={(event) => setIdNumber(event.target.value)}
          required
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-muted">Stored encrypted. It is not asked at signup.</p>
      </div>
      <div>
        <Label htmlFor="country">Country</Label>
        <Input
          id="country"
          name="country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          required
          maxLength={2}
        />
      </div>
      <div>
        <Label htmlFor="idDocument">ID photo</Label>
        <Input
          id="idDocument"
          name="idDocument"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          aria-invalid={fileError ? true : undefined}
          aria-describedby={fileError ? "idDocument-error" : undefined}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            setFileError(null);
          }}
        />
        <FieldError id="idDocument-error">{fileError}</FieldError>
        <p className="mt-1 text-xs text-muted">PNG, JPG, or WebP. An admin reviews it before the first payout.</p>
      </div>
      <FieldError>{save.error}</FieldError>
      <FieldSuccess>{save.success}</FieldSuccess>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Saving..." : "Save identity"}
      </Button>
    </form>
  );
}
