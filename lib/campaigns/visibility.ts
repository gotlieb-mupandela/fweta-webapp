import type { CampaignStatus } from "@/types/enums";

export function campaignClipperVisibility(status: CampaignStatus): {
  visible: boolean;
  label: string;
  detail: string;
} {
  if (status === "active") {
    return {
      visible: true,
      label: "Visible to clippers",
      detail: "Clippers can see this campaign in their campaign list and on the public campaigns page.",
    };
  }
  if (status === "paused") {
    return {
      visible: false,
      label: "Hidden from clippers",
      detail:
        "Paused campaigns are hidden. Publish again to show it. Publishing uses the budget already set aside. There is no admin approval step.",
    };
  }
  if (status === "pending") {
    return {
      visible: false,
      label: "Hidden from clippers",
      detail:
        "Pending is not an approval queue. Clippers only see published campaigns. Fund the budget from your wallet, then publish.",
    };
  }
  if (status === "completed") {
    return {
      visible: false,
      label: "Hidden from clippers",
      detail: "Completed campaigns are closed and do not appear in the clipper list.",
    };
  }
  return {
    visible: false,
    label: "Hidden from clippers",
    detail:
      "Drafts stay on your account until you publish. Publishing moves the full budget from your wallet into the campaign. There is no admin approval step.",
  };
}
