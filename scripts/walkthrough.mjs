/**
 * Polished walkthrough. Recorded only after the QA loop passed.
 * One browser context, slow pauses, realistic people and a real campaign.
 */
import { readFileSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const BASE = "http://127.0.0.1:3100";
const PASSWORD = "password123";
const STORE = "/workspace/data/store.json";
const BRAND_EMAIL = "lena.shipanga@example.com";
const CREATOR_EMAIL = "tuli.nakale@example.com";
const ADMIN_EMAIL = "admin@fweta.test";
const CAMPAIGN = "Rooibos cold brew cuts";

function load() {
  return JSON.parse(readFileSync(STORE, "utf8"));
}

const browser = await chromium.launch({
  headless: true,
  slowMo: 60,
  executablePath: "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/walkthrough-raw", size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
page.setDefaultTimeout(25000);
const video = page.video();

async function pause(ms = 1600) {
  await page.waitForTimeout(ms);
}

async function finishDashboardTour() {
  for (let step = 0; step < 6; step += 1) {
    const dialog = page.getByRole("dialog");
    if (!(await dialog.isVisible().catch(() => false))) return;
    const done = dialog.getByRole("button", { name: "Done" });
    const next = dialog.getByRole("button", { name: "Next" });
    if (await done.isVisible().catch(() => false)) {
      await pause(1000);
      await done.click();
      await pause(700);
      return;
    }
    if (await next.isVisible().catch(() => false)) {
      await pause(1000);
      await next.click();
    } else {
      return;
    }
  }
}

async function login(email) {
  if (!page.url().includes("/login")) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  }
  await pause(700);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await pause(900);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 25000, waitUntil: "domcontentloaded" });
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await pause(400);
  }
  await pause(1200);
}

async function logout() {
  const button = page.getByRole("button", { name: "Log out" }).first();
  if (!(await button.isVisible().catch(() => false))) {
    await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "domcontentloaded" });
    await pause(500);
  }
  await page.getByRole("button", { name: "Log out" }).first().click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/login", { timeout: 20000 }).catch(() => {});
  if (!page.url().includes("/login")) {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  }
  await pause(800);
}

async function visit(paths) {
  for (const path of paths) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    await pause(1900);
    await page.mouse.wheel(0, 360);
    await pause(700);
    await page.mouse.wheel(0, -360);
    await pause(400);
  }
}

try {
  await page.goto(`${BASE}/signup?role=brand`, { waitUntil: "domcontentloaded" });
  await pause(1200);
  await page.fill("#email", BRAND_EMAIL);
  await page.fill("#password", PASSWORD);
  await pause(1000);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { waitUntil: "domcontentloaded" });
  await pause(800);
  await page.fill("#firstName", "Lena");
  await page.fill("#lastName", "Shipanga");
  await pause(700);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Tell us about the business").waitFor();
  await pause(600);
  await page.fill("#companyName", "Shipanga Foods");
  await page.fill("#website", "https://shipanga.example");
  await pause(700);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("What do you want to promote?").waitFor();
  await page.fill("#promote", "A Windhoek rooibos cold brew. We need short tasting clips for TikTok and Reels.");
  await pause(800);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Set up your first campaign").waitFor();
  await pause(500);
  await page.fill("#title", CAMPAIGN);
  await page.fill("#cpmNad", "40");
  await page.fill("#budgetNad", "500");
  await page.fill("#minViews", "0");
  await page.fill("#maxPayoutNad", "150");
  await page.fill("#brief", "Cut the tasting into vertical clips. Keep the bottle and the Windhoek skyline in frame.");
  await page.fill("#rules", "No other drinks on screen. Leave the brand name in the caption.");
  await pause(900);
  await page.getByRole("button", { name: "Save draft campaign" }).click();
  await page.getByText("How funding works").waitFor();
  await pause(1600);
  await page.getByRole("button", { name: "I understand" }).click();
  await page.getByText("A quick look around").waitFor();
  await pause(1600);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });
  await pause(800);
  await finishDashboardTour();
  await pause(1000);

  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
  await finishDashboardTour();
  await pause(800);
  await page.fill("#amount", "2000");
  await page.fill("#note", "Shipanga Foods opening transfer");
  await pause(800);
  await page.locator("form").getByRole("button", { name: "Request confirmation" }).click();
  await page.getByText("Request saved").waitFor();
  await pause(1400);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin/payins`, { waitUntil: "domcontentloaded" });
  await pause(800);
  const payin = page.locator("li").filter({ hasText: "Shipanga Foods opening transfer" });
  await payin.getByRole("button", { name: "Confirm transfer" }).click();
  await payin.getByText("Confirmed", { exact: true }).waitFor();
  await pause(1400);

  await logout();
  await login(BRAND_EMAIL);
  await page.goto(`${BASE}/dashboard/brand/campaigns`, { waitUntil: "domcontentloaded" });
  await pause(800);
  const draft = load().campaigns.find((item) => item.title === CAMPAIGN);
  await page.goto(`${BASE}/dashboard/brand/campaigns/${draft.id}/edit`, { waitUntil: "domcontentloaded" });
  await pause(700);
  await page.fill("#captionGuide", "Cold brew in Windhoek. Paid partnership with Shipanga Foods.");
  await page.fill("#hashtags", "#rooibos\n#windhoek");
  await page.fill("#requiredChecks", "Bottle stays in frame");
  await pause(800);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/dashboard/brand/campaigns/${draft.id}$`), { waitUntil: "domcontentloaded" });
  await pause(900);
  await page.goto(`${BASE}/dashboard/brand/campaigns`, { waitUntil: "domcontentloaded" });
  await pause(500);
  await page.getByRole("link", { name: CAMPAIGN }).click();
  await page.waitForURL(/\/dashboard\/brand\/campaigns\//, { waitUntil: "domcontentloaded" });
  await pause(1000);
  await page.getByRole("button", { name: "Activate" }).click();
  await pause(1800);
  const live = load().campaigns.find((item) => item.title === CAMPAIGN);
  if (live?.status !== "active") throw new Error(`Campaign did not go live (${live?.status})`);

  await logout();
  await page.goto(`${BASE}/signup?role=creator`, { waitUntil: "domcontentloaded" });
  await pause(1000);
  await page.fill("#email", CREATOR_EMAIL);
  await page.fill("#password", PASSWORD);
  await pause(800);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/, { waitUntil: "domcontentloaded" });
  await pause(600);
  await page.fill("#firstName", "Tuli");
  await page.fill("#lastName", "Nakale");
  await pause(600);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Music" }).click();
  await pause(500);
  await page.getByRole("button", { name: "Food" }).click();
  await pause(600);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Connect the accounts you post on").waitFor();
  await pause(800);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByText("Where should we pay you?").waitFor();
  await pause(500);
  await page.fill("#bankName", "Bank Windhoek");
  await page.fill("#branchCode", "461266");
  await page.fill("#accountNumber", "8044221987");
  await page.fill("#accountHolderName", "Tuli Nakale");
  await pause(800);
  await page.getByRole("button", { name: "Save payout details" }).click();
  await page.getByText("A quick look around").waitFor();
  await pause(1200);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText(/Campaigns you can join|No live campaigns yet|You're in/).waitFor();
  await pause(1200);
  const finish = page.getByRole("button", { name: /Go to my workspace|Continue|Go to dashboard/ });
  if (await finish.first().isVisible().catch(() => false)) await finish.first().click();
  await page.waitForURL(/\/dashboard/, { waitUntil: "domcontentloaded" });
  await pause(600);
  await finishDashboardTour();
  await pause(800);

  await page.goto(`${BASE}/dashboard/settings/accounts`, { waitUntil: "domcontentloaded" });
  await pause(700);
  await page.selectOption("#account-platform", "tiktok");
  await page.fill("#account-handle", "tulinakale");
  await pause(600);
  await page.getByRole("button", { name: "Add account" }).click();
  await page.getByText("Code ready for @tulinakale").waitFor();
  await pause(1200);
  const creatorAccount = page.locator("li").filter({ hasText: "@tulinakale" });
  await creatorAccount.getByRole("button", { name: "I've added it" }).click();
  await page.getByText("Sent for verification.").waitFor({ timeout: 20000 });
  await pause(1200);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin/accounts`, { waitUntil: "domcontentloaded" });
  await pause(700);
  const account = page.locator("li").filter({ hasText: "@tulinakale" });
  await account.getByRole("link", { name: "Open profile" }).waitFor();
  await pause(800);
  await account.getByRole("button", { name: "Approve" }).click();
  await page.locator("li").filter({ hasText: "@tulinakale" }).getByText("Verified", { exact: true }).waitFor();
  await pause(1200);

  await logout();
  await login(CREATOR_EMAIL);
  await page.goto(`${BASE}/campaigns`, { waitUntil: "domcontentloaded" });
  await pause(1000);
  await page.getByRole("link", { name: CAMPAIGN }).first().click();
  await page.waitForURL(/\/campaigns\//, { waitUntil: "domcontentloaded" });
  await pause(800);
  const campaignId = page.url().split("/").pop();
  const save = page.getByRole("button", { name: "Save campaign" });
  if (await save.isVisible().catch(() => false)) {
    await save.click();
    await page.getByRole("button", { name: "Saved" }).waitFor();
    await pause(800);
  }
  await page.locator(`#url-${campaignId}`).fill("https://www.tiktok.com/@tulinakale/video/7421836501122330011");
  const check = page.getByRole("checkbox");
  if (await check.first().isVisible().catch(() => false)) {
    await check.first().check();
    await pause(500);
  }
  await pause(700);
  await page.getByRole("button", { name: "Submit clip" }).click();
  await page.getByText("Submitted for review").waitFor();
  await pause(1400);

  await logout();
  await login(BRAND_EMAIL);
  await page.goto(`${BASE}/dashboard/brand/campaigns/${live.id}/submissions`, { waitUntil: "domcontentloaded" });
  await pause(900);
  await page.getByRole("button", { name: "Approve" }).click();
  await pause(1600);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin/views`, { waitUntil: "domcontentloaded" });
  await pause(800);
  const row = page.locator("li").filter({ hasText: CAMPAIGN }).filter({ has: page.locator('input[name="views"]') }).first();
  await row.locator('input[name="views"]').fill("2500");
  await pause(700);
  await row.getByRole("button", { name: "Save count" }).click();
  await page.getByText(/Count saved|Earnings updated/).first().waitFor();
  await pause(1800);

  await logout();
  await login(CREATOR_EMAIL);
  await page.goto(`${BASE}/dashboard/clipper/earnings`, { waitUntil: "domcontentloaded" });
  await pause(2200);
  await page.goto(`${BASE}/dashboard/settings/wallet`, { waitUntil: "domcontentloaded" });
  await pause(2000);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin`, { waitUntil: "domcontentloaded" });
  await pause(800);
  const creator = load().profiles.find((item) => item.email === CREATOR_EMAIL);
  await page.selectOption("#userId", creator.id);
  await page.fill("#amount", "200");
  await page.fill("#reason", "Available balance for the first payout");
  await pause(700);
  await page.getByRole("button", { name: "Credit wallet" }).click();
  await pause(1600);

  await logout();
  await login(CREATOR_EMAIL);
  await page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "domcontentloaded" });
  await pause(700);
  await page.fill("#legalName", "Tuli Nakale");
  await page.fill("#idNumber", "94051200123");
  await page.fill("#country", "NA");
  await page.setInputFiles("#idDocument", {
    name: "id.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await pause(600);
  await page.getByRole("button", { name: "Save identity" }).click();
  await page.getByText("Waiting for a review").waitFor();
  await pause(1200);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin/kyc`, { waitUntil: "domcontentloaded" });
  await pause(800);
  await page.locator("li").filter({ hasText: CREATOR_EMAIL }).getByRole("button", { name: "Verify identity" }).click();
  await page.getByText("verified", { exact: true }).waitFor();
  await pause(1200);

  await logout();
  await login(CREATOR_EMAIL);
  await page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "domcontentloaded" });
  await page.getByText("Verified.").waitFor();
  await pause(600);
  await page.fill("#amount", "100");
  await pause(500);
  await page.getByRole("button", { name: "Request withdrawal" }).click();
  await page.getByText("Withdrawal requested").waitFor();
  await pause(1600);

  await logout();
  await login(ADMIN_EMAIL);
  await page.goto(`${BASE}/dashboard/admin/withdrawals`, { waitUntil: "domcontentloaded" });
  await pause(800);
  const payout = page.locator("li").filter({ hasText: "Tuli Nakale" }).filter({ has: page.getByRole("button", { name: "Mark paid" }) }).first();
  await payout.locator('input[name="ref"]').fill("EFT-88421");
  await pause(600);
  await payout.getByRole("button", { name: "Mark paid" }).click();
  await pause(1800);

  await logout();
  await login(CREATOR_EMAIL);
  if (!page.url().includes("/clipper")) {
    await page.locator("aside #role-switcher").selectOption("clipper");
    await page.goto(`${BASE}/dashboard/clipper`, { waitUntil: "domcontentloaded" });
  }
  await page.goto(`${BASE}/dashboard/support`, { waitUntil: "domcontentloaded" });
  await pause(600);
  await page.fill("#subject", "When does the hold end?");
  await page.fill("#body", "My clip is approved. I want to know when the wallet release happens.");
  await pause(700);
  await page.getByRole("button", { name: "Open ticket" }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("When does the hold end?").waitFor();
  await pause(1400);

  await visit([
    "/dashboard/clipper",
    "/dashboard/clipper/campaigns",
    "/dashboard/clipper/submissions",
    "/dashboard/clipper/leaderboard",
    "/dashboard/clipper/saved",
    "/dashboard/support",
    "/legal/abuse",
    "/dashboard/clipper/earnings",
    "/dashboard/settings/wallet",
    "/dashboard/settings/accounts",
    "/dashboard/notifications",
    "/dashboard/settings",
  ]);
  await page.goto(`${BASE}/dashboard/clipper`, { waitUntil: "domcontentloaded" });
  await pause(600);
  await page.locator("aside #role-switcher").selectOption("influencer");
  await page.goto(`${BASE}/dashboard/influencer`, { waitUntil: "domcontentloaded" });
  await visit([
    "/dashboard/influencer",
    "/dashboard/influencer/bookings",
    "/dashboard/influencer/rate-cards",
    "/dashboard/influencer/profile",
    "/dashboard/influencer/earnings",
  ]);
  await page.goto(`${BASE}/help`, { waitUntil: "domcontentloaded" });
  await pause(1800);

  await logout();
  await login(BRAND_EMAIL);
  await visit([
    "/dashboard/brand",
    "/dashboard/brand/campaigns",
    `/dashboard/brand/campaigns/${live.id}`,
    `/dashboard/brand/campaigns/${live.id}/submissions`,
    "/dashboard/brand/analytics",
    "/dashboard/brand/bookings",
    "/dashboard/brand/deposits",
    "/dashboard/brand/team",
    "/dashboard/notifications",
    "/dashboard/settings",
  ]);

  await logout();
  await login(ADMIN_EMAIL);
  await visit([
    "/dashboard/admin",
    "/dashboard/admin/payins",
    "/dashboard/admin/views",
    "/dashboard/admin/withdrawals",
    "/dashboard/admin/fraud",
    "/dashboard/admin/users",
    `/dashboard/admin/users/${live.brandId}`,
    "/dashboard/admin/onboarding",
    "/dashboard/admin/accounts",
    "/dashboard/admin/workspaces",
    "/dashboard/admin/stats",
    "/dashboard/admin/fees",
    "/dashboard/admin/kyc",
    "/dashboard/admin/support",
    "/dashboard/admin/emails",
  ]);
  await page.goto(`${BASE}/dashboard/admin/fees`, { waitUntil: "domcontentloaded" });
  await pause(600);
  await page.fill("#percent", "10");
  await page.getByRole("button", { name: "Save fee" }).click();
  await page.getByText("Platform fee set to").waitFor();
  await pause(1400);

  const paid = load().withdrawalRequests.find((item) => item.bankReference === "EFT-88421");
  const clip = load().submissions.find((item) => item.postUrl.includes("7421836501122330011"));
  if (paid?.status !== "paid") throw new Error("Payout was not marked paid");
  if (!clip || clip.earningsCents <= 0) throw new Error("Earnings were not credited");
  console.log("WALKTHROUGH_OK", { earnings: clip.earningsCents, payout: paid.status });
} catch (error) {
  await page.screenshot({ path: "/tmp/walkthrough-fail.png", fullPage: true }).catch(() => {});
  console.error("WALKTHROUGH_FAIL", error);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  if (video) console.log("VIDEO", await video.path());
}
