import { type AllowedKind, contentTypeForKind } from "@/lib/storage/constants";

/**
 * File type comes from the first bytes. The file name and the client Content-Type are ignored.
 * SVG and HTML are never accepted.
 */
export function sniffKind(bytes: Uint8Array): AllowedKind | null {
  if (bytes.length >= 8 && isPng(bytes)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 12 && isWebp(bytes)) return "webp";
  if (bytes.length >= 5 && isPdf(bytes)) return "pdf";
  return null;
}

export function contentTypeForBytes(bytes: Uint8Array): string | null {
  const kind = sniffKind(bytes);
  return kind ? contentTypeForKind(kind) : null;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}
