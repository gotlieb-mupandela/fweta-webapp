import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { usageLabel } from "@/lib/licensing/hub";
import { formatMoney } from "@/lib/utils";

export default async function AdminLicensesPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) redirect("/dashboard");
  const store = await readStore();
  const licenses = [...store.contentLicenses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="dash-stack">
      <PageHeader
        title="Licenses"
        description="Every approved UGC file, with the fee that moved to the creator wallet."
      />
      {licenses.length === 0 ? (
        <p className="text-sm text-muted">No licenses yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {licenses.map((license) => (
            <li key={license.id} className="list-row text-sm">
              <div>
                <p className="font-medium">{license.title}</p>
                <p className="text-xs text-muted">
                  {license.brandName} · {license.creatorName} · {usageLabel(license.usage)} · {license.territory} · {license.startsAt.slice(0, 10)} to {license.endsAt.slice(0, 10)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">{formatMoney(license.feeCents)}</p>
                <Link href={`/api/licenses/${license.id}`} className="text-xs text-gold-deep hover:underline">
                  Summary
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
