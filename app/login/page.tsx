import { LoginForm } from "@/components/auth/login-form";
import { seedDemoAccounts } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  try {
    await seedDemoAccounts();
  } catch {
    // ignore seed failures — form still works for new signups
  }

  const params = await searchParams;
  return <LoginForm nextPath={params.next} oauthError={params.error} />;
}
