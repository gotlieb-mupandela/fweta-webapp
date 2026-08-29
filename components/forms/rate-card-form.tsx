"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addRateCardAction } from "@/app/actions/influencer";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";

export function RateCardForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-3xl border border-border bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const price = parseFloat(String(fd.get("price") || ""));
        if (Number.isNaN(price) || price <= 0) {
          setError("Enter a valid price.");
          return;
        }
        setError(null);
        startTransition(async () => {
          const res = await addRateCardAction({
            title: String(fd.get("title") || ""),
            description: String(fd.get("description") || ""),
            type: String(fd.get("type") || "per_post") as "per_post" | "per_reel" | "per_1k_views" | "package" | "ugc_flat",
            platform: String(fd.get("platform") || "multi") as "tiktok" | "youtube" | "instagram" | "x" | "multi",
            priceCents: Math.round(price * 100),
          });
          if (!res.ok) setError(res.error);
          else {
            form.reset();
            router.refresh();
          }
        });
      }}
    >
      <h3 className="font-display text-xl">Add rate card item</h3>
      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required placeholder="1 TikTok post" />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select id="type" name="type" defaultValue="per_post">
            <option value="per_post">Per post</option>
            <option value="per_reel">Per reel</option>
            <option value="per_1k_views">Per 1K views</option>
            <option value="package">Package</option>
            <option value="ugc_flat">UGC flat</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="platform">Platform</Label>
          <Select id="platform" name="platform" defaultValue="multi">
            <option value="multi">Multi</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="x">X</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="price">Price (NAD)</Label>
          <Input id="price" name="price" type="number" step="0.01" min="0.01" required placeholder="500.00" />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
