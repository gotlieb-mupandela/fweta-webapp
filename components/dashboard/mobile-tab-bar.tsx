"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROLE_NAV, isNavActive } from "@/lib/dashboard/nav";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/enums";

export function MobileTabBar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const tabs = (ROLE_NAV[role] ?? ROLE_NAV.clipper).tabs;

  return (
    <nav
      aria-label="Primary"
      className="mobile-tab-bar fixed inset-x-0 bottom-0 z-50 md:hidden"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1.5 pt-1.5">
        {tabs.map((tab) => {
          const active = isNavActive(pathname, tab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "tab-press flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 transition duration-200",
                active ? "text-foreground" : "text-muted-light",
              )}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-xl transition duration-200",
                  active && "bg-gold-soft text-foreground",
                )}
              >
                <Icon
                  className={cn("size-[20px]", active && "text-gold")}
                  strokeWidth={active ? 2.15 : 1.75}
                  aria-hidden
                />
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[10px] font-medium tracking-tight",
                  active && "text-foreground",
                )}
              >
                {tab.shortLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
