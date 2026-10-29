import { parseEmailScope, type EmailScope } from "@/lib/email/preferences";

type FormLike = { get(name: string): unknown };

function isFormLike(value: unknown): value is FormLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { get?: unknown }).get === "function"
  );
}

function readString(form: FormLike, name: string, max: number): string {
  let value: unknown;
  try {
    value = form.get(name);
  } catch {
    return "";
  }
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > max ? "" : trimmed;
}

const TOKEN_MAX = 2048;

/** Reads the email preference form. Malformed input gives null, never a throw. */
export function readPreferencesForm(raw: unknown): {
  token: string;
  notifyEmail: boolean;
  notifyWithdrawals: boolean;
  notifyBookings: boolean;
} | null {
  if (!isFormLike(raw)) return null;
  const token = readString(raw, "token", TOKEN_MAX);
  if (!token) return null;
  return {
    token,
    notifyEmail: readString(raw, "notifyEmail", 10) === "on",
    notifyWithdrawals: readString(raw, "notifyWithdrawals", 10) === "on",
    notifyBookings: readString(raw, "notifyBookings", 10) === "on",
  };
}

/** Reads the unsubscribe form. Malformed input gives null, never a throw. */
export function readUnsubscribeForm(raw: unknown): { token: string; scope: EmailScope } | null {
  if (!isFormLike(raw)) return null;
  const token = readString(raw, "token", TOKEN_MAX);
  const scope = parseEmailScope(readString(raw, "scope", 20));
  if (!token || !scope) return null;
  return { token, scope };
}

export function isValidTokenInput(token: unknown): token is string {
  return typeof token === "string" && token.length > 0 && token.length <= TOKEN_MAX;
}

/** A search param can arrive as a string, an array, or nothing. Returns a safe string. */
export function pageParam(value: unknown, max = TOKEN_MAX): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string") return "";
  const trimmed = first.trim();
  return trimmed.length > max ? "" : trimmed;
}
