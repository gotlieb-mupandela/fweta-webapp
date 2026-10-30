const SUPPORT_TIME_ZONE = "Africa/Windhoek";

/** Support timestamps in Windhoek time, with the zone name in the string. */
export function formatSupportTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: SUPPORT_TIME_ZONE,
    timeZoneName: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const SUPPORT_TIME_ZONE_LABEL = "Central Africa Time (Windhoek, UTC+2)";

/** The app's display time zone. Server renders run in UTC on Vercel, so always pass it. */
export const APP_TIME_ZONE = "Africa/Windhoek";

/** Date and time in Windhoek time, with the zone name. */
export function formatAppDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-NA", {
    timeZone: APP_TIME_ZONE,
    timeZoneName: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Calendar date in Windhoek time. */
export function formatAppDate(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-NA", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short", year: "numeric" }).format(date);
}
