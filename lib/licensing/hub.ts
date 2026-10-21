import type { SocialPlatform, UserRole } from "@/types/enums";
import { applyWalletDelta } from "@/lib/wallet/ledger";
import type {
  ContentLicense,
  CreatorPortfolio,
  DatabaseStore,
  LedgerEntry,
  UgcApplication,
  UgcBrief,
  UgcDelivery,
  UgcFile,
  UgcFormat,
  UgcTermMonths,
  UgcUsage,
} from "@/lib/db/types";

export type LicensingActor = {
  id: string;
  roles: readonly UserRole[];
  displayName: string;
};

export type LicensingClock = {
  id: () => string;
  now: () => string;
};

const FORMATS: UgcFormat[] = ["vertical", "square", "horizontal"];
const USAGES: UgcUsage[] = ["organic", "paid", "organic_and_paid"];
const TERMS: UgcTermMonths[] = [3, 6, 12];
const PLATFORMS: SocialPlatform[] = ["tiktok", "instagram", "youtube", "x"];

export function usageLabel(usage: UgcUsage): string {
  if (usage === "organic") return "organic posts";
  if (usage === "paid") return "paid ads";
  return "organic posts and paid ads";
}

export function formatLabel(format: UgcFormat): string {
  if (format === "vertical") return "vertical video";
  if (format === "square") return "square video";
  return "horizontal video";
}

export function platformLabel(platform: SocialPlatform): string {
  if (platform === "tiktok") return "TikTok";
  if (platform === "instagram") return "Instagram";
  if (platform === "youtube") return "YouTube";
  return "X";
}

export function briefBudgetCents(feePerAssetCents: number, videoCount: number): number {
  if (!Number.isInteger(feePerAssetCents) || feePerAssetCents <= 0) {
    throw new Error("Fee per video must be a positive whole cent amount.");
  }
  if (!Number.isInteger(videoCount) || videoCount < 1 || videoCount > 20) {
    throw new Error("Video count must be from 1 to 20.");
  }
  return feePerAssetCents * videoCount;
}

export function licenseWindow(startsAtIso: string, termMonths: UgcTermMonths): { startsAt: string; endsAt: string } {
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) throw new Error("License start date is invalid.");
  const end = new Date(start.getTime());
  end.setUTCMonth(end.getUTCMonth() + termMonths);
  return { startsAt: start.toISOString(), endsAt: end.toISOString() };
}

export function buildLicenseSummary(license: Omit<ContentLicense, "summary">): string {
  const platforms = license.platforms.map(platformLabel).join(", ");
  const raw = license.rawFiles ? "Raw files are included." : "Raw files are not included.";
  const lines = [
    "fweta content license",
    `License ${license.id}`,
    "",
    `${license.brandName} may use one approved video from ${license.creatorName}.`,
    "The creator does not have to post this video on their own feed.",
    "",
    `Asset: ${formatLabel(license.format)}, up to ${license.lengthSeconds} seconds. ${raw}`,
    `Use: ${usageLabel(license.usage)}.`,
    `Platforms: ${platforms}.`,
    `Territory: ${license.territory}.`,
    `Term: ${license.termMonths} months, from ${license.startsAt.slice(0, 10)} to ${license.endsAt.slice(0, 10)}.`,
    `Fee: N$${(license.feeCents / 100).toFixed(2)}, credited to the creator wallet when this license was created.`,
    "",
    `Brief: ${license.title}.`,
    "This summary is the record stored with the license. It is not a separate contract.",
  ];
  return lines.join("\n");
}

export function splitCreatorIncome(entries: readonly Pick<LedgerEntry, "type" | "referenceType" | "amountCents">[]): {
  viewCents: number;
  ugcCents: number;
} {
  let viewCents = 0;
  let ugcCents = 0;
  for (const entry of entries) {
    if (entry.type !== "credit") continue;
    if (entry.referenceType === "campaign_earning") viewCents += entry.amountCents;
    if (entry.referenceType === "ugc_fee") ugcCents += entry.amountCents;
  }
  return { viewCents, ugcCents };
}

function isCreator(actor: LicensingActor): boolean {
  return actor.roles.includes("clipper") || actor.roles.includes("influencer");
}

function requireBrand(actor: LicensingActor, brief: UgcBrief) {
  if (brief.brandId !== actor.id) throw new Error("Only the brand on this brief can do that.");
}

function profileName(store: DatabaseStore, userId: string, fallback: string): string {
  return store.profiles.find((profile) => profile.id === userId)?.displayName || fallback;
}

function approvedCount(store: DatabaseStore, briefId: string): number {
  return store.ugcDeliveries.filter((delivery) => delivery.briefId === briefId && delivery.status === "approved").length;
}

export type CreateBriefInput = {
  title: string;
  summary: string;
  format: UgcFormat;
  lengthSeconds: number;
  videoCount: number;
  rawFiles: boolean;
  usage: UgcUsage;
  termMonths: UgcTermMonths;
  platforms: SocialPlatform[];
  territory: string;
  feePerAssetCents: number;
  revisionLimit: number;
  workspaceId: string | null;
  openNow: boolean;
};

function assertBriefShape(input: CreateBriefInput) {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const territory = input.territory.trim();
  if (title.length < 3 || title.length > 120) throw new Error("Title must be 3 to 120 characters.");
  if (summary.length < 20 || summary.length > 4000) throw new Error("Describe the deliverable in at least 20 characters.");
  if (!FORMATS.includes(input.format)) throw new Error("Choose a format.");
  if (!Number.isInteger(input.lengthSeconds) || input.lengthSeconds < 5 || input.lengthSeconds > 180) {
    throw new Error("Length must be from 5 to 180 seconds.");
  }
  if (!USAGES.includes(input.usage)) throw new Error("Choose usage rights.");
  if (!TERMS.includes(input.termMonths)) throw new Error("Term must be 3, 6, or 12 months.");
  if (!input.platforms.length || input.platforms.some((platform) => !PLATFORMS.includes(platform))) {
    throw new Error("Choose at least one platform.");
  }
  if (territory.length < 2 || territory.length > 80) throw new Error("Enter a territory.");
  if (!Number.isInteger(input.revisionLimit) || input.revisionLimit < 0 || input.revisionLimit > 5) {
    throw new Error("Revision limit must be from 0 to 5.");
  }
  briefBudgetCents(input.feePerAssetCents, input.videoCount);
  return { title, summary, territory, platforms: [...new Set(input.platforms)] };
}

export function createBrief(
  store: DatabaseStore,
  actor: LicensingActor,
  input: CreateBriefInput,
  clock: LicensingClock,
): UgcBrief {
  if (!actor.roles.includes("brand")) throw new Error("Brand role required.");
  const clean = assertBriefShape(input);
  const budgetCents = briefBudgetCents(input.feePerAssetCents, input.videoCount);
  const now = clock.now();
  const brief: UgcBrief = {
    id: clock.id(),
    brandId: actor.id,
    workspaceId: input.workspaceId,
    title: clean.title,
    summary: clean.summary,
    format: input.format,
    lengthSeconds: input.lengthSeconds,
    videoCount: input.videoCount,
    rawFiles: input.rawFiles,
    usage: input.usage,
    termMonths: input.termMonths,
    platforms: clean.platforms,
    territory: clean.territory,
    feePerAssetCents: input.feePerAssetCents,
    budgetCents,
    budgetReservedCents: 0,
    revisionLimit: input.revisionLimit,
    status: input.openNow ? "open" : "draft",
    createdAt: now,
    updatedAt: now,
  };
  if (input.openNow) {
    // Reserve the full fixed-fee budget up front. Approvals pay creators from this hold.
    applyWalletDelta(store, {
      userId: actor.id,
      availableDelta: -budgetCents,
      type: "debit",
      reason: `UGC brief reserved · ${brief.title}`,
      referenceType: "ugc_reserve",
      referenceId: brief.id,
    });
    brief.budgetReservedCents = budgetCents;
  }
  store.ugcBriefs.push(brief);
  return brief;
}

export function openDraftBrief(store: DatabaseStore, actor: LicensingActor, briefId: string, clock: LicensingClock): UgcBrief {
  const brief = mustBrief(store, briefId);
  requireBrand(actor, brief);
  if (brief.status !== "draft") throw new Error("Only a draft can be opened.");
  applyWalletDelta(store, {
    userId: actor.id,
    availableDelta: -brief.budgetCents,
    type: "debit",
    reason: `UGC brief reserved · ${brief.title}`,
    referenceType: "ugc_reserve",
    referenceId: brief.id,
  });
  brief.budgetReservedCents = brief.budgetCents;
  brief.status = "open";
  brief.updatedAt = clock.now();
  return brief;
}

export function setBriefPaused(
  store: DatabaseStore,
  actor: LicensingActor,
  briefId: string,
  paused: boolean,
  clock: LicensingClock,
): UgcBrief {
  const brief = mustBrief(store, briefId);
  requireBrand(actor, brief);
  if (paused) {
    if (brief.status !== "open") throw new Error("Only an open brief can be paused.");
    brief.status = "paused";
  } else {
    if (brief.status !== "paused") throw new Error("This brief is not paused.");
    brief.status = "open";
  }
  brief.updatedAt = clock.now();
  return brief;
}

export function closeBrief(store: DatabaseStore, actor: LicensingActor, briefId: string, clock: LicensingClock): UgcBrief {
  const brief = mustBrief(store, briefId);
  requireBrand(actor, brief);
  if (brief.status !== "open" && brief.status !== "paused") throw new Error("This brief is already closed.");
  const waiting = store.ugcDeliveries.some(
    (delivery) => delivery.briefId === brief.id && (delivery.status === "submitted" || delivery.status === "revision"),
  );
  if (waiting) throw new Error("Review open deliveries before closing. Their fees are still reserved.");
  if (brief.budgetReservedCents > 0) {
    applyWalletDelta(store, {
      userId: brief.brandId,
      availableDelta: brief.budgetReservedCents,
      type: "credit",
      reason: `UGC brief unused budget returned · ${brief.title}`,
      referenceType: "ugc_release",
      referenceId: brief.id,
    });
    brief.budgetReservedCents = 0;
  }
  brief.status = "closed";
  brief.updatedAt = clock.now();
  return brief;
}

function mustBrief(store: DatabaseStore, briefId: string): UgcBrief {
  const brief = store.ugcBriefs.find((item) => item.id === briefId);
  if (!brief) throw new Error("Brief not found.");
  return brief;
}

function blockingApplication(store: DatabaseStore, briefId: string, creatorId: string): UgcApplication | undefined {
  return store.ugcApplications.find(
    (item) =>
      item.briefId === briefId &&
      item.creatorId === creatorId &&
      (item.status === "invited" || item.status === "applied" || item.status === "accepted"),
  );
}

export function applyToBrief(
  store: DatabaseStore,
  actor: LicensingActor,
  briefId: string,
  note: string,
  clock: LicensingClock,
): UgcApplication {
  if (!isCreator(actor)) throw new Error("Creator role required.");
  const brief = mustBrief(store, briefId);
  if (brief.status !== "open") throw new Error("This brief is not accepting applications.");
  if (brief.brandId === actor.id) throw new Error("You cannot apply to your own brief.");
  if (blockingApplication(store, briefId, actor.id)) throw new Error("You already have an application on this brief.");
  const clean = note.trim();
  if (clean.length > 1000) throw new Error("Note must be 1000 characters or fewer.");
  const application: UgcApplication = {
    id: clock.id(),
    briefId,
    creatorId: actor.id,
    status: "applied",
    note: clean,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  };
  store.ugcApplications.push(application);
  return application;
}

export function inviteCreator(
  store: DatabaseStore,
  actor: LicensingActor,
  briefId: string,
  email: string,
  clock: LicensingClock,
): UgcApplication {
  const brief = mustBrief(store, briefId);
  requireBrand(actor, brief);
  if (brief.status !== "open" && brief.status !== "paused") throw new Error("Invite creators while the brief is open.");
  const target = store.profiles.find((profile) => profile.email.toLowerCase() === email.trim().toLowerCase());
  if (!target || target.suspended) throw new Error("No creator with that email.");
  if (!target.roles.includes("clipper") && !target.roles.includes("influencer")) {
    throw new Error("That account is not a creator.");
  }
  if (target.id === actor.id) throw new Error("You cannot invite yourself.");
  if (blockingApplication(store, briefId, target.id)) throw new Error("That creator is already on this brief.");
  const application: UgcApplication = {
    id: clock.id(),
    briefId,
    creatorId: target.id,
    status: "invited",
    note: "",
    createdAt: clock.now(),
    updatedAt: clock.now(),
  };
  store.ugcApplications.push(application);
  return application;
}

export function decideApplication(
  store: DatabaseStore,
  actor: LicensingActor,
  applicationId: string,
  accept: boolean,
  clock: LicensingClock,
): UgcApplication {
  const application = store.ugcApplications.find((item) => item.id === applicationId);
  if (!application) throw new Error("Application not found.");
  const brief = mustBrief(store, application.briefId);
  if (actor.id === application.creatorId && !accept) {
    if (application.status !== "applied" && application.status !== "invited") {
      throw new Error("This application can no longer be withdrawn.");
    }
    application.status = "withdrawn";
    application.updatedAt = clock.now();
    return application;
  }
  requireBrand(actor, brief);
  if (application.status !== "applied" && application.status !== "invited") {
    throw new Error("This application is already decided.");
  }
  application.status = accept ? "accepted" : "declined";
  application.updatedAt = clock.now();
  return application;
}

export function submitDelivery(
  store: DatabaseStore,
  actor: LicensingActor,
  applicationId: string,
  files: UgcFile[],
  clock: LicensingClock,
): UgcDelivery {
  const application = store.ugcApplications.find((item) => item.id === applicationId && item.creatorId === actor.id);
  if (!application || application.status !== "accepted") throw new Error("Accept the brief before uploading.");
  const brief = mustBrief(store, application.briefId);
  if (brief.status !== "open" && brief.status !== "paused") throw new Error("This brief is closed.");
  if (!files.length || files.length > 6) throw new Error("Upload between 1 and 6 files.");
  const videos = files.filter((file) => file.kind === "video");
  if (videos.length < 1) throw new Error("Include the finished video.");
  if (!brief.rawFiles && (files.length !== 1 || videos.length !== 1)) {
    throw new Error("This brief takes one finished video and no raw files.");
  }
  if (approvedCount(store, brief.id) >= brief.videoCount) throw new Error("This brief already has every licensed video.");
  const existing = store.ugcDeliveries.find(
    (delivery) => delivery.applicationId === application.id && delivery.status !== "declined" && delivery.status !== "approved",
  );
  const approved = store.ugcDeliveries.find(
    (delivery) => delivery.applicationId === application.id && delivery.status === "approved",
  );
  if (approved) throw new Error("This application is already licensed.");
  const now = clock.now();
  if (existing) {
    existing.files = files;
    existing.status = "submitted";
    existing.updatedAt = now;
    return existing;
  }
  const delivery: UgcDelivery = {
    id: clock.id(),
    briefId: brief.id,
    applicationId: application.id,
    creatorId: actor.id,
    files,
    status: "submitted",
    revisionCount: 0,
    revisionNote: null,
    createdAt: now,
    updatedAt: now,
  };
  store.ugcDeliveries.push(delivery);
  return delivery;
}

export function requestRevision(
  store: DatabaseStore,
  actor: LicensingActor,
  deliveryId: string,
  note: string,
  clock: LicensingClock,
): UgcDelivery {
  const delivery = mustDelivery(store, deliveryId);
  const brief = mustBrief(store, delivery.briefId);
  requireBrand(actor, brief);
  if (delivery.status !== "submitted") throw new Error("Revisions apply to a submitted file.");
  if (delivery.revisionCount >= brief.revisionLimit) {
    throw new Error("Revision limit reached. Approve or decline this file.");
  }
  const clean = note.trim();
  if (clean.length < 5 || clean.length > 1000) throw new Error("Say what should change, in 5 to 1000 characters.");
  delivery.revisionCount += 1;
  delivery.revisionNote = clean;
  delivery.status = "revision";
  delivery.updatedAt = clock.now();
  return delivery;
}

export function declineDelivery(
  store: DatabaseStore,
  actor: LicensingActor,
  deliveryId: string,
  clock: LicensingClock,
): UgcDelivery {
  const delivery = mustDelivery(store, deliveryId);
  const brief = mustBrief(store, delivery.briefId);
  requireBrand(actor, brief);
  if (delivery.status !== "submitted" && delivery.status !== "revision") {
    throw new Error("This delivery is not waiting for review.");
  }
  delivery.status = "declined";
  delivery.updatedAt = clock.now();
  return delivery;
}

export function approveDelivery(
  store: DatabaseStore,
  actor: LicensingActor,
  deliveryId: string,
  clock: LicensingClock,
): ContentLicense {
  const delivery = mustDelivery(store, deliveryId);
  const brief = mustBrief(store, delivery.briefId);
  requireBrand(actor, brief);
  if (delivery.status !== "submitted" && delivery.status !== "revision") {
    throw new Error("This delivery is not waiting for review.");
  }
  if (brief.status !== "open" && brief.status !== "paused") throw new Error("This brief is closed.");
  if (delivery.creatorId === brief.brandId) throw new Error("You cannot license your own brief.");
  if (approvedCount(store, brief.id) >= brief.videoCount) throw new Error("Every video on this brief is already licensed.");
  if (brief.budgetReservedCents < brief.feePerAssetCents) throw new Error("Reserved budget does not cover this fee.");

  const now = clock.now();
  const window = licenseWindow(now, brief.termMonths);
  const draft: Omit<ContentLicense, "summary"> = {
    id: clock.id(),
    briefId: brief.id,
    deliveryId: delivery.id,
    brandId: brief.brandId,
    creatorId: delivery.creatorId,
    title: brief.title,
    feeCents: brief.feePerAssetCents,
    usage: brief.usage,
    termMonths: brief.termMonths,
    platforms: [...brief.platforms],
    territory: brief.territory,
    format: brief.format,
    lengthSeconds: brief.lengthSeconds,
    rawFiles: brief.rawFiles,
    brandName: profileName(store, brief.brandId, actor.displayName),
    creatorName: profileName(store, delivery.creatorId, "Creator"),
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    createdAt: now,
  };
  const license: ContentLicense = { ...draft, summary: buildLicenseSummary(draft) };

  applyWalletDelta(store, {
    userId: delivery.creatorId,
    availableDelta: brief.feePerAssetCents,
    type: "credit",
    reason: `UGC license fee · ${brief.title}`,
    referenceType: "ugc_fee",
    referenceId: license.id,
  });
  brief.budgetReservedCents -= brief.feePerAssetCents;
  brief.updatedAt = now;
  delivery.status = "approved";
  delivery.updatedAt = now;
  store.contentLicenses.push(license);
  return license;
}

function mustDelivery(store: DatabaseStore, deliveryId: string): UgcDelivery {
  const delivery = store.ugcDeliveries.find((item) => item.id === deliveryId);
  if (!delivery) throw new Error("Delivery not found.");
  return delivery;
}

export function openLicenseDispute(
  store: DatabaseStore,
  actor: LicensingActor,
  licenseId: string,
  reason: string,
  clock: LicensingClock,
) {
  const license = store.contentLicenses.find((item) => item.id === licenseId);
  if (!license) throw new Error("License not found.");
  if (actor.id !== license.brandId && actor.id !== license.creatorId) {
    throw new Error("Only the brand or the creator on this license can open a dispute.");
  }
  if (store.licenseDisputes.some((item) => item.licenseId === licenseId && item.status === "open")) {
    throw new Error("This license already has an open dispute.");
  }
  const clean = reason.trim();
  if (clean.length < 10 || clean.length > 2000) throw new Error("Describe the dispute in 10 to 2000 characters.");
  const dispute = {
    id: clock.id(),
    licenseId,
    openedBy: actor.id,
    reason: clean,
    status: "open" as const,
    resolution: null,
    createdAt: clock.now(),
    updatedAt: clock.now(),
  };
  store.licenseDisputes.push(dispute);
  return dispute;
}

export function resolveLicenseDispute(
  store: DatabaseStore,
  actor: LicensingActor,
  disputeId: string,
  outcome: "resolved" | "dismissed",
  resolution: string,
  clock: LicensingClock,
) {
  if (!actor.roles.includes("admin")) throw new Error("Admin role required.");
  const dispute = store.licenseDisputes.find((item) => item.id === disputeId);
  if (!dispute) throw new Error("Dispute not found.");
  if (dispute.status !== "open") throw new Error("This dispute is already closed.");
  const clean = resolution.trim();
  if (clean.length < 5 || clean.length > 2000) throw new Error("Add a short resolution note.");
  dispute.status = outcome;
  dispute.resolution = clean;
  dispute.updatedAt = clock.now();
  return dispute;
}

export function savePortfolio(
  store: DatabaseStore,
  actor: LicensingActor,
  input: { headline: string; about: string; sampleUrls: string[]; ugcFeeCents: number; published: boolean },
  clock: LicensingClock,
): CreatorPortfolio {
  if (!isCreator(actor)) throw new Error("Creator role required.");
  const headline = input.headline.trim();
  const about = input.about.trim();
  if (headline.length < 3 || headline.length > 140) throw new Error("Headline must be 3 to 140 characters.");
  if (about.length > 2000) throw new Error("About must be 2000 characters or fewer.");
  if (input.published && about.length < 20) throw new Error("Add a short about section before publishing.");
  if (!Number.isInteger(input.ugcFeeCents) || input.ugcFeeCents < 0) throw new Error("Rate must be zero or a positive amount.");
  if (input.sampleUrls.length > 6) throw new Error("Add up to 6 sample links.");
  const sampleUrls = input.sampleUrls.map((url) => {
    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      throw new Error("Each sample must be a full https link.");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Each sample must be a full https link.");
    return parsed.toString();
  });
  const next: CreatorPortfolio = {
    userId: actor.id,
    headline,
    about,
    sampleUrls,
    ugcFeeCents: input.ugcFeeCents,
    published: input.published,
    updatedAt: clock.now(),
  };
  const index = store.creatorPortfolios.findIndex((item) => item.userId === actor.id);
  if (index >= 0) store.creatorPortfolios[index] = next;
  else store.creatorPortfolios.push(next);
  return next;
}
