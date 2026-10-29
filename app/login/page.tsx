import { LoginForm } from "@/components/auth/login-form";
import { seedDemoAccounts } from "@/lib/auth/session";

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
  searchParams: Promise<{ next?: string; email?: string; reset?: string }>;
}) {
  try {
    await seedDemoAccounts();
  } catch {
    // Seed failures must not hide the sign-in form.
  }

  const params = await searchParams;
  const email = (params.email ?? "").trim().slice(0, 200);
  const notice = params.reset === "1" ? "Password updated. Sign in with the new password." : null;
  return <LoginForm nextPath={safeNextPath(params.next)} email={email} notice={notice} />;
}
