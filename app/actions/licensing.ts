"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import type { SocialPlatform } from "@/types/enums";
import {
  applyToBrief,
  approveDelivery,
  closeBrief,
  createBrief,
  decideApplication,
  declineDelivery,
  inviteCreator,
  openDraftBrief,
  openLicenseDispute,
  requestRevision,
  resolveLicenseDispute,
  savePortfolio,
  setBriefPaused,
  submitDelivery,
  type CreateBriefInput,
} from "@/lib/licensing/hub";
import { pushNotification } from "@/lib/notifications/inbox";
import { saveUgcFile } from "@/lib/ugc/files";

function clock() {
  return { id: () => newId(), now: () => nowIso() };
}

function fail(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Something went wrong." };
}

function revalidateLicensing(briefId?: string) {
  revalidatePath("/dashboard/brand/ugc");
  revalidatePath("/dashboard/ugc");
  revalidatePath("/dashboard/clipper/earnings");
  revalidatePath("/dashboard/influencer/earnings");
  revalidatePath("/dashboard/admin/licenses");
  revalidatePath("/dashboard/admin/disputes");
  if (briefId) {
    revalidatePath(`/dashboard/brand/ugc/${briefId}`);
    revalidatePath(`/dashboard/ugc/${briefId}`);
  }
}

const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "youtube", "x"];

function centsFromNad(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}

function parseBrief(formData: FormData): { ok: true; data: Omit<CreateBriefInput, "workspaceId"> } | { ok: false; error: string } {
  const fee = centsFromNad(String(formData.get("feeNad") ?? ""));
  if (fee == null) return { ok: false, error: "Enter the fee per video in Namibian dollars, such as 500 or 500.00." };
  const platforms = formData.getAll("platforms").map(String).filter((item): item is SocialPlatform => PLATFORMS.includes(item as SocialPlatform));
  const term = Number(formData.get("termMonths"));
  const format = String(formData.get("format") ?? "");
  const usage = String(formData.get("usage") ?? "");
  if (format !== "vertical" && format !== "square" && format !== "horizontal") return { ok: false, error: "Choose a format." };
  if (usage !== "organic" && usage !== "paid" && usage !== "organic_and_paid") return { ok: false, error: "Choose usage rights." };
  if (term !== 3 && term !== 6 && term !== 12) return { ok: false, error: "Term must be 3, 6, or 12 months." };
  return {
    ok: true,
    data: {
      title: String(formData.get("title") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      format,
      lengthSeconds: Number(formData.get("lengthSeconds")),
      videoCount: Number(formData.get("videoCount")),
      rawFiles: formData.get("rawFiles") === "on",
      usage,
      termMonths: term,
      platforms,
      territory: String(formData.get("territory") ?? ""),
      feePerAssetCents: fee,
      revisionLimit: Number(formData.get("revisionLimit")),
      openNow: formData.get("intent") !== "draft",
    },
  };
}

export async function createBriefAction(formData: FormData) {
  const session = await requireSession();
  const parsed = parseBrief(formData);
  if (!parsed.ok) return parsed;
  try {
    let id = "";
    await updateStore((store) => {
      const profile = store.profiles.find((item) => item.id === session.id);
      const brief = createBrief(
        store,
        session,
        { ...parsed.data, workspaceId: profile?.activeWorkspaceId ?? null },
        clock(),
      );
      id = brief.id;
    });
    revalidateLicensing(id);
    return { ok: true as const, id };
  } catch (error) {
    return fail(error);
  }
}

export async function openBriefAction(briefId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      openDraftBrief(store, session, briefId, clock());
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function pauseBriefAction(briefId: string, paused: boolean) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      setBriefPaused(store, session, briefId, paused, clock());
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function closeBriefAction(briefId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      closeBrief(store, session, briefId, clock());
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function applyBriefAction(formData: FormData) {
  const session = await requireSession();
  const briefId = String(formData.get("briefId") ?? "");
  try {
    let applicationId = "";
    let brandId = "";
    let title = "";
    await updateStore((store) => {
      const application = applyToBrief(store, session, briefId, String(formData.get("note") ?? ""), clock());
      const brief = store.ugcBriefs.find((item) => item.id === briefId);
      applicationId = application.id;
      brandId = brief?.brandId ?? "";
      title = brief?.title ?? "UGC brief";
      if (brandId) {
        pushNotification(store, {
          id: newId(),
          userId: brandId,
          kind: "ugc_update",
          title: "New UGC application",
          body: `${session.displayName} applied to ${title}.`,
          href: `/dashboard/brand/ugc/${briefId}`,
          readAt: null,
          createdAt: nowIso(),
        });
      }
    });
    revalidateLicensing(briefId);
    return { ok: true as const, id: applicationId };
  } catch (error) {
    return fail(error);
  }
}

export async function inviteCreatorAction(formData: FormData) {
  const session = await requireSession();
  const briefId = String(formData.get("briefId") ?? "");
  try {
    await updateStore((store) => {
      const application = inviteCreator(store, session, briefId, String(formData.get("email") ?? ""), clock());
      const brief = store.ugcBriefs.find((item) => item.id === briefId);
      pushNotification(store, {
        id: newId(),
        userId: application.creatorId,
        kind: "ugc_update",
        title: "UGC invite",
        body: `${session.displayName} invited you to ${brief?.title ?? "a UGC brief"}.`,
        href: `/dashboard/ugc/${briefId}`,
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function decideApplicationAction(applicationId: string, accept: boolean) {
  const session = await requireSession();
  try {
    let briefId = "";
    await updateStore((store) => {
      const application = decideApplication(store, session, applicationId, accept, clock());
      briefId = application.briefId;
      const brief = store.ugcBriefs.find((item) => item.id === briefId);
      const target = accept ? application.creatorId : brief?.brandId;
      if (target && target !== session.id) {
        pushNotification(store, {
          id: newId(),
          userId: target,
          kind: "ugc_update",
          title: accept ? "UGC application accepted" : "UGC application update",
          body: accept
            ? `You can upload files for ${brief?.title ?? "the brief"}.`
            : `${session.displayName} withdrew an application.`,
          href: accept ? `/dashboard/ugc/${briefId}` : `/dashboard/brand/ugc/${briefId}`,
          readAt: null,
          createdAt: nowIso(),
        });
      }
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function submitDeliveryAction(formData: FormData) {
  const session = await requireSession();
  const applicationId = String(formData.get("applicationId") ?? "");
  const incoming = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
  if (!incoming.length) return { ok: false as const, error: "Choose a file to upload." };
  try {
    const files: Awaited<ReturnType<typeof saveUgcFile>>[] = [];
    for (const file of incoming) files.push(await saveUgcFile(file));
    let briefId = "";
    await updateStore((store) => {
      const delivery = submitDelivery(store, session, applicationId, files, clock());
      briefId = delivery.briefId;
      const brief = store.ugcBriefs.find((item) => item.id === briefId);
      if (brief) {
        pushNotification(store, {
          id: newId(),
          userId: brief.brandId,
          kind: "ugc_update",
          title: "UGC file uploaded",
          body: `${session.displayName} submitted a file for ${brief.title}.`,
          href: `/dashboard/brand/ugc/${briefId}`,
          readAt: null,
          createdAt: nowIso(),
        });
      }
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function requestRevisionAction(formData: FormData) {
  const session = await requireSession();
  const deliveryId = String(formData.get("deliveryId") ?? "");
  try {
    let briefId = "";
    await updateStore((store) => {
      const delivery = requestRevision(store, session, deliveryId, String(formData.get("note") ?? ""), clock());
      briefId = delivery.briefId;
      const brief = store.ugcBriefs.find((item) => item.id === briefId);
      pushNotification(store, {
        id: newId(),
        userId: delivery.creatorId,
        kind: "ugc_update",
        title: "Revision requested",
        body: brief ? `${brief.title}: ${delivery.revisionNote}` : "A brand requested a revision.",
        href: `/dashboard/ugc/${briefId}`,
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function declineDeliveryAction(deliveryId: string) {
  const session = await requireSession();
  try {
    let briefId = "";
    await updateStore((store) => {
      const delivery = declineDelivery(store, session, deliveryId, clock());
      briefId = delivery.briefId;
      pushNotification(store, {
        id: newId(),
        userId: delivery.creatorId,
        kind: "ugc_update",
        title: "Delivery declined",
        body: "The brand declined this file. The reserved fee was not paid.",
        href: `/dashboard/ugc/${briefId}`,
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function approveDeliveryAction(deliveryId: string) {
  const session = await requireSession();
  try {
    let briefId = "";
    await updateStore((store) => {
      const license = approveDelivery(store, session, deliveryId, clock());
      briefId = license.briefId;
      pushNotification(store, {
        id: newId(),
        userId: license.creatorId,
        kind: "ugc_update",
        title: "UGC license paid",
        body: `N$${(license.feeCents / 100).toFixed(2)} is in your wallet for ${license.title}.`,
        href: `/dashboard/ugc/${briefId}`,
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateLicensing(briefId);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function openDisputeAction(formData: FormData) {
  const session = await requireSession();
  const licenseId = String(formData.get("licenseId") ?? "");
  try {
    await updateStore((store) => {
      const dispute = openLicenseDispute(store, session, licenseId, String(formData.get("reason") ?? ""), clock());
      for (const profile of store.profiles) {
        if (!profile.roles.includes("admin") || profile.suspended) continue;
        pushNotification(store, {
          id: newId(),
          userId: profile.id,
          kind: "ugc_update",
          title: "License dispute",
          body: dispute.reason.slice(0, 180),
          href: "/dashboard/admin/disputes",
          readAt: null,
          createdAt: nowIso(),
        });
      }
    });
    revalidateLicensing();
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function resolveDisputeAction(formData: FormData) {
  const session = await requireSession();
  const disputeId = String(formData.get("disputeId") ?? "");
  const outcome = formData.get("outcome") === "dismissed" ? "dismissed" : "resolved";
  try {
    await updateStore((store) => {
      const dispute = resolveLicenseDispute(store, session, disputeId, outcome, String(formData.get("resolution") ?? ""), clock());
      pushNotification(store, {
        id: newId(),
        userId: dispute.openedBy,
        kind: "ugc_update",
        title: outcome === "resolved" ? "Dispute resolved" : "Dispute dismissed",
        body: dispute.resolution ?? "An admin updated the dispute.",
        href: "/dashboard/admin/disputes",
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateLicensing();
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function savePortfolioAction(formData: FormData) {
  const session = await requireSession();
  const feeRaw = String(formData.get("feeNad") ?? "0").trim();
  const fee = feeRaw === "" || feeRaw === "0" ? 0 : centsFromNad(feeRaw);
  if (fee == null) return { ok: false as const, error: "Enter a rate in Namibian dollars, or 0 to show rate on request." };
  const sampleUrls = String(formData.get("sampleUrls") ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  try {
    await updateStore((store) => {
      savePortfolio(
        store,
        session,
        {
          headline: String(formData.get("headline") ?? ""),
          about: String(formData.get("about") ?? ""),
          sampleUrls,
          ugcFeeCents: fee,
          published: formData.get("published") === "on",
        },
        clock(),
      );
    });
    revalidatePath("/dashboard/ugc/portfolio");
    revalidatePath(`/creators/${session.id}`);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}
