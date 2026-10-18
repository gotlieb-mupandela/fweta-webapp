/**
 * Short recording of bio-code verification: creator, then admin.
 * Run against `next start` on port 3100.
 */
import playwright from "/tmp/pw/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const BASE = process.env.QA_BASE || "http://127.0.0.1:3100";
const PASSWORD = "password123";
const CREATOR = "clipper@fweta.test";
const ADMIN = "admin@fweta.test";
const handle = `bio${Date.now().toString().slice(-6)}`;

const browser = await chromium.launch({
  headless: true,
  slowMo: 40,
  executablePath: "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: "/tmp/account-verify-raw", size: { width: 1280, height: 800 } },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(25000);
const video = page.video();

async function pause(ms = 1200) {
  await page.waitForTimeout(ms);
}

async function dismissTour() {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await pause(400);
  }
}

async function login(email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pause(500);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await pause(400);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 25000, waitUntil: "domcontentloaded" });
  await dismissTour();
  await pause(600);
}

async function logout() {
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "domcontentloaded" });
  await pause(400);
  await page.getByRole("button", { name: "Log out" }).first().click();
  await page.waitForURL((url) => url.pathname === "/" || url.pathname === "/login", { timeout: 20000 }).catch(() => {});
  if (!page.url().includes("/login")) await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await pause(400);
}

await login(CREATOR);
await page.goto(`${BASE}/dashboard/settings/accounts`, { waitUntil: "domcontentloaded" });
await pause(700);
await page.selectOption("#account-platform", "tiktok");
await page.fill("#account-handle", handle);
await pause(500);
await page.getByRole("button", { name: "Add account" }).click();
const card = page.locator("li").filter({ hasText: `@${handle}` });
await card.getByText("Add it to the public bio on TikTok.").waitFor();
await card.scrollIntoViewIfNeeded();
await pause(1400);
await card.getByRole("button", { name: "Copy code" }).click();
await page.getByText("Code copied.").waitFor();
await pause(900);
await card.getByRole("button", { name: "New code" }).click();
await page.getByText(`New code for @${handle}`).waitFor();
await pause(1200);
await card.getByRole("button", { name: "I've added it" }).click();
await page.getByText("Sent for verification.").waitFor({ timeout: 20000 });
await card.getByText("Pending verification").first().waitFor();
await pause(1400);

await logout();
await login(ADMIN);
await page.goto(`${BASE}/dashboard/admin/accounts`, { waitUntil: "domcontentloaded" });
const row = page.locator("li").filter({ hasText: `@${handle}` });
await row.getByRole("link", { name: "Open profile" }).waitFor();
await row.scrollIntoViewIfNeeded();
await pause(1600);
await row.getByRole("button", { name: "Approve" }).click();
await page.locator("li").filter({ hasText: `@${handle}` }).getByText("Verified", { exact: true }).waitFor();
await pause(1400);

await logout();
await login(CREATOR);
await page.goto(`${BASE}/dashboard/settings/accounts`, { waitUntil: "domcontentloaded" });
const done = page.locator("li").filter({ hasText: `@${handle}` });
await done.getByText("You can remove the code from your bio.").waitFor();
await done.scrollIntoViewIfNeeded();
await pause(1600);

await page.goto(`${BASE}/help`, { waitUntil: "domcontentloaded" });
await page.getByText("How does bio verification work?").click();
await page.getByText("I've added it").first().waitFor();
await pause(1600);

await context.close();
await browser.close();
const path = await video?.path();
console.log("ACCOUNT_VIDEO_OK", handle, path);
