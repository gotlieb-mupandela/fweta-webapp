import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { readPasswordResetToken, resetGrantStatus } from "@/lib/auth/password-reset";
import { getProfileById } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

/** Check the link up front (without using it) so a spent or expired link shows "Link expired" right away. */
async function usableToken(raw: string): Promise<string> {
  const token = await readPasswordResetToken(raw);
  if (!token) return "";
  const profile = await getProfileById(token.userId).catch(() => null);
  if (!profile || profile.suspended) return "";
  return resetGrantStatus(profile.passwordReset, token.jti, Date.now()) === "ok" ? raw : "";
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const raw = (params.token ?? "").trim().slice(0, 4000);
  return <ResetPasswordForm token={raw ? await usableToken(raw) : ""} />;
}
