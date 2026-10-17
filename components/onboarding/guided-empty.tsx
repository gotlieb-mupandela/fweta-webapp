import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import type { Profile } from "@/lib/db/types";
import { emptyGuide, type EmptyGuideKind } from "@/lib/onboarding/model";

export function GuidedEmpty({
  kind,
  profile,
  hasPayout,
  fallback,
}: {
  kind: EmptyGuideKind;
  profile: Profile | null;
  hasPayout: boolean;
  fallback: { title: string; description: string; href: string; cta: string };
}) {
  const guide = profile ? emptyGuide(kind, profile, { hasPayout }) : null;
  const title = guide?.title ?? fallback.title;
  const description = guide?.description ?? fallback.description;
  const href = guide?.href ?? fallback.href;
  const cta = guide?.cta ?? fallback.cta;

  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Link href={href}>
          <Button size="sm">{cta}</Button>
        </Link>
      }
    />
  );
}
