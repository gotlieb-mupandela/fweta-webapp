import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

const MARK_SRC = "/brand/fweta-mark.webp";

/** Official mark is ~531×581 — keep aspect when sizing by height. */
const MARK_ASPECT = 531 / 581;

const SIZES = {
  sm: 28,
  md: 32,
  lg: 56,
} as const;

export function Logo({
  className,
  href = "/login",
  light = false,
  size = "md",
  markOnly = false,
}: {
  className?: string;
  href?: string;
  /** Dark brand panels — white wordmark beside the gold mark. */
  light?: boolean;
  size?: keyof typeof SIZES;
  /** Chrome-tight slots (e.g. mobile top bar). */
  markOnly?: boolean;
}) {
  const markH = SIZES[size];
  const markW = Math.round(markH * MARK_ASPECT);

  const content = (
    <>
      <Image
        src={MARK_SRC}
        alt=""
        width={markW}
        height={markH}
        className="shrink-0 object-contain"
        priority={size === "lg"}
        aria-hidden
      />
      {!markOnly ? (
        <span
          className={cn(
            "font-semibold tracking-tight",
            size === "lg" ? "text-xl" : size === "sm" ? "text-[0.95rem]" : "text-[1.05rem]",
            light ? "text-white" : "text-foreground",
          )}
        >
          fweta
        </span>
      ) : null}
    </>
  );

  const classes = cn("inline-flex items-center gap-2", className);
  const external = href.startsWith("http");

  if (external) {
    return (
      <a href={href} className={classes} aria-label="fweta">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} aria-label="fweta">
      {content}
    </Link>
  );
}

export function CheckCapsule({ children }: { children: React.ReactNode }) {
  return (
    <div className="capsule flex items-center gap-3 px-4 py-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold-soft text-gold">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3 7.2L5.8 10L11 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}
