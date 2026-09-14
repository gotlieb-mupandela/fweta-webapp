import { LoginForm } from "@/components/auth/login-form";
import { seedDemoAccounts } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function safeNextPath(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  try {
    await seedDemoAccounts();
  } catch {
    // ignore seed failures — form still works for new signups
  }

  const params = await searchParams;
  return <LoginForm nextPath={safeNextPath(params.next)} />;
}
