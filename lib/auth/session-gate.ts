export function sessionGate(
  session: { credentialVersion: number },
  profile: { suspended: boolean; credentialVersion?: number } | null,
): "ok" | "suspended" | "expired" | "missing" {
  if (!profile) return "missing";
  if (profile.suspended) return "suspended";
  if ((profile.credentialVersion ?? 0) !== session.credentialVersion) return "expired";
  return "ok";
}
