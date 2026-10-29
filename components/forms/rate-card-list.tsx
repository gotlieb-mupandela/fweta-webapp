"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteRateCardAction, updateRateCardAction } from "@/app/actions/influencer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { FieldError, FieldSuccess, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { RateCardItem } from "@/lib/db/types";
import { RATE_TYPE_LABEL, ratePlatformLabel } from "@/lib/platforms/guides";
import { formatMoney } from "@/lib/utils";
import { MAX_RATE_CENTS } from "@/lib/validations/influencer";

const MAX_NAD = MAX_RATE_CENTS / 100;

export function RateCardList({ rates }: { rates: RateCardItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await task();
      } catch {
        setError("Could not update the rate. Try again.");
      }
    });
  }

  return (
    <div className="space-y-2.5">
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <ul className="space-y-2.5">
        {rates.map((rate) => {
          const editing = editingId === rate.id;
          return (
            <li key={rate.id} className="list-row items-start">
              {editing ? (
                <form
                  className="w-full space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const fd = new FormData(event.currentTarget);
                    const title = String(fd.get("title") || "").trim();
                    const price = parseFloat(String(fd.get("price") || ""));
                    if (title.length < 2) {
                      setSuccess(null);
                      setError("Enter a title.");
                      return;
                    }
                    if (Number.isNaN(price) || price <= 0) {
                      setSuccess(null);
                      setError("Enter a valid price.");
                      return;
                    }
                    if (price > MAX_NAD) {
                      setSuccess(null);
                      setError("Price cannot exceed N$1,000,000.");
                      return;
                    }
                    run(async () => {
                      const res = await updateRateCardAction(rate.id, {
                        title,
                        description: String(fd.get("description") || ""),
                        type: String(fd.get("type") || rate.type),
                        platform: String(fd.get("platform") || rate.platform),
                        priceCents: Math.round(price * 100),
                        active: fd.get("active") === "on",
                      });
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      setEditingId(null);
                      setSuccess("Rate updated.");
                      router.refresh();
                    });
                  }}
                >
                  <div>
                    <Label htmlFor={`title-${rate.id}`}>Title</Label>
                    <Input id={`title-${rate.id}`} name="title" required defaultValue={rate.title} />
                  </div>
                  <div>
                    <Label htmlFor={`description-${rate.id}`}>Description</Label>
                    <Textarea id={`description-${rate.id}`} name="description" defaultValue={rate.description} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`type-${rate.id}`}>Type</Label>
                      <Select id={`type-${rate.id}`} name="type" defaultValue={rate.type}>
                        <option value="per_post">Per post</option>
                        <option value="per_reel">Per Reel</option>
                        <option value="per_1k_views">Per 1,000 views</option>
                        <option value="package">Package</option>
                        <option value="ugc_flat">UGC flat fee</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`platform-${rate.id}`}>Platform</Label>
                      <Select id={`platform-${rate.id}`} name="platform" defaultValue={rate.platform}>
                        <option value="multi">Any platform</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                        <option value="x">X</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`price-${rate.id}`}>Price (NAD)</Label>
                      <Input
                        id={`price-${rate.id}`}
                        name="price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={MAX_NAD}
                        required
                        defaultValue={(rate.priceCents / 100).toFixed(2)}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={rate.active} />
                    Active on your public profile
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={pending}>
                      {pending ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{rate.title}</p>
                    <p className="text-sm text-muted">
                      {RATE_TYPE_LABEL[rate.type] ?? rate.type} · {ratePlatformLabel(rate.platform)} ·{" "}
                      {formatMoney(rate.priceCents)}
                    </p>
                    {rate.description ? <p className="mt-1 text-sm text-muted">{rate.description}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={rate.active ? "success" : "muted"}>{rate.active ? "Active" : "Inactive"}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setConfirmId(null);
                        setEditingId(rate.id);
                      }}
                    >
                      Edit
                    </Button>
                    {confirmId === rate.id ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const res = await deleteRateCardAction(rate.id);
                              if (!res.ok) {
                                setError(res.error);
                                return;
                              }
                              setConfirmId(null);
                              setSuccess("Rate removed.");
                              router.refresh();
                            })
                          }
                        >
                          {pending ? "Removing…" : "Delete"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() => {
                          setEditingId(null);
                          setConfirmId(rate.id);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
