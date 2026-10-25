import type { UgcApplication, UgcBrief } from "@/lib/db/types";

/** Viewer taken from the server session. Ownership is not accepted from the client. */
export type UgcBriefViewer = {
  id: string;
  roles: readonly string[];
};

/**
 * Draft briefs are visible only to the brand that created them and to admins.
 * Paused, closed, and any other non-open status are visible to that owner, an
 * admin, or a viewer who already has an application row on the brief.
 * Open briefs stay visible. A missing id is hidden so the caller can notFound()
 * without confirming that the brief exists.
 */
export function visibleUgcBrief(
  briefs: readonly UgcBrief[],
  applications: readonly UgcApplication[],
  briefId: string,
  viewer: UgcBriefViewer,
): UgcBrief | null {
  const brief = briefs.find((item) => item.id === briefId);
  if (!brief) return null;
  if (brief.brandId === viewer.id || viewer.roles.includes("admin")) return brief;
  if (brief.status === "open") return brief;
  if (brief.status === "draft") return null;
  // Withdrawn and declined rows still count: the viewer already has a record on this brief.
  const hasApplication = applications.some(
    (item) => item.briefId === brief.id && item.creatorId === viewer.id,
  );
  return hasApplication ? brief : null;
}

/**
 * Brand management page. Uses visibleUgcBrief, then keeps the page to the
 * owning brand or an admin. Another brand does not see it, including an open
 * brief that creators can browse. canManage is only the owning brand: pause,
 * invite, accept, revision, approval, and dispute all require that brand id.
 */
export function brandUgcDetailAccess(
  briefs: readonly UgcBrief[],
  applications: readonly UgcApplication[],
  briefId: string,
  viewer: UgcBriefViewer,
): { brief: UgcBrief; canManage: boolean } | null {
  const brief = visibleUgcBrief(briefs, applications, briefId, viewer);
  if (!brief) return null;
  if (brief.brandId !== viewer.id && !viewer.roles.includes("admin")) return null;
  return { brief, canManage: brief.brandId === viewer.id };
}
