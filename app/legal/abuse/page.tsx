import type { Metadata } from "next";
import Link from "next/link";

import { ABUSE_RULES } from "@/lib/rewards/content-rewards";

export const metadata: Metadata = {
  title: "Abuse rules",
  description: "Rules for clips, views, and appeals on fweta.",
};

export default function AbuseRulesPage() {
  return (
    <article className="legal-copy mx-auto max-w-3xl space-y-6 text-sm leading-relaxed text-muted">
      <h1 className="font-display text-4xl tracking-tight text-foreground">Abuse rules</h1>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-light">
        Windhoek · Applied to every clip · Last updated 17 October 2026
      </p>
      <p>
        These rules sit on top of the{" "}
        <Link href="/legal/creator-terms" className="text-foreground underline-offset-2 hover:underline">
          creator terms
        </Link>
        . A brand can flag a clip. An admin can uphold or dismiss that flag. Settled wallet money is not clawed back by a later flag.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        {ABUSE_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <h2 className="font-display text-2xl text-foreground">Flag reasons</h2>
      <p>View spike, duplicate, ownership, paid promotion, or other. The reason is visible on the clip.</p>
      <h2 className="font-display text-2xl text-foreground">One appeal</h2>
      <p>
        A creator can appeal a flagged clip once, with a short note. The appeal does not create a second clip and it does not move money by itself.
      </p>
      <p>
        Questions go through{" "}
        <Link href="/dashboard/support" className="text-foreground underline-offset-2 hover:underline">
          in-app support
        </Link>
        .
      </p>
    </article>
  );
}
