export function bookingBadgeTone(
  status: string,
): "neutral" | "gold" | "success" | "danger" | "muted" {
  if (status === "approved") return "success";
  if (status === "requested" || status === "accepted" || status === "in_progress") return "gold";
  if (status === "cancelled") return "danger";
  return "muted";
}
