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
