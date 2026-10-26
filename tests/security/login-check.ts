import { login } from "../../lib/auth/session";

async function main() {
  const email = process.env.LOGIN_EMAIL ?? "";
  const password = process.env.LOGIN_PASSWORD ?? "";
  const result = await login({ email, password });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
