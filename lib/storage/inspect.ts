import {
  type AllowedKind,
  type UploadPurpose,
  emptyFileMessage,
  limitFor,
  oversizeMessage,
  purposeAllows,
  typeMessage,
} from "@/lib/storage/constants";
import { sniffKind } from "@/lib/storage/sniff";

export async function inspectFile(
  file: File,
  purpose: UploadPurpose,
): Promise<{ bytes: Uint8Array; kind: AllowedKind }> {
  const max = limitFor(purpose);
  if (file.size <= 0) throw new Error(emptyFileMessage(purpose));
  if (file.size > max) throw new Error(oversizeMessage(purpose));
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength <= 0) throw new Error(emptyFileMessage(purpose));
  if (bytes.byteLength > max) throw new Error(oversizeMessage(purpose));
  const kind = sniffKind(bytes);
  if (!kind || !purposeAllows(purpose, kind)) throw new Error(typeMessage(purpose));
  return { bytes, kind };
}
