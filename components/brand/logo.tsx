import Link from "next/link";

import { cn } from "@/lib/utils";

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className="font-display text-[1.65rem] italic leading-none text-gold"
        style={{ fontWeight: 600 }}
      >
        f
      </span>
      <span className="text-[1.05rem] font-semibold tracking-tight text-foreground">
        fweta
      </span>
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
