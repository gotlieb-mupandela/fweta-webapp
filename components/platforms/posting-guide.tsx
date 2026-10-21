import { PlatformChip } from "@/components/platforms/platform-chip";
import { PLATFORM_GUIDES } from "@/lib/platforms/guides";
import type { SocialPlatform } from "@/types/enums";

export function PostingGuide({ platforms }: { platforms: SocialPlatform[] }) {
  if (platforms.length === 0) return null;
  return (
    <ul className={platforms.length === 1 ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
      {platforms.map((platform) => {
        const guide = PLATFORM_GUIDES[platform];
        return (
          <li key={platform} className="panel p-4 md:p-5">
            <PlatformChip platform={platform} />
            <h3 className="mt-3 font-display text-2xl tracking-tight">{guide.surface}</h3>
            <dl className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              <div>
                <dt className="inline font-medium text-foreground">Frame. </dt>
                <dd className="inline">{guide.frame}. {guide.length}.</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Open. </dt>
                <dd className="inline">{guide.hook}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Caption. </dt>
                <dd className="inline">{guide.caption}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-foreground">Submit. </dt>
                <dd className="inline">{guide.submit}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
