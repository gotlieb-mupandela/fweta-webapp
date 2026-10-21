import { PlatformIcon } from "@/components/admin/platform-icon";
import { PLATFORM_GUIDES } from "@/lib/platforms/guides";
import { cn } from "@/lib/utils";
import type { SocialPlatform } from "@/types/enums";

export function PlatformChip({ platform }: { platform: SocialPlatform }) {
  const guide = PLATFORM_GUIDES[platform];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        guide.chipClass,
      )}
    >
      <PlatformIcon platform={platform} />
      {guide.label}
    </span>
  );
}
