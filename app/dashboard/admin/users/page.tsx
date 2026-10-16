import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";

import { adminListUsers } from "@/app/actions/settings";
import { UserSuspendButton } from "@/components/forms/user-suspend-button";
import { AvatarCircle } from "@/components/ui/avatar-circle";
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
      <PageHeader
        title="Users"
        description="Open an account to review profile, money, and activity. Suspension stays on the row."
      />

      {users.length === 0 ? (
        <EmptyState title="No users" description="Accounts will appear here after signup." />
      ) : (
        <ul className="space-y-2.5">
          {users.map((u) => (
            <li key={u.id} className="list-row relative flex-wrap sm:flex-nowrap">
              <Link
                href={`/dashboard/admin/users/${u.id}`}
                className="absolute inset-0 rounded-[1.15rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                aria-label={`Open profile for ${u.displayName}`}
              />
              <div className="pointer-events-none flex min-w-0 flex-1 items-center gap-3">
                <AvatarCircle src={u.avatarUrl} name={u.displayName} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.displayName}</p>
                  <p className="truncate text-sm text-muted">{u.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge tone="gold">{u.primaryRole}</Badge>
                    {u.roles
                      .filter((role) => role !== u.primaryRole)
                      .map((role) => (
                        <Badge key={role} tone="neutral">
                          {role}
                        </Badge>
                      ))}
                    {u.suspended ? <Badge tone="danger">Suspended</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="pointer-events-none hidden text-muted-light sm:block" aria-hidden>
                <ChevronRight className="size-4" />
              </div>
              <div className="relative z-10">
                <UserSuspendButton userId={u.id} suspended={u.suspended} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
