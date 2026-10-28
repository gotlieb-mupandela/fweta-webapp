/**
 * HTML pattern for a 6 digit branch code.
 * A JSX string turns `\d` into the letter d, so the pattern is a digit class.
 */
export const BRANCH_CODE_PATTERN = "[0-9]{6}";

export function branchCodeFieldError(value: string): string | null {
  if (/^[0-9]{6}$/.test(value)) return null;
  return "Branch code must be 6 digits.";
}
