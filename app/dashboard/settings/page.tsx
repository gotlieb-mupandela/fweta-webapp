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
      <ul className="space-y-3">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="block rounded-2xl border border-border bg-white px-4 py-4 hover:border-foreground/20"
            >
              <p className="font-medium">{l.label}</p>
              <p className="text-sm text-muted">{l.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
