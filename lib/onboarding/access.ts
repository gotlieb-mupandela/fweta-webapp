import type { Campaign, DatabaseStore } from "@/lib/db/types";
import { membershipFor } from "@/lib/onboarding/workspaces";

type Actor = { id: string; roles: readonly string[] };

export function canViewCampaign(store: DatabaseStore, actor: Actor, campaign: Campaign): boolean {
  if (actor.roles.includes("admin")) return true;
  if (campaign.brandId === actor.id) return true;
  return Boolean(membershipFor(store, actor.id, campaign.workspaceId));
}

export function canEditCampaign(store: DatabaseStore, actor: Actor, campaign: Campaign): boolean {
  if (actor.roles.includes("admin")) return true;
  if (campaign.brandId === actor.id) return true;
  const member = membershipFor(store, actor.id, campaign.workspaceId);
  return member?.role === "owner" || member?.role === "manager";
}

export function campaignsVisibleToBrand(
  store: DatabaseStore,
  actor: Actor,
): Campaign[] {
  if (actor.roles.includes("admin") && !actor.roles.includes("brand")) {
    return [...store.campaigns];
  }
  const profile = store.profiles.find((item) => item.id === actor.id);
  const activeId = profile?.activeWorkspaceId;
  return store.campaigns.filter((campaign) => {
    if (!canViewCampaign(store, actor, campaign)) return false;
    if (!activeId) return true;
    if (campaign.workspaceId === activeId) return true;
    if (!campaign.workspaceId && campaign.brandId === actor.id) {
      const active = (store.workspaces ?? []).find((item) => item.id === activeId);
      return active?.ownerUserId === actor.id;
    }
    return false;
  });
}
