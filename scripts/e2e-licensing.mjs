/**
 * UGC licensing and trust directory flow.
 *   node scripts/e2e-licensing.mjs
 * Against a local `next dev` on port 3000. Uses the demo accounts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const BASE = process.env.QA_BASE || "http://127.0.0.1:3000";
const PASSWORD = "password123";
const SHOTS = "/tmp/qa-license";
mkdirSync(SHOTS, { recursive: true });
writeFileSync("/tmp/ugc-sample.mp4", Buffer.from("00000018667479706d703432000000006d70343269736f6d", "hex"));

const headless = process.env.HEADED !== "1";
const results = [];
const log = (entry) => {
  results.push(entry);
  console.log(entry.ok ? "PASS" : "FAIL", entry.step, entry.detail || "");
};

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

async function dismissTour(page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(300);
  }
}

async function login(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 });
  await dismissTour(page);
  return { context, page };
}

const browser = await chromium.launch({
  headless,
  executablePath: "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  slowMo: headless ? 0 : 250,
});

const stamp = Date.now().toString().slice(-6);
const briefTitle = `River clip ${stamp}`;
const businessName = `River Cafe ${stamp}`;

try {
  const brand = await login(browser, "brand@fweta.test");
  await brand.page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
  await dismissTour(brand.page);
  await brand.page.fill("#amount", "1000");
  await brand.page.fill("#note", `UGC brief funding ${stamp}`);
  await brand.page.getByRole("button", { name: /request confirmation/i }).click();
  await brand.page.getByText(/request saved/i).waitFor({ timeout: 15000 });
  log({ ok: true, step: "brand requests pay-in" });
  await shot(brand.page, "01-payin");
  await brand.context.close();

  const admin = await login(browser, "admin@fweta.test");
  await admin.page.goto(`${BASE}/dashboard/admin/payins`, { waitUntil: "domcontentloaded" });
  await dismissTour(admin.page);
  const confirm = admin.page.locator("li", { hasText: `UGC brief funding ${stamp}` }).getByRole("button", { name: "Confirm transfer" });
  await confirm.waitFor({ timeout: 15000 });
  await confirm.click();
  await admin.page.getByText("Confirmed").first().waitFor({ timeout: 15000 });
  log({ ok: true, step: "admin confirms pay-in" });
  await admin.context.close();

  const brand2 = await login(browser, "brand@fweta.test");
  await brand2.page.goto(`${BASE}/dashboard/brand/ugc/new`, { waitUntil: "domcontentloaded" });
  await dismissTour(brand2.page);
  await brand2.page.fill("#ugc-title", briefTitle);
  await brand2.page.fill("#ugc-summary", "One vertical product video for paid ads in Namibia. Do not post it on your feed.");
  await brand2.page.fill("#ugc-length", "15");
  await brand2.page.fill("#ugc-count", "1");
  await brand2.page.fill("#ugc-fee", "200");
  await brand2.page.fill("#ugc-territory", "Namibia");
  await brand2.page.fill("#ugc-revisions", "1");
  await brand2.page.getByRole("button", { name: /open and reserve/i }).click();
  await brand2.page.waitForURL(/\/dashboard\/brand\/ugc\/(?!new)/, { timeout: 20000 });
  const briefUrl = brand2.page.url();
  log({ ok: briefUrl.includes("/dashboard/brand/ugc/"), step: "brand opens brief", detail: briefUrl });
  await shot(brand2.page, "02-brief");
  await brand2.page.fill('input[type="email"]', "creator@fweta.test");
  await brand2.page.getByRole("button", { name: "Invite" }).click();
  await brand2.page.getByText("Amara Nangolo").waitFor({ timeout: 15000 });
  log({ ok: true, step: "brand invites creator" });
  await brand2.context.close();

  const creator = await login(browser, "creator@fweta.test");
  const briefPath = new URL(briefUrl).pathname.replace("/dashboard/brand/ugc/", "/dashboard/ugc/");
  await creator.page.goto(`${BASE}${briefPath}`, { waitUntil: "domcontentloaded" });
  await dismissTour(creator.page);
  await creator.page.getByRole("button", { name: "Accept" }).waitFor({ timeout: 10000 }).catch(() => {});
  if (await creator.page.getByRole("button", { name: "Accept" }).count()) {
    log({ ok: false, step: "creator sees invite", detail: "Accept is a brand action" });
  }
  await creator.page.getByText(/invited/i).first().waitFor({ timeout: 15000 });
  log({ ok: true, step: "creator sees invite" });
  await creator.context.close();

  const brand3 = await login(browser, "brand@fweta.test");
  await brand3.page.goto(briefUrl, { waitUntil: "domcontentloaded" });
  await brand3.page.getByRole("button", { name: "Accept" }).click();
  await brand3.page.getByText("accepted").first().waitFor({ timeout: 15000 });
  log({ ok: true, step: "brand accepts creator" });
  await brand3.context.close();

  const creator2 = await login(browser, "creator@fweta.test");
  await creator2.page.goto(`${BASE}${briefPath}`, { waitUntil: "domcontentloaded" });
  await creator2.page.setInputFiles("#files-" + briefPath.split("/").pop(), "/tmp/ugc-sample.mp4").catch(async () => {
    await creator2.page.locator('input[type="file"]').setInputFiles("/tmp/ugc-sample.mp4");
  });
  await creator2.page.getByRole("button", { name: "Submit files" }).click();
  await creator2.page.getByText("submitted").first().waitFor({ timeout: 20000 });
  log({ ok: true, step: "creator uploads file" });
  await shot(creator2.page, "03-upload");
  await creator2.context.close();

  const brand4 = await login(browser, "brand@fweta.test");
  await brand4.page.goto(briefUrl, { waitUntil: "domcontentloaded" });
  await brand4.page.getByRole("button", { name: "Approve and pay" }).click();
  await brand4.page.getByText("Download license summary").waitFor({ timeout: 20000 });
  log({ ok: true, step: "brand approves and license exists" });
  await shot(brand4.page, "04-license");
  const licenseHref = await brand4.page.getByRole("link", { name: "Download license summary" }).getAttribute("href");
  const licenseRes = await brand4.page.request.get(`${BASE}${licenseHref}`);
  const licenseText = await licenseRes.text();
  log({
    ok: licenseRes.status() === 200 && licenseText.includes("fweta content license") && !licenseText.includes("\u2014"),
    step: "license summary downloads",
    detail: String(licenseRes.status()),
  });

  await brand4.page.goto(`${BASE}/dashboard/brand/directory`, { waitUntil: "domcontentloaded" });
  const listingForm = brand4.page.locator("form", { has: brand4.page.getByRole("button", { name: "Create listing" }) });
  const prefix = (await brand4.page.locator("#new-biz-name").count()) ? "new-biz" : "biz";
  await listingForm.locator(`#${prefix}-name`).fill(businessName);
  await listingForm.locator(`#${prefix}-city`).fill("Windhoek");
  await listingForm.locator(`#${prefix}-category`).fill("Cafe");
  await listingForm.locator(`#${prefix}-summary`).fill("A Windhoek cafe serving breakfast and coffee. Creators may recommend it in their own words.");
  await listingForm.locator(`#${prefix}-address`).fill("1 River Road");
  await listingForm.locator('input[name="optInReviews"]').check();
  await brand4.page.getByRole("button", { name: "Create listing" }).click();
  await brand4.page.waitForFunction(
    (name) => [...document.querySelectorAll("input")].some((input) => input.value === name),
    businessName,
    { timeout: 15000 },
  );
  log({ ok: true, step: "brand saves business listing" });
  await brand4.context.close();

  const admin2 = await login(browser, "admin@fweta.test");
  await admin2.page.goto(`${BASE}/dashboard/admin/directory`, { waitUntil: "domcontentloaded" });
  const card = admin2.page.locator("li", { hasText: businessName }).first();
  await card.getByRole("button", { name: "Publish" }).click();
  await card.getByText("published").waitFor({ timeout: 15000 });
  const publicHref = await card.getByRole("link", { name: "Public page" }).getAttribute("href");
  log({ ok: Boolean(publicHref), step: "admin publishes listing", detail: publicHref || "" });
  await admin2.context.close();

  const creator3 = await login(browser, "creator@fweta.test");
  await creator3.page.goto(`${BASE}${publicHref}`, { waitUntil: "domcontentloaded" });
  await creator3.page.selectOption("select", "5");
  await creator3.page.locator("textarea").first().fill("The coffee was excellent and the window table was quiet enough to film a short clip.");
  await creator3.page.locator('input[name="postUrl"]').fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await creator3.page.locator('input[name="creatorOptIn"]').check();
  await creator3.page.getByRole("button", { name: "Submit review" }).click();
  await creator3.page.waitForTimeout(1500);
  log({ ok: true, step: "creator submits opted-in review" });
  await creator3.page.goto(`${BASE}/dashboard/ugc/portfolio`, { waitUntil: "domcontentloaded" });
  await creator3.page.fill("#portfolio-headline", "Short ads for Namibian brands");
  await creator3.page.fill("#portfolio-about", "I make vertical product videos for paid ads and keep them off my own feed.");
  await creator3.page.fill("#portfolio-samples", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await creator3.page.fill("#portfolio-fee", "200");
  await creator3.page.locator('input[name="published"]').check();
  await creator3.page.getByRole("button", { name: "Save portfolio" }).click();
  await creator3.page.waitForTimeout(1000);
  log({ ok: true, step: "creator publishes portfolio" });
  await creator3.page.goto(`${BASE}/dashboard/influencer/earnings`, { waitUntil: "domcontentloaded" });
  await creator3.page.getByText("UGC fees").waitFor({ timeout: 15000 });
  const earnings = await creator3.page.locator("body").innerText();
  log({
    ok: /UGC fees/.test(earnings) && /UGC license fee/.test(earnings),
    step: "dual income shows UGC fee",
    detail: earnings.includes("UGC fees") ? "visible" : "missing",
  });
  await shot(creator3.page, "05-earnings");
  await creator3.context.close();

  const admin3 = await login(browser, "admin@fweta.test");
  await admin3.page.goto(`${BASE}/dashboard/admin/directory`, { waitUntil: "domcontentloaded" });
  const reviewCard = admin3.page.locator("li", { hasText: "The coffee was excellent" }).first();
  await reviewCard.getByRole("button", { name: "Publish" }).click();
  await reviewCard.getByText("published").waitFor({ timeout: 15000 });
  log({ ok: true, step: "admin publishes review" });
  await admin3.page.goto(`${BASE}/dashboard/admin/licenses`, { waitUntil: "domcontentloaded" });
  const licenses = await admin3.page.locator("body").innerText();
  log({ ok: licenses.includes(briefTitle), step: "admin sees license" });
  await shot(admin3.page, "06-admin-license");
  await admin3.context.close();

  const guest = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const guestPage = await guest.newPage();
  const business = await guestPage.goto(`${BASE}${publicHref}`, { waitUntil: "domcontentloaded" });
  const html = await guestPage.content();
  const text = await guestPage.locator("body").innerText();
  log({
    ok:
      (business?.status() ?? 0) === 200 &&
      html.includes("LocalBusiness") &&
      html.includes("AggregateRating") &&
      html.includes("FAQPage") &&
      text.includes("Questions people ask") &&
      text.includes("5 out of 5") &&
      !text.includes("\u2014"),
    step: "public business page is indexable",
    detail: publicHref,
  });
  await shot(guestPage, "07-business");
  const category = await guestPage.goto(`${BASE}/directory/windhoek/cafe`, { waitUntil: "domcontentloaded" });
  log({ ok: (category?.status() ?? 0) === 200 && (await guestPage.locator("body").innerText()).includes(businessName), step: "city category page" });
  const directory = await guestPage.goto(`${BASE}/directory`, { waitUntil: "domcontentloaded" });
  log({ ok: (directory?.status() ?? 0) === 200, step: "directory index" });
  const llms = await guestPage.goto(`${BASE}/llms.txt`, { waitUntil: "domcontentloaded" });
  const llmsText = await guestPage.locator("body").innerText();
  log({ ok: (llms?.status() ?? 0) === 200 && llmsText.includes(businessName), step: "llms.txt lists the business" });
  const robots = await guestPage.request.get(`${BASE}/robots.txt`);
  const robotsText = await robots.text();
  log({ ok: robotsText.includes("/directory") && robotsText.includes("Sitemap"), step: "robots allows directory" });
  const sitemap = await guestPage.request.get(`${BASE}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  log({ ok: sitemapText.includes("/directory") && sitemapText.includes(publicHref), step: "sitemap lists business" });
  await guest.close();
} catch (error) {
  log({ ok: false, step: "flow crashed", detail: error instanceof Error ? error.stack || error.message : String(error) });
} finally {
  await browser.close();
}

const failed = results.filter((item) => !item.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exit(failed.length ? 1 : 0);
