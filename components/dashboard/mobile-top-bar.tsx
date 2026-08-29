"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, Settings } from "lucide-react";

import { getBackHref, getScreenTitle } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";

export function MobileTopBar({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const backHref = getBackHref(pathname);
  const title = getScreenTitle(pathname);
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur-xl md:hidden">
      <div
        className="flex h-12 items-center gap-2 px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {backHref ? (
          <button
            type="button"
            onClick={() => router.push(backHref)}
            className="tab-press -ml-1 flex size-11 items-center justify-center rounded-xl text-foreground active:bg-surface-2"
            aria-label="Go back"
          >
            <ChevronLeft className="size-6" strokeWidth={1.75} />
          </button>
        ) : (
          <div className="w-11" aria-hidden />
        )}

        <h1
          className={cn(
            "min-w-0 flex-1 truncate text-center font-display text-[1.35rem] leading-none tracking-tight text-foreground",
          )}
        >
          {title}
        </h1>

        <Link
          href="/dashboard/settings"
          className="tab-press flex size-11 items-center justify-center rounded-xl active:bg-surface-2"
          aria-label="Settings"
        >
          {initials ? (
            <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-2 text-[11px] font-semibold tracking-tight text-foreground">
              {initials}
            </span>
          ) : (
            <Settings className="size-5 text-muted" strokeWidth={1.75} />
          )}
        </Link>
      </div>
    </header>
  );
}
