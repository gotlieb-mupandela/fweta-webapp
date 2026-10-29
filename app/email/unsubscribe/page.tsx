import Link from "next/link";

import { confirmUnsubscribeAction } from "@/app/actions/email-preferences";
import { pageParam } from "@/lib/email/preference-form";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { getProfileById } from "@/lib/auth/session";
import { parseEmailScope, unsubscribeLabel, verifyPrefsToken } from "@/lib/email/preferences";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

const COPY: Record<string, { title: string; body: string }> = {
  email: {
    title: "Turn off all fweta emails?",
    body: "You will stop receiving campaign, booking, payout, and account emails. In-app alerts in the bell stay on. You can turn email back on whenever you like.",
  },
  bookings: {
    title: "Turn off booking emails?",
    body: "Campaign and payout emails stay as they are. In-app booking alerts stay on.",
  },
  withdrawals: {
    title: "Turn off withdrawal emails?",
    body: "You will not get email when a payout is requested, returned, or paid. The bell will still show it.",
  },
};

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = pageParam(params.token);
  const scope = parseEmailScope(pageParam(params.scope, 20)) ?? "email";
  const userId = token ? await verifyPrefsToken(token) : null;
  const profile = userId ? await getProfileById(userId) : null;
  const copy = COPY[scope];
  const done = pageParam(params.done) === "1";

  return (
    <div className="bg-atmosphere flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="panel w-full max-w-md p-6 md:p-8">
        <Logo href="https://fweta.com" size="sm" />
        <h1 className="mt-6 font-display text-4xl tracking-tight">
          {done ? "You are unsubscribed." : copy.title}
        </h1>

        {pageParam(params.error) === "expired" || (token && !userId) ? (
          <div className="mt-4 space-y-3 text-sm text-muted">
            <p>This link has expired. Sign in to update what we email you.</p>
            <Link href="/login?next=/dashboard/settings/notifications" className="font-medium text-foreground">
              Sign in
            </Link>
          </div>
        ) : pageParam(params.error) === "missing" || (userId && !profile) ? (
          <p className="mt-4 text-sm text-muted">We could not find that account.</p>
        ) : !token ? (
          <div className="mt-4 space-y-3 text-sm text-muted">
            <p>Open the unsubscribe link from an fweta email.</p>
            <Link href="/login?next=/dashboard/settings/notifications" className="font-medium text-foreground">
              Sign in to manage email
            </Link>
          </div>
        ) : done ? (
          <div className="mt-4 space-y-4 text-sm text-muted">
            <p>
              {scope === "email"
                ? "All fweta emails are off for this account."
                : `${unsubscribeLabel(scope)} is done.`}{" "}
              Your dashboard notifications are unchanged.
            </p>
            <Link
              href={`/email/preferences?token=${encodeURIComponent(token)}`}
              className="font-medium text-foreground"
            >
              Review email preferences
            </Link>
          </div>
        ) : (
          <form action={confirmUnsubscribeAction} className="mt-4 space-y-4">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="scope" value={scope} />
            <p className="text-sm leading-relaxed text-muted">{copy.body}</p>
            {profile ? <p className="text-sm text-muted">Account: {profile.email}</p> : null}
            <Button type="submit" className="w-full">
              {unsubscribeLabel(scope)}
            </Button>
            <Link
              href={`/email/preferences?token=${encodeURIComponent(token)}`}
              className="block text-center text-sm font-medium text-foreground"
            >
              Manage all preferences instead
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
