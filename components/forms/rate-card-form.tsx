"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { addRateCardAction } from "@/app/actions/influencer";
import { Button } from "@/components/ui/button";
import { FieldError, FieldSuccess, Input, Label, Select, Textarea } from "@/components/ui/input";
import { MAX_RATE_CENTS } from "@/lib/validations/influencer";

const MAX_NAD = MAX_RATE_CENTS / 100;

export function RateCardForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);

  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (lock.current || pending) return;
        const form = e.currentTarget;
        const fd = new FormData(form);
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
        setError(null);
        setSuccess(null);
        lock.current = true;
        startTransition(async () => {
          try {
            const res = await addRateCardAction({
              title,
              description: String(fd.get("description") || ""),
              type: String(fd.get("type") || "per_post") as
                | "per_post"
                | "per_reel"
                | "per_1k_views"
                | "package"
                | "ugc_flat",
              platform: String(fd.get("platform") || "multi") as
                | "tiktok"
                | "youtube"
                | "instagram"
                | "facebook"
                | "x"
                | "multi",
              priceCents: Math.round(price * 100),
            });
            if (!res.ok) setError(res.error);
            else {
              form.reset();
              setSuccess("Rate added.");
              router.refresh();
            }
          } catch {
            setError("Could not add the rate. Try again.");
          } finally {
            lock.current = false;
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
            <option value="per_reel">Per Reel</option>
            <option value="per_1k_views">Per 1,000 views</option>
            <option value="package">Package</option>
            <option value="ugc_flat">UGC flat fee</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="platform">Platform</Label>
          <Select id="platform" name="platform" defaultValue="multi">
            <option value="multi">Any platform</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="x">X</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="price">Price (NAD)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="0.01"
            min="0.01"
            max={MAX_NAD}
            required
            placeholder="500.00"
          />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <FieldSuccess>{success}</FieldSuccess>
      <Button type="submit" size="sm" className="sticky-submit" disabled={pending}>
        {pending ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
