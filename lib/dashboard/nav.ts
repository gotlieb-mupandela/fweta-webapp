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
  Mail,
  LifeBuoy,
  Bell,
  Trophy,
  CircleDollarSign,
  Flag,
} from "lucide-react";

import type { UserRole } from "@/types/enums";

export type NavItem = {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  match?: "exact" | "prefix";
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type RoleNavConfig = {
  tabs: NavItem[];
  groups: NavGroup[];
};

const overview = (href: string): NavItem => ({
  href,
  label: "Overview",
  shortLabel: "Home",
  icon: LayoutDashboard,
  match: "exact",
});

const settingsItem: NavItem = {
  href: "/dashboard/settings",
  label: "Settings",
  shortLabel: "Settings",
  icon: Settings,
  match: "prefix",
};

const helpItem: NavItem = {
  href: "/help",
  label: "Help",
  shortLabel: "Help",
  icon: LifeBuoy,
  match: "prefix",
};

const notificationsItem: NavItem = {
  href: "/dashboard/notifications",
  label: "Notifications",
  shortLabel: "Alerts",
  icon: Bell,
  match: "prefix",
};

const walletItem: NavItem = {
  href: "/dashboard/settings/wallet",
  label: "Wallet",
  shortLabel: "Wallet",
  icon: Wallet,
  match: "exact",
};

const withdrawItem: NavItem = {
  href: "/dashboard/settings/withdraw",
  label: "Payouts",
  shortLabel: "Payouts",
  icon: Landmark,
  match: "prefix",
};

export const ROLE_NAV: Record<UserRole, RoleNavConfig> = {
  clipper: {
    tabs: [
      overview("/dashboard/clipper"),
      {
        href: "/dashboard/clipper/campaigns",
        label: "Discover",
        shortLabel: "Discover",
        icon: Sparkles,
        match: "prefix",
      },
      {
        href: "/dashboard/clipper/submissions",
        label: "Clips",
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
      settingsItem,
    ],
    groups: [
      { label: "Home", items: [overview("/dashboard/clipper")] },
      {
        label: "Clips",
        items: [
          {
            href: "/dashboard/clipper/campaigns",
            label: "Discover",
            shortLabel: "Discover",
            icon: Sparkles,
            match: "prefix",
          },
          {
            href: "/dashboard/clipper/submissions",
            label: "My clips",
            shortLabel: "Clips",
            icon: FileText,
            match: "prefix",
          },
          {
            href: "/dashboard/clipper/leaderboard",
            label: "Leaderboard",
            shortLabel: "Ranks",
            icon: Trophy,
            match: "prefix",
          },
        ],
      },
      {
        label: "Money",
        items: [
          {
            href: "/dashboard/clipper/earnings",
            label: "Earnings",
            shortLabel: "Earnings",
            icon: BadgeDollarSign,
            match: "prefix",
          },
          walletItem,
          withdrawItem,
        ],
      },
      {
        label: "Account",
        items: [
          {
            href: "/dashboard/settings/accounts",
            label: "Connected accounts",
            shortLabel: "Accounts",
            icon: Users,
            match: "prefix",
          },
          notificationsItem,
          settingsItem,
          helpItem,
        ],
      },
    ],
  },
  influencer: {
    tabs: [
      overview("/dashboard/influencer"),
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
      settingsItem,
    ],
    groups: [
      { label: "Home", items: [overview("/dashboard/influencer")] },
      {
        label: "Bookings",
        items: [
          {
            href: "/dashboard/influencer/bookings",
            label: "Bookings",
            shortLabel: "Bookings",
            icon: Briefcase,
            match: "prefix",
          },
          {
            href: "/dashboard/influencer/rate-cards",
            label: "Rate card",
            shortLabel: "Rates",
            icon: ClipboardList,
            match: "prefix",
          },
          {
            href: "/dashboard/influencer/profile",
            label: "Public profile",
            shortLabel: "Profile",
            icon: Users,
            match: "prefix",
          },
        ],
      },
      {
        label: "Money",
        items: [
          {
            href: "/dashboard/influencer/earnings",
            label: "Earnings",
            shortLabel: "Earnings",
            icon: BadgeDollarSign,
            match: "prefix",
          },
          walletItem,
          withdrawItem,
        ],
      },
      { label: "Account", items: [notificationsItem, settingsItem, helpItem] },
    ],
  },
  brand: {
    tabs: [
      overview("/dashboard/brand"),
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
      settingsItem,
    ],
    groups: [
      { label: "Home", items: [overview("/dashboard/brand")] },
      {
        label: "Campaigns",
        items: [
          {
            href: "/dashboard/brand/campaigns",
            label: "Campaigns",
            shortLabel: "Campaigns",
            icon: Sparkles,
            match: "prefix",
          },
          {
            href: "/dashboard/brand/analytics",
            label: "Analytics",
            shortLabel: "Analytics",
            icon: BarChart3,
            match: "prefix",
          },
        ],
      },
      {
        label: "Hire",
        items: [
          {
            href: "/dashboard/brand/bookings",
            label: "Bookings",
            shortLabel: "Bookings",
            icon: CalendarDays,
            match: "prefix",
          },
        ],
      },
      {
        label: "Money",
        items: [
          walletItem,
          {
            href: "/dashboard/brand/deposits",
            label: "Pay-ins",
            shortLabel: "Pay-ins",
            icon: Landmark,
            match: "prefix",
          },
        ],
      },
      {
        label: "Team",
        items: [
          {
            href: "/dashboard/brand/team",
            label: "Team",
            shortLabel: "Team",
            icon: Users,
            match: "prefix",
          },
        ],
      },
      { label: "Account", items: [notificationsItem, settingsItem, helpItem] },
    ],
  },
  admin: {
    tabs: [
      overview("/dashboard/admin"),
      {
        href: "/dashboard/admin/payins",
        label: "Pay-ins",
        shortLabel: "Pay-ins",
        icon: CircleDollarSign,
        match: "prefix",
      },
      {
        href: "/dashboard/admin/views",
        label: "View checks",
        shortLabel: "Views",
        icon: BarChart3,
        match: "prefix",
      },
      {
        href: "/dashboard/admin/withdrawals",
        label: "Payouts",
        shortLabel: "Payouts",
        icon: Landmark,
        match: "prefix",
      },
      settingsItem,
    ],
    groups: [
      { label: "Home", items: [overview("/dashboard/admin")] },
      {
        label: "Money",
        items: [
          {
            href: "/dashboard/admin/payins",
            label: "Pay-ins",
            shortLabel: "Pay-ins",
            icon: CircleDollarSign,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/withdrawals",
            label: "Payouts",
            shortLabel: "Payouts",
            icon: Landmark,
            match: "prefix",
          },
        ],
      },
      {
        label: "Review",
        items: [
          {
            href: "/dashboard/admin/views",
            label: "View checks",
            shortLabel: "Views",
            icon: BarChart3,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/fraud",
            label: "Flags",
            shortLabel: "Flags",
            icon: ShieldAlert,
            match: "prefix",
          },
        ],
      },
      {
        label: "People",
        items: [
          {
            href: "/dashboard/admin/users",
            label: "Users",
            shortLabel: "Users",
            icon: Users,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/onboarding",
            label: "Onboarding",
            shortLabel: "Setup",
            icon: ClipboardList,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/accounts",
            label: "Social accounts",
            shortLabel: "Accounts",
            icon: Flag,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/workspaces",
            label: "Workspaces",
            shortLabel: "Brands",
            icon: Briefcase,
            match: "prefix",
          },
        ],
      },
      {
        label: "Platform",
        items: [
          {
            href: "/dashboard/admin/stats",
            label: "Stats",
            shortLabel: "Stats",
            icon: BarChart3,
            match: "prefix",
          },
          {
            href: "/dashboard/admin/emails",
            label: "Emails",
            shortLabel: "Emails",
            icon: Mail,
            match: "prefix",
          },
        ],
      },
      { label: "Account", items: [notificationsItem, settingsItem, helpItem] },
    ],
  },
};

export function navItemsFor(role: UserRole): NavItem[] {
  return (ROLE_NAV[role] ?? ROLE_NAV.clipper).groups.flatMap((group) => group.items);
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function findActiveNav(pathname: string, items: NavItem[]): NavItem | undefined {
  const matches = items.filter((item) => isNavActive(pathname, item));
  return matches.sort((a, b) => b.href.length - a.href.length)[0];
}

export function getBackHref(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 2) return null;
  if (parts.length === 3 && parts[1] !== "settings") return null;
  if (parts[1] === "settings" && parts.length > 2) return "/dashboard/settings";
  return `/${parts.slice(0, -1).join("/")}`;
}

const TITLE_OVERRIDES: Record<string, string> = {
  "/dashboard/brand": "Overview",
  "/dashboard/brand/campaigns": "Campaigns",
  "/dashboard/brand/campaigns/new": "New campaign",
  "/dashboard/brand/bookings": "Bookings",
  "/dashboard/brand/analytics": "Analytics",
  "/dashboard/brand/deposits": "Pay-ins",
  "/dashboard/brand/team": "Team",
  "/dashboard/clipper": "Overview",
  "/dashboard/clipper/campaigns": "Discover",
  "/dashboard/clipper/submissions": "My clips",
  "/dashboard/clipper/earnings": "Earnings",
  "/dashboard/clipper/leaderboard": "Leaderboard",
  "/dashboard/influencer": "Overview",
  "/dashboard/influencer/bookings": "Bookings",
  "/dashboard/influencer/rate-cards": "Rate card",
  "/dashboard/influencer/profile": "Public profile",
  "/dashboard/influencer/earnings": "Earnings",
  "/dashboard/admin": "Overview",
  "/dashboard/admin/withdrawals": "Payouts",
  "/dashboard/admin/users": "Users",
  "/dashboard/admin/fraud": "Flags",
  "/dashboard/admin/onboarding": "Onboarding",
  "/dashboard/admin/payins": "Pay-ins",
  "/dashboard/admin/views": "View checks",
  "/dashboard/admin/accounts": "Social accounts",
  "/dashboard/admin/workspaces": "Workspaces",
  "/dashboard/admin/stats": "Stats",
  "/dashboard/admin/emails": "Emails",
  "/dashboard/notifications": "Notifications",
  "/dashboard/settings": "Settings",
  "/dashboard/settings/profile": "Profile",
  "/dashboard/settings/roles": "Roles",
  "/dashboard/settings/notifications": "Notifications",
  "/dashboard/settings/security": "Security",
  "/dashboard/settings/wallet": "Wallet",
  "/dashboard/settings/payout": "Payout method",
  "/dashboard/settings/withdraw": "Payouts",
  "/dashboard/settings/accounts": "Connected accounts",
  "/help": "Help",
};

export function getScreenTitle(pathname: string): string {
  if (TITLE_OVERRIDES[pathname]) return TITLE_OVERRIDES[pathname];
  if (/^\/dashboard\/admin\/users\/[^/]+$/.test(pathname)) return "User";
  if (/\/campaigns\/[^/]+\/edit$/.test(pathname)) return "Edit campaign";
  if (/\/campaigns\/[^/]+\/submissions$/.test(pathname)) return "Review queue";
  if (/\/campaigns\/[^/]+$/.test(pathname)) return "Campaign";
  const last = pathname.split("/").filter(Boolean).pop() || "fweta";
  return last.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
