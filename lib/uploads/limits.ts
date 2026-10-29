/** Shared upload limits. Copy and browser checks use these same numbers. */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const ID_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isAllowedImageType(type: string): boolean {
  return IMAGE_TYPES.has(type);
}

/** Null when the file is within the limit. */
export function uploadLimitMessage(file: { size: number }, maxBytes: number, noun: string): string | null {
  if (file.size > maxBytes) {
    const mb = maxBytes / (1024 * 1024);
    return `${noun} must be ${mb} MB or smaller.`;
  }
  return null;
}
