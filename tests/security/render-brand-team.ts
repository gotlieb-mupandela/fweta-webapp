import { readFileSync } from "node:fs";
import path from "node:path";

import BrandTeamPage from "../../app/dashboard/brand/team/page";

async function main() {
  const dir = process.env.FWETA_DATA_DIR;
  if (!dir) throw new Error("FWETA_DATA_DIR is required");
  const file = path.join(dir, "store.json");
  const before = readFileSync(file);
  await BrandTeamPage();
  const after = readFileSync(file);
  if (process.env.EXPECT_UNCHANGED === "1" && !after.equals(before)) {
    throw new Error("brand team GET changed store.json");
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
