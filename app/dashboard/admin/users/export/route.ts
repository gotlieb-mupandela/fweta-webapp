import { getSession } from "@/lib/auth/session";
import { readStore } from "@/lib/db/store";
import { buildDirectory, directoryCsv, filterDirectory, isUserTab } from "@/lib/admin/directory";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.roles.includes("admin")) {
    return new Response("Admin only", { status: 403 });
  }

  const url = new URL(request.url);
  const tabParam = url.searchParams.get("tab") ?? "all";
  const tab = isUserTab(tabParam) ? tabParam : "all";
  const query = url.searchParams.get("q") ?? "";
  const store = await readStore();
  const csv = directoryCsv(filterDirectory(buildDirectory(store), tab, query));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="fweta-users.csv"',
      "Cache-Control": "no-store",
    },
  });
}
