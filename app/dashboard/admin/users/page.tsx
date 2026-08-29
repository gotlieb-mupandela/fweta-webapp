import { redirect } from "next/navigation";

import { adminListUsers } from "@/app/actions/settings";
import { UserSuspendButton } from "@/components/forms/user-suspend-button";
import { Badge, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const users = await adminListUsers();

  return (
    <div>
      <PageHeader title="Users" description="Platform accounts and suspension controls." />

      <ul className="space-y-3">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-white px-4 py-4"
          >
            <div>
              <p className="font-medium">{u.displayName}</p>
              <p className="text-sm text-muted">{u.email}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r} tone="neutral">
                    {r}
                  </Badge>
                ))}
                {u.suspended ? <Badge tone="danger">Suspended</Badge> : null}
              </div>
            </div>
            <UserSuspendButton userId={u.id} suspended={u.suspended} />
          </li>
        ))}
      </ul>
    </div>
  );
}
