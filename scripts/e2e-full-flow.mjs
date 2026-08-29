import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PASSWORD = "password123";

const results = [];
const log = (entry) => {
  results.push(entry);
  console.log(entry.ok ? "✓" : "✗", JSON.stringify(entry));
};

async function login(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function logout(page) {
  await page.context().clearCookies();
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  // PUBLIC
  for (const path of ["/campaigns", "/influencers"]) {
    const res = await page.goto(`${BASE}${path}`);
    log({ area: "public", path, ok: (res?.status() ?? 0) === 200 });
  }

  // BRAND — deposit + create active campaign
  await login(page, "brand@fweta.test");
  log({ area: "brand", step: "login", ok: true });

  for (const path of [
    "/dashboard/brand",
    "/dashboard/brand/campaigns",
    "/dashboard/brand/campaigns/new",
    "/dashboard/brand/analytics",
    "/dashboard/brand/deposits",
    "/dashboard/brand/bookings",
  ]) {
    const res = await page.goto(`${BASE}${path}`);
    log({ area: "brand", path, ok: (res?.status() ?? 0) === 200 && !page.url().includes("/login") });
  }

  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "networkidle" });
  await page.fill("#amount", "1000");
  await page.fill("#note", `E2E deposit ${Date.now()}`);
  await page.getByRole("button", { name: /record deposit/i }).click();
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "networkidle" });
  const campaignTitle = `QA Campaign ${Date.now()}`;
  await page.fill("#title", campaignTitle);
  await page.fill("#description", "End-to-end QA test campaign for view polling.");
  await page.fill("#category", "Tech");
  await page.fill("#budgetTotal", "500");
  await page.fill("#cpm", "5");
  await page.fill("#maxPayout", "100");
  await page.locator('label:has-text("youtube") input[type="checkbox"]').check();
  await page.selectOption("#status", "active");
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/brand\/campaigns\/[a-f0-9-]+/, { timeout: 15000 });
  const campaignUrl = page.url();
  const campaignId = campaignUrl.split("/campaigns/")[1]?.split("/")[0];
  log({
    area: "brand",
    step: "create active campaign",
    ok: Boolean(campaignId && campaignId !== "new"),
    campaignUrl,
    campaignId,
  });

  await logout(page);

  // CLIPPER — submit clip
  await login(page, "clipper@fweta.test");
  log({ area: "clipper", step: "login", ok: true });

  for (const path of [
    "/dashboard/clipper",
    "/dashboard/clipper/campaigns",
    "/dashboard/clipper/submissions",
    "/dashboard/clipper/earnings",
  ]) {
    const res = await page.goto(`${BASE}${path}`);
    log({ area: "clipper", path, ok: (res?.status() ?? 0) === 200 });
  }

  await page.goto(`${BASE}/dashboard/clipper/campaigns`, { waitUntil: "networkidle" });
  const campaignCard = page.locator("li").filter({ hasText: campaignTitle });
  await campaignCard.waitFor({ timeout: 10000 });
  await campaignCard.locator('input[name="postUrl"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await campaignCard.locator('select[name="platform"]').selectOption("youtube");
  await campaignCard.getByRole("button", { name: /submit/i }).click();
  await page.waitForTimeout(2000);
  await page.goto(`${BASE}/dashboard/clipper/submissions`);
  const clipperBody = await page.locator("body").innerText();
  log({
    area: "clipper",
    step: "submit youtube clip",
    ok: /pending|youtube|Rick/i.test(clipperBody),
  });

  await logout(page);

  // BRAND — approve submission
  await login(page, "brand@fweta.test");
  await page.goto(`${BASE}/dashboard/brand/campaigns/${campaignId}/submissions`, {
    waitUntil: "networkidle",
  });
  const approveBtn = page.getByRole("button", { name: /^approve$/i }).first();
  await approveBtn.waitFor({ timeout: 10000 });
  if (await approveBtn.count()) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
    log({ area: "brand", step: "approve submission", ok: true });
  } else {
    log({ area: "brand", step: "approve submission", ok: false, note: "no approve button" });
  }

  await logout(page);

  // INFLUENCER
  await login(page, "creator@fweta.test");
  log({ area: "influencer", step: "login", ok: true });

  for (const path of [
    "/dashboard/influencer",
    "/dashboard/influencer/profile",
    "/dashboard/influencer/rate-cards",
    "/dashboard/influencer/bookings",
    "/dashboard/influencer/earnings",
    "/dashboard/settings/roles",
  ]) {
    const res = await page.goto(`${BASE}${path}`);
    log({ area: "influencer", path, ok: (res?.status() ?? 0) === 200 });
  }

  await logout(page);

  // ADMIN
  await login(page, "admin@fweta.test");
  log({ area: "admin", step: "login", ok: true });

  for (const path of [
    "/dashboard/admin",
    "/dashboard/admin/withdrawals",
    "/dashboard/admin/fraud",
    "/dashboard/admin/users",
    "/dashboard/admin/stats",
  ]) {
    const res = await page.goto(`${BASE}${path}`);
    log({ area: "admin", path, ok: (res?.status() ?? 0) === 200 });
  }

  await logout(page);
} catch (e) {
  log({ area: "fatal", step: "test run", ok: false, note: e.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log("\n=== SUMMARY ===");
console.log(`Passed: ${results.length - failed.length}/${results.length}`);
if (failed.length) {
  console.log("Failed:", failed);
  process.exit(1);
}
