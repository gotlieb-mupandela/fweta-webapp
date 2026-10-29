import Link from "next/link";

import { saveTokenPreferencesAction } from "@/app/actions/email-preferences";
import { pageParam } from "@/lib/email/preference-form";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getProfileById } from "@/lib/auth/session";
import { verifyPrefsToken } from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

export default async function EmailPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = pageParam(params.token);
  const userId = token ? await verifyPrefsToken(token) : null;
  const profile = userId ? await getProfileById(userId) : null;

  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-6 md:p-8">
        <Logo href="https://fweta.com" size="sm" />
        <h1 className="mt-6 font-display text-4xl tracking-tight">Email preferences</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          These switches control email only. The notification bell in your dashboard stays on.
        </p>

        {pageParam(params.error) === "expired" || (token && !userId) ? (
          <Expired />
        ) : pageParam(params.error) === "missing" || (userId && !profile) ? (
          <p className="mt-6 text-sm text-muted">We could not find that account.</p>
        ) : !token ? (
          <div className="mt-6 space-y-3 text-sm text-muted">
            <p>Open the link from an fweta email, or manage preferences after you sign in.</p>
            <Link href="/login?next=/dashboard/settings/notifications" className="font-medium text-foreground">
              Sign in
            </Link>
          </div>
        ) : profile ? (
          <form action={saveTokenPreferencesAction} className="mt-6 space-y-4">
            <input type="hidden" name="token" value={token} />
            {pageParam(params.saved) === "1" ? (
              <p className="rounded-2xl bg-success-soft px-3 py-2 text-sm text-success">Preferences saved.</p>
            ) : null}
            <p className="text-sm text-muted">Updating mail for {profile.email}.</p>
            <PrefRow
              name="notifyEmail"
              label="Email notifications"
              hint="Campaigns, submissions, deposits, and budget alerts. This is the master switch."
              defaultChecked={profile.notifyEmail}
            />
            <PrefRow
              name="notifyBookings"
              label="Booking updates"
              hint="Requests, acceptances, declines, and completed work. Applies when email is on."
              defaultChecked={profile.notifyBookings}
            />
            <PrefRow
              name="notifyWithdrawals"
              label="Withdrawal updates"
              hint="When a payout is requested, returned, or paid. Applies when email is on."
              defaultChecked={profile.notifyWithdrawals}
            />
            <Button type="submit" className="w-full">
              Save preferences
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function PrefRow({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-border px-3 py-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
      </span>
    </label>
  );
}

function Expired() {
  return (
    <div className="mt-6 space-y-3 text-sm text-muted">
      <p>This link has expired. Sign in to update what we email you.</p>
      <Link href="/login?next=/dashboard/settings/notifications" className="font-medium text-foreground">
        Sign in
      </Link>
    </div>
  );
}
