"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { newId, nowIso, updateStore } from "@/lib/db/store";
import {
  creatorTakedown,
  moderateListing,
  moderateReview,
  saveListing,
  submitReview,
} from "@/lib/directory/commands";
import { pushNotification } from "@/lib/notifications/inbox";

function clock() {
  return { id: () => newId(), now: () => nowIso() };
}

function fail(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "Something went wrong." };
}

function revalidateDirectory(slug?: string) {
  revalidatePath("/directory");
  revalidatePath("/dashboard/brand/directory");
  revalidatePath("/dashboard/admin/directory");
  revalidatePath("/sitemap.xml");
  if (slug) revalidatePath(`/business/${slug}`);
}

export async function saveListingAction(formData: FormData) {
  const session = await requireSession();
  try {
    let slug = "";
    await updateStore((store) => {
      const listing = saveListing(
        store,
        session,
        {
          listingId: String(formData.get("listingId") ?? "") || null,
          name: String(formData.get("name") ?? ""),
          city: String(formData.get("city") ?? ""),
          category: String(formData.get("category") ?? ""),
          summary: String(formData.get("summary") ?? ""),
          website: String(formData.get("website") ?? ""),
          address: String(formData.get("address") ?? ""),
          optInReviews: formData.get("optInReviews") === "on",
        },
        clock(),
      );
      slug = listing.slug;
    });
    revalidateDirectory(slug);
    return { ok: true as const, slug };
  } catch (error) {
    return fail(error);
  }
}

export async function submitReviewAction(formData: FormData) {
  const session = await requireSession();
  const businessId = String(formData.get("businessId") ?? "");
  try {
    let slug = "";
    await updateStore((store) => {
      const review = submitReview(
        store,
        session,
        {
          businessId,
          rating: Number(formData.get("rating")),
          body: String(formData.get("body") ?? ""),
          postUrl: String(formData.get("postUrl") ?? ""),
          creatorOptIn: formData.get("creatorOptIn") === "on",
        },
        clock(),
      );
      const listing = store.businessListings.find((item) => item.id === review.businessId);
      slug = listing?.slug ?? "";
      if (listing) {
        pushNotification(store, {
          id: newId(),
          userId: listing.brandId,
          kind: "directory_update",
          title: "Creator review waiting",
          body: `${session.displayName} wrote a review of ${listing.name}. An admin publishes it.`,
          href: "/dashboard/brand/directory",
          readAt: null,
          createdAt: nowIso(),
        });
      }
      for (const profile of store.profiles) {
        if (!profile.roles.includes("admin") || profile.suspended) continue;
        pushNotification(store, {
          id: newId(),
          userId: profile.id,
          kind: "directory_update",
          title: "Review to moderate",
          body: `${session.displayName} submitted a directory review.`,
          href: "/dashboard/admin/directory",
          readAt: null,
          createdAt: nowIso(),
        });
      }
    });
    revalidateDirectory(slug);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function takedownReviewAction(reviewId: string) {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      creatorTakedown(store, session, reviewId, clock());
    });
    revalidateDirectory();
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function moderateListingAction(listingId: string, action: "publish" | "takedown" | "draft") {
  const session = await requireSession();
  try {
    let slug = "";
    let brandId = "";
    let name = "";
    await updateStore((store) => {
      const listing = moderateListing(store, session, listingId, action, clock());
      slug = listing.slug;
      brandId = listing.brandId;
      name = listing.name;
      pushNotification(store, {
        id: newId(),
        userId: brandId,
        kind: "directory_update",
        title: action === "publish" ? "Business page is public" : "Business page updated",
        body:
          action === "publish"
            ? `${name} is on the public directory.`
            : action === "takedown"
              ? `${name} was taken down.`
              : `${name} is back in draft.`,
        href: "/dashboard/brand/directory",
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateDirectory(slug);
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}

export async function moderateReviewAction(reviewId: string, action: "publish" | "reject" | "takedown") {
  const session = await requireSession();
  try {
    await updateStore((store) => {
      const review = moderateReview(store, session, reviewId, action, clock());
      const listing = store.businessListings.find((item) => item.id === review.businessId);
      pushNotification(store, {
        id: newId(),
        userId: review.creatorId,
        kind: "directory_update",
        title: action === "publish" ? "Review published" : "Review updated",
        body:
          action === "publish"
            ? `Your review of ${listing?.name ?? "a business"} is public.`
            : action === "reject"
              ? "An admin did not publish this review."
              : "This review was taken down.",
        href: listing ? `/business/${listing.slug}` : "/directory",
        readAt: null,
        createdAt: nowIso(),
      });
    });
    revalidateDirectory();
    return { ok: true as const };
  } catch (error) {
    return fail(error);
  }
}
