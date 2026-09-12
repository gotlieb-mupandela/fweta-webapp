import { redirect } from "next/navigation";

import { adminListUsers } from "@/app/actions/settings";
import { UserSuspendButton } from "@/components/forms/user-suspend-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    redirect("/dashboard");
  }

  const users = await adminListUsers();

  return (
    <div className="dash-stack">
      <PageHeader title="Users" description="Platform accounts and suspension controls." />

      {users.length === 0 ? (
        <EmptyState title="No users" description="Accounts will appear here after signup." />
      ) : (
        <ul className="space-y-2.5">
          {users.map((u) => (
            <li key={u.id} className="list-row flex-wrap">
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
      )}
    </div>
  );
}
