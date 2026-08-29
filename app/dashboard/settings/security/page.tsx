import { redirect } from "next/navigation";

import { PasswordChangeForm } from "@/components/forms/password-change-form";
import { PageHeader } from "@/components/ui/card";
import { getSession } from "@/lib/auth/session";

export default async function SettingsSecurityPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div>
      <PageHeader title="Security" description="Update your account password." />
      <PasswordChangeForm />
    </div>
  );
}
