import { decryptSecret } from "@/lib/db/store";
import type { Profile } from "@/lib/db/types";
import { maskAccountNumber } from "@/lib/utils";

export function maskKyc(kyc: NonNullable<Profile["kyc"]> | null | undefined) {
  if (!kyc) return null;
  let idMasked = "****";
  try {
    idMasked = maskAccountNumber(decryptSecret(kyc.idNumberEnc));
  } catch {
    idMasked = "****";
  }
  return {
    legalName: kyc.legalName,
    country: kyc.country,
    idMasked,
    status: kyc.status ?? "pending",
    reviewNote: kyc.reviewNote ?? null,
    documentOnFile: Boolean(kyc.documentPath),
  };
}
