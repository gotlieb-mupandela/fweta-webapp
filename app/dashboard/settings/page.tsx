import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

const LINKS = [
  { href: "/dashboard/settings/profile", label: "Profile", desc: "Photo, display name, and bio" },
  { href: "/dashboard/settings/roles", label: "Roles", desc: "Choose which dashboards this login can open" },
  { href: "/dashboard/settings/accounts", label: "Connected accounts", desc: "Profiles you post from, plus the bio code" },
  { href: "/dashboard/settings/verification", label: "Bio code", desc: "Request a code and paste it into a social bio" },
  { href: "/dashboard/settings/notifications", label: "Email preferences", desc: "Which messages leave the app" },
  { href: "/dashboard/notifications", label: "Notification inbox", desc: "Alerts already sent to you" },
  { href: "/dashboard/settings/security", label: "Security", desc: "Change password" },
  { href: "/dashboard/settings/wallet", label: "Wallet", desc: "Available and pending balance" },
  { href: "/dashboard/settings/payout", label: "Payout method", desc: "Bank details for EFT" },
  { href: "/dashboard/settings/withdraw", label: "Payouts", desc: "Request a transfer from N$100" },
  { href: "/help", label: "Help", desc: "First campaign, first clip, first payout" },
];

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="dash-stack">
      <PageHeader title="Settings" description={`Signed in as ${session.email}`} />
      <ul className="space-y-2.5">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="list-row">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{l.label}</p>
                <p className="text-xs text-muted">{l.desc}</p>
              </div>
              <span className="text-muted-light" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="border-t border-border/70 pt-2 md:pt-3">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-light">
          Account
        </p>
        <form action={logoutAction}>
          <Button
            type="submit"
            variant="secondary"
            size="md"
            className="h-12 w-full justify-center gap-2 rounded-2xl border-border text-foreground hover:border-foreground/25 md:h-11 md:justify-start"
          >
            <LogOut className="size-4 text-muted" aria-hidden />
            Log out
          </Button>
        </form>
      </div>
    </div>
  );
}
