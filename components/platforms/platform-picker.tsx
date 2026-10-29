import Link from "next/link";

import { PlatformIcon } from "@/components/admin/platform-icon";
import { PLATFORM_GUIDES, platformFilterHref, type DiscoverQuery } from "@/lib/platforms/guides";
import { PLATFORMS } from "@/lib/onboarding/model";
import { cn } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export function PlatformPicker({
  basePath,
  params,
}: {
  basePath: string;
  params: DiscoverQuery;
}) {
  const current = params.platform ?? "";
  const options = [{ id: "", label: "All" }, ...PLATFORMS.map((platform) => ({ id: platform, label: PLATFORM_GUIDES[platform].label }))];

  return (
    <ul className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {options.map((option) => {
        const active = current === option.id;
        const guide = option.id ? PLATFORM_GUIDES[option.id as keyof typeof PLATFORM_GUIDES] : null;
        return (
          <li key={option.id || "all"} className="min-w-0">
            <Link
              href={platformFilterHref(basePath, params, option.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-full min-h-[4.75rem] min-w-0 flex-col justify-between rounded-[1.35rem] border p-3 shadow-[var(--shadow-soft)]",
                active
                  ? "border-[#12110f] bg-[#12110f] text-white"
                  : "border-border bg-white panel-interactive",
              )}
            >
              <span className="flex min-w-0 items-center gap-2 wrap-anywhere text-sm font-medium">
                {option.id ? <PlatformIcon platform={option.id as SocialPlatform} /> : null}
                {option.label}
              </span>
              <span className={cn("wrap-anywhere text-[11px] leading-snug", active ? "text-white/75" : "text-muted")}>
                {guide ? `${guide.mark} · ${guide.length}` : "Every network"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
