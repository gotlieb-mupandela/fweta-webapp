import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Briefcase,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
  Wallet,
  ShieldAlert,
  FileText,
  CalendarDays,
  BadgeDollarSign,
  Landmark,
} from "lucide-react";

import type { UserRole } from "@/types/enums";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Match nested paths under this href as active */
  match?: "exact" | "prefix";
};

export type RoleNavConfig = {
  /** Mobile bottom tabs — max 5 */
  tabs: NavItem[];
  /** Extra desktop sidebar links (beyond tabs) */
  sidebarExtra: NavItem[];
};

export const ROLE_NAV: Record<UserRole, RoleNavConfig> = {
  brand: {
    tabs: [
      {
        href: "/dashboard/brand",
        label: "Overview",
        shortLabel: "Home",
        icon: LayoutDashboard,
        match: "exact",
      },
      {
        href: "/dashboard/brand/campaigns",
        label: "Campaigns",
        shortLabel: "Campaigns",
        icon: Sparkles,
        match: "prefix",
      },
      {
        href: "/dashboard/brand/bookings",
        label: "Bookings",
        shortLabel: "Bookings",
        icon: CalendarDays,
        match: "prefix",
      },
      {
        href: "/dashboard/brand/analytics",
        label: "Analytics",
        shortLabel: "Analytics",
        icon: BarChart3,
        match: "prefix",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        shortLabel: "Settings",
        icon: Settings,
        match: "prefix",
      },
    ],
    sidebarExtra: [
      {
        href: "/dashboard/brand/deposits",
        label: "Deposits",
        shortLabel: "Deposits",
        icon: Landmark,
        match: "prefix",
      },
      {
        href: "/dashboard/settings/wallet",
        label: "Wallet",
        shortLabel: "Wallet",
        icon: Wallet,
        match: "prefix",
      },
    ],
  },
  clipper: {
    tabs: [
      {
        href: "/dashboard/clipper",
        label: "Overview",
        shortLabel: "Home",
        icon: LayoutDashboard,
        match: "exact",
      },
      {
        href: "/dashboard/clipper/campaigns",
        label: "Campaigns",
        shortLabel: "Campaigns",
        icon: Sparkles,
        match: "prefix",
      },
      {
        href: "/dashboard/clipper/submissions",
        label: "Submissions",
        shortLabel: "Clips",
        icon: FileText,
        match: "prefix",
      },
      {
        href: "/dashboard/clipper/earnings",
        label: "Earnings",
        shortLabel: "Earnings",
        icon: BadgeDollarSign,
        match: "prefix",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        shortLabel: "Settings",
        icon: Settings,
        match: "prefix",
      },
    ],
    sidebarExtra: [
      {
        href: "/dashboard/settings/wallet",
        label: "Wallet",
        shortLabel: "Wallet",
        icon: Wallet,
        match: "prefix",
      },
      {
        href: "/dashboard/settings/withdraw",
        label: "Withdraw",
        shortLabel: "Withdraw",
        icon: Landmark,
        match: "prefix",
      },
    ],
  },
  influencer: {
    tabs: [
      {
        href: "/dashboard/influencer",
        label: "Overview",
        shortLabel: "Home",
        icon: LayoutDashboard,
        match: "exact",
      },
      {
        href: "/dashboard/influencer/bookings",
        label: "Bookings",
        shortLabel: "Bookings",
        icon: Briefcase,
        match: "prefix",
      },
      {
        href: "/dashboard/influencer/rate-cards",
        label: "Rates",
        shortLabel: "Rates",
        icon: ClipboardList,
        match: "prefix",
      },
      {
        href: "/dashboard/influencer/earnings",
        label: "Earnings",
        shortLabel: "Earnings",
        icon: BadgeDollarSign,
        match: "prefix",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        shortLabel: "Settings",
        icon: Settings,
        match: "prefix",
      },
    ],
    sidebarExtra: [
      {
        href: "/dashboard/influencer/profile",
        label: "Public profile",
        shortLabel: "Profile",
        icon: Users,
        match: "prefix",
      },
      {
        href: "/dashboard/settings/wallet",
        label: "Wallet",
        shortLabel: "Wallet",
        icon: Wallet,
        match: "prefix",
      },
    ],
  },
  admin: {
    tabs: [
      {
        href: "/dashboard/admin",
        label: "Overview",
        shortLabel: "Home",
        icon: LayoutDashboard,
        match: "exact",
      },
      {
        href: "/dashboard/admin/withdrawals",
        label: "Withdrawals",
        shortLabel: "Payouts",
        icon: Landmark,
        match: "prefix",
      },
      {
        href: "/dashboard/admin/users",
        label: "Users",
        shortLabel: "Users",
        icon: Users,
        match: "prefix",
      },
      {
        href: "/dashboard/admin/fraud",
        label: "Fraud",
        shortLabel: "Fraud",
        icon: ShieldAlert,
        match: "prefix",
      },
      {
        href: "/dashboard/settings",
        label: "Settings",
        shortLabel: "Settings",
        icon: Settings,
        match: "prefix",
      },
    ],
    sidebarExtra: [
      {
        href: "/dashboard/admin/stats",
        label: "Stats",
        shortLabel: "Stats",
        icon: BarChart3,
        match: "prefix",
      },
    ],
  },
};

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function findActiveNav(pathname: string, items: NavItem[]): NavItem | undefined {
  // Prefer longest matching href so nested routes don't highlight Overview
  const matches = items.filter((item) => isNavActive(pathname, item));
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}

/** Nested / form pages get a back affordance in the mobile top bar */
export function getBackHref(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  // /dashboard/:role or /dashboard/settings — top level
  if (parts.length <= 2) return null;
  // /dashboard/:role/:section — still a primary screen
  if (parts.length === 3 && parts[1] !== "settings") return null;
  // /dashboard/settings/:page → settings
  if (parts[1] === "settings" && parts.length > 2) {
    return "/dashboard/settings";
  }
  // Pop one segment (detail → list, edit → detail)
  return `/${parts.slice(0, -1).join("/")}`;
}

const TITLE_OVERRIDES: Record<string, string> = {
  "/dashboard/brand": "Overview",
  "/dashboard/brand/campaigns": "Campaigns",
  "/dashboard/brand/campaigns/new": "New campaign",
  "/dashboard/brand/bookings": "Bookings",
  "/dashboard/brand/analytics": "Analytics",
  "/dashboard/brand/deposits": "Deposits",
  "/dashboard/clipper": "Overview",
  "/dashboard/clipper/campaigns": "Campaigns",
  "/dashboard/clipper/submissions": "Submissions",
  "/dashboard/clipper/earnings": "Earnings",
  "/dashboard/influencer": "Overview",
  "/dashboard/influencer/bookings": "Bookings",
  "/dashboard/influencer/rate-cards": "Rate cards",
  "/dashboard/influencer/profile": "Profile",
  "/dashboard/influencer/earnings": "Earnings",
  "/dashboard/admin": "Overview",
  "/dashboard/admin/withdrawals": "Withdrawals",
  "/dashboard/admin/users": "Users",
  "/dashboard/admin/fraud": "Fraud",
  "/dashboard/admin/stats": "Stats",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/profile": "Profile",
  "/dashboard/settings/roles": "Roles",
  "/dashboard/settings/notifications": "Notifications",
  "/dashboard/settings/security": "Security",
  "/dashboard/settings/wallet": "Wallet",
  "/dashboard/settings/payout": "Payout method",
  "/dashboard/settings/withdraw": "Withdraw",
};

export function getScreenTitle(pathname: string): string {
  if (TITLE_OVERRIDES[pathname]) return TITLE_OVERRIDES[pathname];
  if (/\/campaigns\/[^/]+\/edit$/.test(pathname)) return "Edit campaign";
  if (/\/campaigns\/[^/]+\/submissions$/.test(pathname)) return "Submissions";
  if (/\/campaigns\/[^/]+$/.test(pathname)) return "Campaign";
  const last = pathname.split("/").filter(Boolean).pop() || "fweta";
  return last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
