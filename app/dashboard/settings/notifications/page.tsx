import { redirect } from "next/navigation";

import { NotificationsForm } from "@/components/forms/notifications-form";
import { PageHeader } from "@/components/ui/card";
import { getProfileById, getSession } from "@/lib/auth/session";

export default async function SettingsNotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const profile = await getProfileById(session.id);
  if (!profile) redirect("/login");

  return (
    <div>
      <PageHeader title="Notifications" description="Control email and alert preferences." />
      <NotificationsForm
        notifyEmail={profile.notifyEmail}
        notifyWithdrawals={profile.notifyWithdrawals}
        notifyBookings={profile.notifyBookings}
      />
    </div>
  );
}
