import { LoginForm } from "@/components/auth/login-form";
import { ensureAdminAccount } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  try {
    await ensureAdminAccount();
  } catch {
    // Admin seed failures must not hide the sign-in form.
  }

  const params = await searchParams;
  return <LoginForm nextPath={safeNextPath(params.next)} />;
}
