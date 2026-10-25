/** Advertised file limits. Binary megabytes, matching the screens. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
export const KYC_MAX_BYTES = 4 * 1024 * 1024;
export const UGC_MAX_BYTES = 40 * 1024 * 1024;

/**
 * Server Actions carry files up to the KYC limit.
 * Larger UGC files go straight to storage with a signed upload URL.
 * Multipart framing needs a little room above 4 MB, configured on the server action body limit.
 */
export const SERVER_ACTION_FILE_MAX = KYC_MAX_BYTES;

export const MEDIA_BUCKET = "fweta-media";
export const KYC_BUCKET = "fweta-kyc";

export type StorageBucket = typeof MEDIA_BUCKET | typeof KYC_BUCKET;
export type UploadPurpose = "avatar" | "screenshot" | "kyc" | "ugc";
export type AllowedKind = "png" | "jpg" | "webp" | "pdf";

/** Upload links last a few minutes. */
export const UPLOAD_TTL_MS = 5 * 60 * 1000;
export const UPLOAD_TTL_SECONDS = 5 * 60;

/**
 * Provider signed upload tokens can last about 2 hours when the sign route
 * ignores expiresIn. Keep a spent or expired grant for that lifetime plus a
 * margin so housekeeping can still delete an object written with the same URL.
 */
export const SIGNED_UPLOAD_RETENTION_MS = 2 * 60 * 60 * 1000 + 30 * 60 * 1000;

/** Staged upload grants one user may create in an hour. */
export const UPLOAD_GRANTS_PER_HOUR = 30;

/** Staged upload grants one user may create on one brief in an hour. */
export const UPLOAD_GRANTS_PER_BRIEF_PER_HOUR = 12;

export const UPLOAD_RATE_LIMIT_ERROR = "You have uploaded too many files this hour. Try again later.";
export const BRIEF_UPLOAD_RATE_LIMIT_ERROR = "This brief already has too many uploads this hour. Try again later.";

/** Signed read links. KYC is shorter than the general bucket. */
export const GENERAL_READ_TTL_SECONDS = 5 * 60;
export const KYC_READ_TTL_SECONDS = 60;

export const STORAGE_NOT_READY_ERROR =
  "Uploads are not available yet. Storage still needs to be set up. Please try again later.";

export const UPLOAD_FAILED_ERROR = "Upload failed. Check the file type and size, then try again.";

export function limitFor(purpose: UploadPurpose): number {
  if (purpose === "avatar") return AVATAR_MAX_BYTES;
  if (purpose === "screenshot") return SCREENSHOT_MAX_BYTES;
  if (purpose === "kyc") return KYC_MAX_BYTES;
  return UGC_MAX_BYTES;
}

export function bucketFor(purpose: UploadPurpose): StorageBucket {
  return purpose === "kyc" ? KYC_BUCKET : MEDIA_BUCKET;
}

export function readTtlSeconds(bucket: StorageBucket): number {
  return bucket === KYC_BUCKET ? KYC_READ_TTL_SECONDS : GENERAL_READ_TTL_SECONDS;
}

export function withinLimit(purpose: UploadPurpose, size: number): boolean {
  return size > 0 && size <= limitFor(purpose);
}

export function emptyFileMessage(purpose: UploadPurpose): string {
  if (purpose === "avatar") return "Choose an image to upload.";
  if (purpose === "screenshot") return "That screenshot is empty.";
  if (purpose === "kyc") return "That ID photo is empty.";
  return "That file is empty.";
}

export function oversizeMessage(purpose: UploadPurpose): string {
  if (purpose === "avatar") return "Image must be 2MB or smaller.";
  if (purpose === "screenshot") return "Screenshot must be 2 MB or smaller.";
  if (purpose === "kyc") return "ID photo must be 4 MB or smaller.";
  return "Each file must be 40 MB or smaller.";
}

export function typeMessage(purpose: UploadPurpose): string {
  if (purpose === "avatar") return "Use a JPEG, PNG, or WebP image.";
  if (purpose === "screenshot") return "Use a PNG, JPG, or WebP screenshot.";
  if (purpose === "kyc") return "Use a PNG, JPG, WebP, or PDF file.";
  return "Use a PNG, JPG, WebP, or PDF file.";
}

export function purposeAllows(purpose: UploadPurpose, kind: AllowedKind): boolean {
  if (kind === "pdf") return purpose === "kyc" || purpose === "ugc";
  return kind === "png" || kind === "jpg" || kind === "webp";
}

export function extensionForKind(kind: AllowedKind): "png" | "jpg" | "webp" | "pdf" {
  return kind;
}

export function contentTypeForKind(kind: AllowedKind): string {
  if (kind === "png") return "image/png";
  if (kind === "jpg") return "image/jpeg";
  if (kind === "webp") return "image/webp";
  return "application/pdf";
}

/**
 * Never pass a storage provider message through to the screen.
 * A missing bucket is the live failure mode and must stay friendly.
 */
export function friendlyStorageError(raw: string): string {
  if (raw === STORAGE_NOT_READY_ERROR) return raw;
  if (/bucket not found/i.test(raw) || /\bbucket\b/i.test(raw) || /not configured/i.test(raw)) {
    return STORAGE_NOT_READY_ERROR;
  }
  return UPLOAD_FAILED_ERROR;
}
