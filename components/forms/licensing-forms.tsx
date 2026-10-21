"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  applyBriefAction,
  approveDeliveryAction,
  closeBriefAction,
  createBriefAction,
  decideApplicationAction,
  declineDeliveryAction,
  inviteCreatorAction,
  openBriefAction,
  openDisputeAction,
  pauseBriefAction,
  requestRevisionAction,
  resolveDisputeAction,
  savePortfolioAction,
  submitDeliveryAction,
} from "@/app/actions/licensing";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";

function useRefresh() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function run(work: () => Promise<{ ok: boolean; error?: string; id?: string }>, href?: string) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      if (href) router.push(href.replace(":id", result.id ?? ""));
      else router.refresh();
    });
  }
  return { error, pending, run };
}

export function UgcBriefForm() {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "open";
        body.set("intent", intent);
        run(() => createBriefAction(body), "/dashboard/brand/ugc/:id");
      }}
    >
      <div>
        <Label htmlFor="ugc-title">Brief name</Label>
        <Input id="ugc-title" name="title" required placeholder="Summer product clips" />
      </div>
      <div>
        <Label htmlFor="ugc-summary">What should the creator make?</Label>
        <Textarea
          id="ugc-summary"
          name="summary"
          required
          placeholder="One vertical video of the product in use. No posting on the creator feed. Brand will use it in paid ads."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ugc-format">Format</Label>
          <Select id="ugc-format" name="format" defaultValue="vertical">
            <option value="vertical">Vertical</option>
            <option value="square">Square</option>
            <option value="horizontal">Horizontal</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ugc-length">Length in seconds</Label>
          <Input id="ugc-length" name="lengthSeconds" type="number" min={5} max={180} defaultValue={30} required />
        </div>
        <div>
          <Label htmlFor="ugc-count">Number of videos</Label>
          <Input id="ugc-count" name="videoCount" type="number" min={1} max={20} defaultValue={1} required />
        </div>
        <div>
          <Label htmlFor="ugc-fee">Fee per video (N$)</Label>
          <Input id="ugc-fee" name="feeNad" inputMode="decimal" required placeholder="500.00" />
        </div>
        <div>
          <Label htmlFor="ugc-usage">Usage rights</Label>
          <Select id="ugc-usage" name="usage" defaultValue="paid">
            <option value="paid">Paid ads</option>
            <option value="organic">Organic only</option>
            <option value="organic_and_paid">Organic and paid</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ugc-term">Term</Label>
          <Select id="ugc-term" name="termMonths" defaultValue="6">
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="ugc-territory">Territory</Label>
          <Input id="ugc-territory" name="territory" required defaultValue="Namibia" />
        </div>
        <div>
          <Label htmlFor="ugc-revisions">Revision limit</Label>
          <Input id="ugc-revisions" name="revisionLimit" type="number" min={0} max={5} defaultValue={2} required />
        </div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Platforms the brand may use</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {[
            ["tiktok", "TikTok"],
            ["instagram", "Instagram"],
            ["youtube", "YouTube"],
            ["x", "X"],
          ].map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2">
              <input type="checkbox" name="platforms" value={value} defaultChecked={value === "tiktok"} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="rawFiles" />
        Ask for raw files as well as the finished video
      </label>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" value="open" disabled={pending}>
          {pending ? "Saving" : "Open and reserve budget"}
        </Button>
        <Button type="submit" value="draft" variant="secondary" disabled={pending}>
          Save draft
        </Button>
      </div>
    </form>
  );
}

export function BriefLifecycle({ briefId, status }: { briefId: string; status: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "draft" ? (
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => openBriefAction(briefId))}>
          Open and reserve
        </Button>
      ) : null}
      {status === "open" ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => pauseBriefAction(briefId, true))}>
          Pause
        </Button>
      ) : null}
      {status === "paused" ? (
        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => pauseBriefAction(briefId, false))}>
          Resume
        </Button>
      ) : null}
      {status === "open" || status === "paused" ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => closeBriefAction(briefId))}>
          Close and return unused budget
        </Button>
      ) : null}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function InviteForm({ briefId }: { briefId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("briefId", briefId);
        run(() => inviteCreatorAction(body));
        event.currentTarget.reset();
      }}
    >
      <div className="min-w-[220px] flex-1">
        <Label htmlFor={`invite-${briefId}`}>Invite a creator by email</Label>
        <Input id={`invite-${briefId}`} name="email" type="email" required placeholder="creator@fweta.test" />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        Invite
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function ApplicationDecision({ applicationId, canWithdraw }: { applicationId: string; canWithdraw?: boolean }) {
  const { error, pending, run } = useRefresh();
  return (
    <div className="flex flex-wrap gap-2">
      {canWithdraw ? (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideApplicationAction(applicationId, false))}>
          Withdraw
        </Button>
      ) : (
        <>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => decideApplicationAction(applicationId, true))}>
            Accept
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideApplicationAction(applicationId, false))}>
            Decline
          </Button>
        </>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function ApplyForm({ briefId }: { briefId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("briefId", briefId);
        run(() => applyBriefAction(body));
      }}
    >
      <div>
        <Label htmlFor={`apply-${briefId}`}>Note to the brand</Label>
        <Textarea id={`apply-${briefId}`} name="note" placeholder="I can deliver this week. I will not post it on my feed." />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending" : "Apply"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function DeliveryForm({ applicationId, rawFiles }: { applicationId: string; rawFiles: boolean }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("applicationId", applicationId);
        run(() => submitDeliveryAction(body));
      }}
    >
      <div>
        <Label htmlFor={`files-${applicationId}`}>{rawFiles ? "Finished video and raw files" : "Finished video"}</Label>
        <Input id={`files-${applicationId}`} name="files" type="file" required multiple={rawFiles} accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp" />
        <p className="mt-1 text-xs text-muted">MP4, WebM, or MOV. Up to 40 MB each. Files stay private to the brand, you, and admins.</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading" : "Submit files"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function RevisionForm({ deliveryId }: { deliveryId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("deliveryId", deliveryId);
        run(() => requestRevisionAction(body));
      }}
    >
      <Label htmlFor={`rev-${deliveryId}`}>What should change?</Label>
      <Textarea id={`rev-${deliveryId}`} name="note" required placeholder="Open on the product, not the logo." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Request revision
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => approveDeliveryAction(deliveryId))}>
          Approve and pay
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => declineDeliveryAction(deliveryId))}>
          Decline
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function DisputeForm({ licenseId }: { licenseId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        body.set("licenseId", licenseId);
        run(() => openDisputeAction(body));
      }}
    >
      <Label htmlFor={`dispute-${licenseId}`}>Dispute this license</Label>
      <Textarea id={`dispute-${licenseId}`} name="reason" required placeholder="The file was used outside the territory." />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Open dispute
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function ResolveDisputeForm({ disputeId }: { disputeId: string }) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const body = new FormData(event.currentTarget);
        const outcome = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "resolved";
        body.set("outcome", outcome);
        run(() => resolveDisputeAction(body));
      }}
    >
      <input type="hidden" name="disputeId" value={disputeId} />
      <Label htmlFor={`resolution-${disputeId}`}>Resolution note</Label>
      <Textarea id={`resolution-${disputeId}`} name="resolution" required />
      <div className="flex gap-2">
        <Button type="submit" name="outcome" value="resolved" size="sm" disabled={pending}>
          Resolve
        </Button>
        <Button type="submit" name="outcome" value="dismissed" size="sm" variant="secondary" disabled={pending}>
          Dismiss
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function PortfolioForm({
  headline,
  about,
  sampleUrls,
  feeNad,
  published,
}: {
  headline: string;
  about: string;
  sampleUrls: string;
  feeNad: string;
  published: boolean;
}) {
  const { error, pending, run } = useRefresh();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => savePortfolioAction(new FormData(event.currentTarget)));
      }}
    >
      <div>
        <Label htmlFor="portfolio-headline">Headline</Label>
        <Input id="portfolio-headline" name="headline" required defaultValue={headline} />
      </div>
      <div>
        <Label htmlFor="portfolio-about">About your UGC work</Label>
        <Textarea id="portfolio-about" name="about" defaultValue={about} />
      </div>
      <div>
        <Label htmlFor="portfolio-samples">Sample links, one per line</Label>
        <Textarea id="portfolio-samples" name="sampleUrls" defaultValue={sampleUrls} placeholder="https://www.tiktok.com/@you/video/1" />
      </div>
      <div>
        <Label htmlFor="portfolio-fee">Typical fee per video (N$)</Label>
        <Input id="portfolio-fee" name="feeNad" defaultValue={feeNad} inputMode="decimal" />
      </div>
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={published} />
        Publish this portfolio
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving" : "Save portfolio"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
