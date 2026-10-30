"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  moderateListingAction,
  moderateReviewAction,
  saveListingAction,
  submitReviewAction,
  takedownReviewAction,
} from "@/app/actions/directory";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";

function useRefresh() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else router.refresh();
    });
  }
  return { error, pending, run };
}

export function BusinessListingForm({
  listing,
  idPrefix = "biz",
}: {
  idPrefix?: string;
  listing?: {
    id: string;
    name: string;
    city: string;
    category: string;
    summary: string;
    website: string;
    address: string;
    optInReviews: boolean;
  };
}) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => saveListingAction(new FormData(event.currentTarget)));
      }}
    >
      {listing ? <input type="hidden" name="listingId" value={listing.id} /> : null}
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Business name</Label>
        <Input id={`${idPrefix}-name`} name="name" required defaultValue={listing?.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input id={`${idPrefix}-city`} name="city" required defaultValue={listing?.city ?? "Windhoek"} />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-category`}>Category</Label>
          <Input id={`${idPrefix}-category`} name="category" required defaultValue={listing?.category} placeholder="Cafe" />
        </div>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-summary`}>Plain-language summary</Label>
        <Textarea
          id={`${idPrefix}-summary`}
          name="summary"
          required
          defaultValue={listing?.summary}
          placeholder="A Windhoek cafe serving breakfast and coffee. Creators can say what they experienced."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${idPrefix}-website`}>Website</Label>
          <Input id={`${idPrefix}-website`} name="website" defaultValue={listing?.website} placeholder="https://example.com" />
        </div>
        <div>
          <Label htmlFor={`${idPrefix}-address`}>Address</Label>
          <Input id={`${idPrefix}-address`} name="address" defaultValue={listing?.address} />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" name="optInReviews" defaultChecked={listing?.optInReviews ?? false} />
        Opt in to public creator reviews
      </label>
      <Button type="submit" className="sticky-submit block" disabled={pending}>
        {pending ? "Saving" : listing ? "Save listing" : "Create listing"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function CreatorReviewForm({ businessId }: { businessId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("businessId", businessId);
        run(() => submitReviewAction(body));
      }}
    >
      <div>
        <Label htmlFor={`rating-${businessId}`}>Rating</Label>
        <Select id={`rating-${businessId}`} name="rating" defaultValue="5">
          <option value="5">5 out of 5</option>
          <option value="4">4 out of 5</option>
          <option value="3">3 out of 5</option>
          <option value="2">2 out of 5</option>
          <option value="1">1 out of 5</option>
        </Select>
      </div>
      <div>
        <Label htmlFor={`body-${businessId}`}>Your recommendation</Label>
        <Textarea id={`body-${businessId}`} name="body" required placeholder="What you experienced, in your own words." />
      </div>
      <div>
        <Label htmlFor={`post-${businessId}`}>Link to a post, optional</Label>
        <Input id={`post-${businessId}`} name="postUrl" placeholder="https://www.tiktok.com/@you/video/1" />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="creatorOptIn" />
        Publish this review on the public directory after an admin checks it
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Submit review"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function ListingModeration({ listingId, status }: { listingId: string; status: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "published" ? (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => moderateListingAction(listingId, "publish"))}>
          Publish
        </Button>
      ) : null}
      {status === "published" ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => moderateListingAction(listingId, "draft"))}>
          Unpublish
        </Button>
      ) : null}
      {status !== "taken_down" ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => moderateListingAction(listingId, "takedown"))}>
          Take down
        </Button>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function ReviewModeration({ reviewId }: { reviewId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => moderateReviewAction(reviewId, "publish"))}>
        Publish
      </Button>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => moderateReviewAction(reviewId, "reject"))}>
        Reject
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => moderateReviewAction(reviewId, "takedown"))}>
        Take down
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function CreatorTakedownButton({ reviewId }: { reviewId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <div>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => takedownReviewAction(reviewId))}>
        Request takedown
      </Button>
      <FieldError>{error}</FieldError>
    </div>
  );
}
