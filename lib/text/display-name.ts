/** Strip tags and angle brackets so a name cannot render as raw markup. */
export function cleanDisplayName(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
