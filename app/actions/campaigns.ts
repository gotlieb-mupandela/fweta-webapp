"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { mapCampaign, type CampaignRow } from "@/lib/db/mappers";
import {
  campaignCreateSchema,
  campaignUpdateSchema,
} from "@/lib/validations/campaign";
import type { CampaignStatus } from "@/types/enums";

function assertBrand(roles: string[]) {
  if (!roles.includes("brand") && !roles.includes("admin")) {
    throw new Error("Brand role required");
  }
}

export async function listBrandCampaigns() {
  const session = await requireSession();
  assertBrand(session.roles);
  const supabase = await createClient();
  let query = supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  if (!session.roles.includes("admin")) {
    query = query.eq("brand_id", session.id);
  }
  const { data } = await query;
  return ((data ?? []) as CampaignRow[]).map(mapCampaign);
}

export async function getCampaign(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
  return data ? mapCampaign(data as CampaignRow) : null;
}

export async function createCampaignAction(raw: unknown) {
  const session = await requireSession();
  assertBrand(session.roles);
  const parsed = campaignCreateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid campaign details." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      brand_id: session.id,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      category: parsed.data.category,
      status: parsed.data.status ?? "draft",
      budget_total_cents: parsed.data.budgetTotalCents,
      budget_spent_cents: 0,
      cpm_cents: parsed.data.cpmCents,
      max_payout_per_submission_cents: parsed.data.maxPayoutPerSubmissionCents,
      platforms: parsed.data.platforms,
      requirements: parsed.data.requirements ?? "",
      end_date: parsed.data.endDate ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Failed to create." };
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const, id: data.id as string };
}

export async function updateCampaignAction(id: string, raw: unknown) {
  const session = await requireSession();
  assertBrand(session.roles);
  const parsed = campaignUpdateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: "Invalid campaign details." };

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.title !== undefined) patch.title = d.title;
  if (d.description !== undefined) patch.description = d.description;
  if (d.type !== undefined) patch.type = d.type;
  if (d.category !== undefined) patch.category = d.category;
  if (d.status !== undefined) patch.status = d.status;
  if (d.budgetTotalCents !== undefined) patch.budget_total_cents = d.budgetTotalCents;
  if (d.cpmCents !== undefined) patch.cpm_cents = d.cpmCents;
  if (d.maxPayoutPerSubmissionCents !== undefined) {
    patch.max_payout_per_submission_cents = d.maxPayoutPerSubmissionCents;
  }
  if (d.platforms !== undefined) patch.platforms = d.platforms;
  if (d.requirements !== undefined) patch.requirements = d.requirements;
  if (d.endDate !== undefined) patch.end_date = d.endDate;

  let query = supabase.from("campaigns").update(patch).eq("id", id);
  if (!session.roles.includes("admin")) query = query.eq("brand_id", session.id);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return { ok: false as const, error: "Campaign not found." };
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const };
}

export async function setCampaignStatusAction(id: string, status: CampaignStatus) {
  const session = await requireSession();
  assertBrand(session.roles);
  const supabase = await createClient();
  let query = supabase.from("campaigns").update({ status }).eq("id", id);
  if (!session.roles.includes("admin")) query = query.eq("brand_id", session.id);
  await query;
  revalidatePath(`/dashboard/brand/campaigns/${id}`);
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const };
}

export async function duplicateCampaignAction(id: string) {
  const session = await requireSession();
  assertBrand(session.roles);
  const source = await getCampaign(id);
  if (!source || (source.brandId !== session.id && !session.roles.includes("admin"))) {
    return { ok: false as const, error: "Campaign not found." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      brand_id: session.id,
      title: `${source.title} (copy)`,
      description: source.description,
      type: source.type,
      category: source.category,
      status: "draft",
      budget_total_cents: source.budgetTotalCents,
      budget_spent_cents: 0,
      cpm_cents: source.cpmCents,
      max_payout_per_submission_cents: source.maxPayoutPerSubmissionCents,
      platforms: source.platforms,
      requirements: source.requirements,
      end_date: source.endDate,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Failed." };
  revalidatePath("/dashboard/brand/campaigns");
  return { ok: true as const, id: data.id as string };
}

export async function listActiveCampaignsPublic(filters?: {
  platform?: string;
  type?: string;
  q?: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  return ((data ?? []) as CampaignRow[])
    .map(mapCampaign)
    .filter((c) => (filters?.type ? c.type === filters.type : true))
    .filter((c) =>
      filters?.platform ? c.platforms.includes(filters.platform as never) : true,
    )
    .filter((c) =>
      filters?.q
        ? `${c.title} ${c.category} ${c.description}`
            .toLowerCase()
            .includes(filters.q.toLowerCase())
        : true,
    );
}
