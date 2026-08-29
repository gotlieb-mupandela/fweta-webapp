import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

const LINKS = [
  { href: "/dashboard/settings/profile", label: "Profile", desc: "Display name and bio" },
  { href: "/dashboard/settings/roles", label: "Roles", desc: "Brand, influencer, clipper" },
  { href: "/dashboard/settings/notifications", label: "Notifications", desc: "Email preferences" },
  { href: "/dashboard/settings/security", label: "Security", desc: "Change password" },
  { href: "/dashboard/settings/wallet", label: "Wallet", desc: "Balance overview" },
  { href: "/dashboard/settings/payout", label: "Payout method", desc: "Bank details for EFT" },
  { href: "/dashboard/settings/withdraw", label: "Withdraw", desc: "Request payout" },
];

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <PageHeader title="Settings" description={`Signed in as ${session.email}`} />
      <ul className="space-y-2">
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
    </div>
  );
}
