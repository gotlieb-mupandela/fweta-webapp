import { SignupForm } from "@/components/auth/signup-form";
import { seedDemoAccounts } from "@/lib/auth/session";

// Server-render with searchParams as props. Client `useSearchParams()` made
// Next.js bail out to CSR, which production showed as app/error.tsx.
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  try {
    await seedDemoAccounts();
  } catch {
    // ignore seed failures — form still works for new signups
  }

  const params = await searchParams;
  return <SignupForm presetRole={params.role} />;
}
