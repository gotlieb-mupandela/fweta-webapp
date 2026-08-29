"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { mapSubmission, type CampaignRow, type SubmissionRow } from "@/lib/db/mappers";
import { mapCampaign } from "@/lib/db/mappers";
import { submissionReviewSchema, submissionSchema } from "@/lib/validations/submission";

export async function submitClipAction(raw: unknown) {
  const session = await requireSession();
  if (!session.roles.includes("clipper") && !session.roles.includes("influencer")) {
    return { ok: false as const, error: "Creator role required." };
  }
  const parsed = submissionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid submission." };

  const supabase = await createClient();
  const { data: campaignRow } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", parsed.data.campaignId)
    .maybeSingle();
  const campaign = campaignRow ? mapCampaign(campaignRow as CampaignRow) : null;
  if (!campaign || campaign.status !== "active") {
    return { ok: false as const, error: "Campaign is not accepting submissions." };
  }
  if (!campaign.platforms.includes(parsed.data.platform)) {
    return { ok: false as const, error: "Platform not allowed for this campaign." };
  }

  const { data, error } = await supabase
    .from("submissions")
    .insert({
      campaign_id: parsed.data.campaignId,
      clipper_id: session.id,
      post_url: parsed.data.postUrl,
      platform: parsed.data.platform,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Failed." };
  revalidatePath("/dashboard/clipper/submissions");
  return { ok: true as const, id: data.id as string };
}

export async function reviewSubmissionAction(id: string, raw: unknown) {
  const session = await requireSession();
  const parsed = submissionReviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid review." };

  const supabase = await createClient();
  const { data: submissionRow } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!submissionRow) return { ok: false as const, error: "Not found." };
  const submission = mapSubmission(submissionRow as SubmissionRow);
  const { data: campaignRow } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", submission.campaignId)
    .maybeSingle();
  if (!campaignRow) return { ok: false as const, error: "Campaign missing." };
  const campaign = mapCampaign(campaignRow as CampaignRow);
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) {
    return { ok: false as const, error: "Not allowed." };
  }

  const { error } = await supabase
    .from("submissions")
    .update({
      status: parsed.data.status,
      review_note: parsed.data.reviewNote ?? null,
    })
    .eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  if (parsed.data.status === "flagged") {
    await supabase.from("fraud_flags").insert({
      submission_id: id,
      reason: parsed.data.reviewNote || "Flagged by brand",
      status: "open",
    });
  }

  revalidatePath(`/dashboard/brand/campaigns/${campaign.id}/submissions`);
  return { ok: true as const };
}

export async function listClipperSubmissions() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("submissions")
    .select("*")
    .eq("clipper_id", session.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as SubmissionRow[]).map(mapSubmission);
}

export async function listCampaignSubmissions(campaignId: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: campaignRow } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow) return [];
  const campaign = mapCampaign(campaignRow as CampaignRow);
  if (campaign.brandId !== session.id && !session.roles.includes("admin")) return [];
  const { data } = await supabase
    .from("submissions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as SubmissionRow[]).map(mapSubmission);
}
