import { LoginForm } from "@/components/auth/login-form";

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
  const params = await searchParams;
  return <LoginForm nextPath={safeNextPath(params.next)} />;
}
