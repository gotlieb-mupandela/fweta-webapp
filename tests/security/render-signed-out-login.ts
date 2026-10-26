import { readFileSync } from "node:fs";
import path from "node:path";

import LoginPage from "../../app/login/page";

async function main() {
  const dir = process.env.FWETA_DATA_DIR;
  if (!dir) throw new Error("FWETA_DATA_DIR is required");
  const file = path.join(dir, "store.json");
  const before = readFileSync(file);
  await LoginPage({ searchParams: Promise.resolve({}) });
  const after = readFileSync(file);
  if (!after.equals(before)) {
    throw new Error("signed-out GET /login changed store.json");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
