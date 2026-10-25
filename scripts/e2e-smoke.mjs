import {
  ADMIN_EMAIL,
  baseUrl,
  clickLogOut,
  confirmPayIn,
  dismissTour,
  launchBrowser,
  loadPlaywright,
  login,
  PASSWORD,
  publishCampaign,
  submitEftDeposit,
} from "./e2e-helpers.mjs";

const BASE = baseUrl();

const accounts = [
  { email: "brand@fweta.test", role: "brand", paths: ["/dashboard/brand", "/dashboard/brand/campaigns", "/dashboard/brand/campaigns/new", "/dashboard/brand/analytics", "/dashboard/brand/deposits", "/dashboard/brand/bookings", "/dashboard/brand/ugc", "/dashboard/brand/ugc/new", "/dashboard/brand/directory"] },
  { email: "clipper@fweta.test", role: "clipper", paths: ["/dashboard/clipper", "/dashboard/clipper/campaigns", "/dashboard/clipper/submissions", "/dashboard/clipper/earnings", "/dashboard/ugc", "/dashboard/ugc/portfolio"] },
  { email: "creator@fweta.test", role: "influencer", paths: ["/dashboard/influencer", "/dashboard/influencer/profile", "/dashboard/influencer/rate-cards", "/dashboard/influencer/bookings", "/dashboard/influencer/earnings", "/dashboard/ugc", "/dashboard/ugc/portfolio"] },
  { email: ADMIN_EMAIL, role: "admin", paths: ["/dashboard/admin", "/dashboard/admin/withdrawals", "/dashboard/admin/fraud", "/dashboard/admin/users", "/dashboard/admin/stats", "/dashboard/admin/licenses", "/dashboard/admin/disputes", "/dashboard/admin/directory"] },
];

const results = [];

async function logout(page) {
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "domcontentloaded" });
  await dismissTour(page);
  const visibleLogout = page.getByRole("button", { name: "Log out", exact: true }).filter({ visible: true });
  if ((await visibleLogout.count()) === 0) {
    await page.context().clearCookies();
    return;
  }
  await clickLogOut(page);
  await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), { timeout: 10000 }).catch(() => {});
}

async function checkPath(page, path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  const url = page.url();
  const body = await page.locator("body").innerText();
  const hasError = /application error|something went wrong|internal server error|404 not found/i.test(body);
  const redirectedToLogin = url.includes("/login");
  return { path, status, url, ok: status < 400 && !hasError && !redirectedToLogin };
}

async function testBrandFlow(page) {
  const flow = [];
  const note = `Smoke deposit ${Date.now()}`;
  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
  await submitEftDeposit(page, "200", note);
  await login(page, ADMIN_EMAIL, PASSWORD);
  await confirmPayIn(page, note);
  await login(page, "brand@fweta.test", PASSWORD);
  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "domcontentloaded" });
  const title = `QA Campaign ${Date.now()}`;
  await publishCampaign(page, {
    title,
    description: "Automated QA test campaign.",
    category: "Tech",
    budget: "50",
    cpm: "5",
    maxPayout: "20",
    platform: "YouTube",
  });
  const body = await page.locator("body").innerText();
  flow.push({ step: "create campaign", ok: body.includes(title) && !page.url().includes("/new") });
  return flow;
}

async function testClipperSubmit(page) {
  await page.goto(`${BASE}/dashboard/clipper/campaigns`, { waitUntil: "domcontentloaded" });
  const urlInput = page.getByLabel("Post URL", { exact: true });
  if (!(await urlInput.count())) return [{ step: "submit clip", ok: false, note: "no campaigns to submit to" }];
  await urlInput.first().fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Submit clip", exact: true }).first().click();
  await page.getByText("Clip submitted for review").first().waitFor({ timeout: 15000 }).catch(() => {});
  const content = await page.content();
  return [{ step: "submit clip", ok: /Clip submitted for review|pending/i.test(content) }];
}

const playwright = await loadPlaywright();
const browser = await launchBrowser(playwright);
const context = await browser.newContext();
const page = await context.newPage();

try {
  for (const path of ["/campaigns", "/influencers", "/directory", "/llms.txt", "/robots.txt", "/sitemap.xml"]) {
    const r = await checkPath(page, path);
    results.push({ role: "public", ...r });
  }

  for (const account of accounts) {
    try {
      await login(page, account.email, PASSWORD);
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
