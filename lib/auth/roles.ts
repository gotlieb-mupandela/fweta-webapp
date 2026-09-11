import type { UserRole } from "@/types/enums";

/** Clipper or influencer (or admin) can join open campaigns. */
export function canJoinCampaigns(roles: UserRole[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.includes("clipper") || roles.includes("influencer") || roles.includes("admin");
}

export function canUseInfluencerWorkspace(roles: UserRole[] | undefined): boolean {
  if (!roles?.length) return false;
  return roles.includes("influencer") || roles.includes("admin");
}
