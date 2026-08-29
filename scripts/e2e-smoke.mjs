import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PASSWORD = "password123";

const accounts = [
  { email: "brand@fweta.test", role: "brand", paths: ["/dashboard/brand", "/dashboard/brand/campaigns", "/dashboard/brand/campaigns/new", "/dashboard/brand/analytics", "/dashboard/brand/deposits", "/dashboard/brand/bookings"] },
  { email: "clipper@fweta.test", role: "clipper", paths: ["/dashboard/clipper", "/dashboard/clipper/campaigns", "/dashboard/clipper/submissions", "/dashboard/clipper/earnings"] },
  { email: "creator@fweta.test", role: "influencer", paths: ["/dashboard/influencer", "/dashboard/influencer/profile", "/dashboard/influencer/rate-cards", "/dashboard/influencer/bookings", "/dashboard/influencer/earnings"] },
  { email: "admin@fweta.test", role: "admin", paths: ["/dashboard/admin", "/dashboard/admin/withdrawals", "/dashboard/admin/fraud", "/dashboard/admin/users", "/dashboard/admin/stats"] },
];

const results = [];

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

async function logout(page) {
  await page.goto(`${BASE}/dashboard/settings`);
  const logoutBtn = page.getByRole("button", { name: /log out|sign out/i });
  if (await logoutBtn.count()) {
    await logoutBtn.click();
    await page.waitForURL(/\/(login|$)/, { timeout: 10000 }).catch(() => {});
  } else {
    await page.context().clearCookies();
  }
}

async function checkPath(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  const url = page.url();
  const body = await page.locator("body").innerText();
  const hasError = /application error|something went wrong|500|404 not found/i.test(body);
  const redirectedToLogin = url.includes("/login");
  return { path, status, url, ok: status < 400 && !hasError && !redirectedToLogin };
}

async function testBrandFlow(page) {
  const flow = [];
  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "networkidle" });
  const title = `QA Campaign ${Date.now()}`;
  await page.locator('input[name="title"], #title').first().fill(title);
  await page.locator('textarea[name="description"], #description').first().fill("Automated QA test campaign.");
  await page.locator('input[name="budgetTotalCents"], #budgetTotalCents').first().fill("50000");
  await page.locator('input[name="cpmCents"], #cpmCents').first().fill("500");
  await page.locator('input[name="maxPayoutPerSubmissionCents"]').first().fill("10000").catch(() => {});
  const tiktok = page.locator('input[type="checkbox"][value="tiktok"], label:has-text("tiktok") input').first();
  if (await tiktok.count()) await tiktok.check().catch(() => {});
  await page.getByRole("button", { name: /create|save|publish/i }).click();
  await page.waitForTimeout(2000);
  flow.push({ step: "create campaign", ok: !page.url().includes("/new") || (await page.content()).includes(title) });
  return flow;
}

async function testClipperSubmit(page) {
  await page.goto(`${BASE}/dashboard/clipper/campaigns`, { waitUntil: "networkidle" });
  const urlInput = page.locator('input[name="postUrl"], input[type="url"]').first();
  if (!(await urlInput.count())) return [{ step: "submit clip", ok: false, note: "no campaigns to submit to" }];
  await urlInput.fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: /submit/i }).click();
  await page.waitForTimeout(2000);
  const content = await page.content();
  return [{ step: "submit clip", ok: /submitted|pending|success/i.test(content) || !(await page.locator(".text-red").count()) }];
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  for (const path of ["/campaigns", "/influencers"]) {
    const r = await checkPath(page, path);
    results.push({ role: "public", ...r });
  }

  for (const account of accounts) {
    try {
      await login(page, account.email);
      results.push({ role: account.role, step: "login", ok: page.url().includes("/dashboard") });

      for (const path of account.paths) {
        const r = await checkPath(page, path);
        results.push({ role: account.role, ...r });
      }

      if (account.role === "brand") {
        const flow = await testBrandFlow(page).catch((e) => [{ step: "create campaign", ok: false, note: e.message }]);
        results.push(...flow.map((f) => ({ role: "brand", ...f })));
      }

      if (account.role === "clipper") {
        const flow = await testClipperSubmit(page).catch((e) => [{ step: "submit clip", ok: false, note: e.message }]);
        results.push(...flow.map((f) => ({ role: "clipper", ...f })));
      }

      await logout(page);
    } catch (e) {
      results.push({ role: account.role, step: "login", ok: false, note: String(e.message) });
      await context.clearCookies();
    }
  }
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => r.ok === false);
console.log(JSON.stringify({ passed, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
