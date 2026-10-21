import { adminListUsers } from "@/app/actions/settings";
import { getSession } from "@/lib/auth/session";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    return new Response("Admin only.", { status: 403 });
  }

  const users = await adminListUsers();
  const lines = [
    "name,email,primaryRole,roles,suspended,createdAt",
    ...users.map((user) =>
      [
        csvCell(user.displayName),
        csvCell(user.email),
        csvCell(user.primaryRole),
        csvCell(user.roles.join(" ")),
        user.suspended ? "yes" : "no",
        csvCell(user.createdAt),
      ].join(","),
    ),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=fweta-users.csv",
    },
  });
}
