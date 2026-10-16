import type { SocialPlatform } from "@/types/enums";

export function PlatformIcon({ platform }: { platform: SocialPlatform }) {
  const common = { viewBox: "0 0 24 24", className: "size-3.5", "aria-hidden": true as const };
  if (platform === "tiktok") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M14.5 3c.4 2.4 1.8 4.1 4.1 4.4v2.5c-1.4 0-2.7-.4-3.9-1.2v6.6c0 3.3-2.6 5.9-6.1 5.9S2.5 18.6 2.5 15.3 5.1 9.4 8.6 9.4c.3 0 .7 0 1 .1v2.7c-.3-.1-.6-.2-1-.2-1.8 0-3.3 1.5-3.3 3.3s1.5 3.3 3.3 3.3 3.2-1.4 3.2-3.3V3h2.7Z" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg {...common} fill="currentColor">
        <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4a2.5 2.5 0 0 0-1.8 1.8C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10.2 15.2V8.8L15.5 12l-5.3 3.2Z" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="currentColor">
      <path d="M14.7 10.3 22.2 2h-1.8l-6.5 7.2L8.7 2H2.2l7.9 11.1L2.2 22h1.8l6.9-7.7L15.5 22h6.5l-7.3-11.7Zm-2.4 2.7-.8-1.1L4.7 3.3h2.7l5.1 7.1.8 1.1 6.7 9.2h-2.7l-5.4-7.7Z" />
    </svg>
  );
}

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  tiktok: "TikTok",
  youtube: "YouTube",
  instagram: "Instagram",
  x: "X",
};
