import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number, currency = "NAD") {
  const amount = (cents / 100).toFixed(2);
  if (currency === "NAD" || currency === "ZAR") {
    return `N$${amount}`;
  }
  return new Intl.NumberFormat("en-NA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-NA").format(n);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function maskAccountNumber(accountNumber: string) {
  if (accountNumber.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, accountNumber.length - 4))}${accountNumber.slice(-4)}`;
}

/** Short, readable label for a post link: host plus first path segment. The full URL stays in the href. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const first = u.pathname.split("/").filter(Boolean)[0];
    return `${u.hostname.replace(/^www\./, "")}${first ? `/${first}` : ""}`;
  } catch {
    return url.length > 32 ? `${url.slice(0, 32)}...` : url;
  }
}
