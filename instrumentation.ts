export async function register() {
  const { assertHostedSecrets } = await import("@/lib/auth/secret");
  assertHostedSecrets();

  // Demo accounts are explicit startup work, not a side effect of /login.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { seedDemoAccounts } = await import("@/lib/auth/demo-seed");
  await seedDemoAccounts();
}
