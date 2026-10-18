/**
 * Core money flow plus role, team, onboarding, legal, and mobile checks.
 * Run against `next start` (production). Chrome must be installed.
 *
 *   node scripts/e2e-money-qa.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import playwright from "/tmp/pw/node_modules/playwright-core/index.js";

const { chromium } = playwright;
const BASE = process.env.QA_BASE || "http://127.0.0.1:3100";
const PASSWORD = "password123";
const STORE = "/workspace/data/store.json";
const SHOTS = "/tmp/qa-shots";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const log = (entry) => {
  results.push(entry);
  console.log(entry.ok ? "PASS" : "FAIL", entry.step, entry.detail || "");
};

function load() {
  return JSON.parse(readFileSync(STORE, "utf8"));
}
function profile(email) {
  return load().profiles.find((item) => item.email === email);
}
function walletOf(email) {
  const user = profile(email);
  return load().wallets.find((item) => item.userId === user?.id) ?? { availableCents: 0, pendingCents: 0 };
}
function campaignByTitle(title) {
  return load().campaigns.find((item) => item.title === title);
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
}

async function dismissTour(page) {
  const skip = page.getByRole("button", { name: "Skip tour" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(400);
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
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000, waitUntil: "domcontentloaded" });
  await dismissTour(page);
  return { context, page };
}

async function submitClip(page, campaignId, url) {
  await page.goto(`${BASE}/campaigns/${campaignId}`, { waitUntil: "domcontentloaded" });
  await page.locator(`#url-${campaignId}`).fill(url);
  await page.getByRole("button", { name: "Submit clip" }).click();
  await page.getByText("Submitted for review").waitFor({ timeout: 20000 });
}

async function approveFirst(page, campaignId) {
  await page.goto(`${BASE}/dashboard/brand/campaigns/${campaignId}/submissions`, { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: "Approve" }).first();
  await button.waitFor({ timeout: 15000 });
  if (await button.isDisabled()) {
    const text = await page.locator("body").innerText();
    throw new Error(`Approve is locked. ${text.slice(0, 400)}`);
  }
  await button.click();
  await page.waitForTimeout(1200);
}

async function saveViews(page, title, views) {
  await page.goto(`${BASE}/dashboard/admin/views`, { waitUntil: "domcontentloaded" });
  const row = page.locator("li").filter({ hasText: title }).filter({ has: page.locator('input[name="views"]') }).first();
  await row.waitFor({ timeout: 15000 });
  await row.locator('input[name="views"]').fill(String(views));
  await row.getByRole("button", { name: "Save count" }).click();
  const started = Date.now();
  while (Date.now() - started < 20000) {
    const campaign = campaignByTitle(title);
    const sub = load().submissions.find((item) => item.campaignId === campaign?.id);
    if (sub && sub.views >= views) return;
    await page.waitForTimeout(400);
  }
  throw new Error(`view count did not persist for ${title}`);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const stamp = Date.now();
const cpmTitle = `Rooibos Cuts ${stamp}`;
const stopTitle = `Budget Stop ${stamp}`;
const poolTitle = `Pool Split ${stamp}`;
const end = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

try {
  const brand = await login(browser, "brand@fweta.test");
  try {
    await brand.page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
    await brand.page.fill("#amount", "8000");
    await brand.page.fill("#note", `QA pay-in ${stamp}`);
    await brand.page.getByRole("button", { name: "Request confirmation" }).click();
    await brand.page.getByText("Request saved").waitFor({ timeout: 20000 });
    const deposit = load().brandDeposits.find((item) => item.note === `QA pay-in ${stamp}`);
    log({
      ok: deposit?.status === "pending" && deposit.amountCents === 800000,
      step: "brand pay-in request",
      detail: deposit ? `${deposit.status} ${deposit.amountCents}` : "missing",
    });
  } catch (error) {
    await shot(brand.page, "payin");
    log({ ok: false, step: "brand pay-in request", detail: String(error) });
  }
  await brand.context.close();

  const admin = await login(browser, "admin@fweta.test");
  try {
    await admin.page.goto(`${BASE}/dashboard/admin/payins`, { waitUntil: "domcontentloaded" });
    const before = walletOf("brand@fweta.test").availableCents;
    const row = admin.page.locator("li").filter({ hasText: `QA pay-in ${stamp}` });
    await row.getByRole("button", { name: "Confirm transfer" }).click();
    await row.getByText("Confirmed", { exact: true }).waitFor({ timeout: 20000 });
    const deposit = load().brandDeposits.find((item) => item.note === `QA pay-in ${stamp}`);
    const available = walletOf("brand@fweta.test").availableCents;
    log({
      ok: deposit?.status === "credited" && available - before === 800000,
      step: "admin confirms pay-in",
      detail: `status ${deposit?.status} wallet ${before}->${available}`,
    });
  } catch (error) {
    await shot(admin.page, "confirm");
    log({ ok: false, step: "admin confirms pay-in", detail: String(error) });
  }
  await admin.context.close();

  const brand2 = await login(browser, "brand@fweta.test");
  let cpmId = "";
  let stopId = "";
  let poolId = "";
  try {
    const beforeLive = walletOf("brand@fweta.test").availableCents;
    await brand2.page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "domcontentloaded" });
    await brand2.page.fill("#title", cpmTitle);
    await brand2.page.fill("#description", "Short clips of the Windhoek rooibos launch for TikTok.");
    await brand2.page.fill("#category", "Food");
    await brand2.page.fill("#budgetTotal", "200");
    await brand2.page.fill("#cpm", "40");
    await brand2.page.fill("#minViews", "0");
    await brand2.page.fill("#minPayout", "0");
    await brand2.page.fill("#maxPayout", "80");
    await brand2.page.selectOption("#status", "active");
    await brand2.page.getByRole("button", { name: "Create campaign" }).click();
    await brand2.page.waitForURL(/\/dashboard\/brand\/campaigns\/[0-9a-f-]+$/, { timeout: 20000 });
    cpmId = brand2.page.url().split("/").pop();
    const campaign = campaignByTitle(cpmTitle);
    const available = walletOf("brand@fweta.test").availableCents;
    log({
      ok: campaign?.status === "active" && campaign.budgetTotalCents === 20000 && beforeLive - available === 22000,
      step: "CPM campaign goes live",
      detail: `status ${campaign?.status} wallet ${beforeLive}->${available}`,
    });
  } catch (error) {
    await shot(brand2.page, "cpm-create");
    log({ ok: false, step: "CPM campaign goes live", detail: String(error) });
  }

  try {
    await brand2.page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "domcontentloaded" });
    await brand2.page.fill("#title", stopTitle);
    await brand2.page.fill("#description", "A small budget that should stop itself when views are paid.");
    await brand2.page.fill("#category", "Food");
    await brand2.page.fill("#budgetTotal", "30");
    await brand2.page.fill("#cpm", "30");
    await brand2.page.fill("#minViews", "0");
    await brand2.page.fill("#minPayout", "0");
    await brand2.page.fill("#maxPayout", "30");
    await brand2.page.selectOption("#status", "active");
    await brand2.page.getByRole("button", { name: "Create campaign" }).click();
    await brand2.page.waitForURL(/\/dashboard\/brand\/campaigns\/[0-9a-f-]+$/, { timeout: 20000 });
    stopId = brand2.page.url().split("/").pop();
    log({ ok: Boolean(stopId), step: "auto-stop campaign created", detail: stopId });
  } catch (error) {
    await shot(brand2.page, "stop-create");
    log({ ok: false, step: "auto-stop campaign created", detail: String(error) });
  }

  try {
    await brand2.page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "domcontentloaded" });
    await brand2.page.fill("#title", poolTitle);
    await brand2.page.fill("#description", "One pool shared across approved clips when the campaign closes.");
    await brand2.page.fill("#category", "Food");
    await brand2.page.selectOption("#payModel", "pool");
    await brand2.page.fill("#budgetTotal", "100");
    await brand2.page.fill("#cpm", "0");
    await brand2.page.fill("#minViews", "0");
    await brand2.page.fill("#minPayout", "0");
    await brand2.page.fill("#maxPayout", "100");
    await brand2.page.fill("#endDate", end);
    await brand2.page.selectOption("#status", "active");
    await brand2.page.getByRole("button", { name: "Create campaign" }).click();
    await brand2.page.waitForURL(/\/dashboard\/brand\/campaigns\/[0-9a-f-]+$/, { timeout: 20000 });
    poolId = brand2.page.url().split("/").pop();
    const campaign = campaignByTitle(poolTitle);
    log({
      ok: campaign?.payModel === "pool" && campaign.status === "active" && Boolean(campaign.endDate),
      step: "pool campaign goes live",
      detail: `${campaign?.payModel} ${campaign?.status}`,
    });
  } catch (error) {
    await shot(brand2.page, "pool-create");
    log({ ok: false, step: "pool campaign goes live", detail: String(error) });
  }
  await brand2.context.close();

  const clipper = await login(browser, "clipper@fweta.test");
  try {
    await clipper.page.goto(`${BASE}/dashboard/settings/accounts`, { waitUntil: "domcontentloaded" });
    await clipper.page.selectOption("#account-platform", "tiktok");
    await clipper.page.fill("#account-handle", `kai${String(stamp).slice(-6)}`);
    await clipper.page.getByRole("button", { name: "Add account" }).click();
    const handle = `kai${String(stamp).slice(-6)}`;
    await clipper.page.getByText(`Code ready for @${handle}`).waitFor({ timeout: 15000 });
    const card = clipper.page.locator("li").filter({ hasText: `@${handle}` });
    await card.getByRole("button", { name: "Copy code" }).waitFor();
    await card.getByText("Add it to the public bio on TikTok.").waitFor();
    const added = (load().socialAccounts ?? []).find((item) => item.handle === handle);
    if (!added || added.status !== "pending") {
      log({
        ok: false,
        step: "creator adds social account",
        detail: added ? `${added.status} ${added.code}` : "missing",
      });
    } else {
      await card.getByRole("button", { name: "I've added it" }).click();
      await clipper.page.getByText("Sent for verification.").waitFor({ timeout: 20000 });
      const queued = (load().socialAccounts ?? []).find((item) => item.handle === handle);
      log({
        ok: queued?.status === "review" && /^FWETA-[A-Z0-9]{6}$/.test(queued.code ?? ""),
        step: "creator adds social account",
        detail: queued ? `${queued.platform} ${queued.status} ${queued.code}` : "missing",
      });
    }
  } catch (error) {
    await shot(clipper.page, "social");
    log({ ok: false, step: "creator adds social account", detail: String(error) });
  }
  await clipper.context.close();

  const admin2 = await login(browser, "admin@fweta.test");
  try {
    await admin2.page.goto(`${BASE}/dashboard/admin/accounts`, { waitUntil: "domcontentloaded" });
    const handle = `kai${String(stamp).slice(-6)}`;
    const row = admin2.page.locator("li").filter({ hasText: `@${handle}` });
    await row.getByRole("link", { name: "Open profile" }).waitFor({ timeout: 15000 });
    await row.getByRole("button", { name: "Approve" }).click();
    let account = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      account = (load().socialAccounts ?? []).find((item) => item.handle === handle);
      if (account?.status === "verified") break;
      await admin2.page.waitForTimeout(500);
    }
    const creator = profile("clipper@fweta.test");
    const audited = (load().auditLog ?? []).some(
      (item) => item.action === "account.review" && String(item.summary).includes(`@${handle}`),
    );
    const notified = (load().notifications ?? []).some(
      (item) => item.kind === "account_reviewed" && item.userId === creator?.id && item.title === "Account verified",
    );
    log({
      ok: account?.status === "verified" && audited && notified,
      step: "admin verifies bio account",
      detail: `${account?.status} audit:${audited} note:${notified}`,
    });
  } catch (error) {
    await shot(admin2.page, "verify");
    log({ ok: false, step: "admin verifies bio account", detail: String(error) });
  }
  await admin2.context.close();

  const clipper2 = await login(browser, "clipper@fweta.test");
  try {
    await clipper2.page.goto(`${BASE}/campaigns`, { waitUntil: "domcontentloaded" });
    const visible = await clipper2.page.getByText(cpmTitle).count();
    log({ ok: visible > 0, step: "discover lists live campaign", detail: String(visible) });
    if (cpmId) await submitClip(clipper2.page, cpmId, `https://www.tiktok.com/@kaiclips/video/${stamp}01`);
    if (stopId) await submitClip(clipper2.page, stopId, `https://www.tiktok.com/@kaiclips/video/${stamp}02`);
    if (poolId) await submitClip(clipper2.page, poolId, `https://www.tiktok.com/@kaiclips/video/${stamp}03`);
    const mine = load().submissions.filter((item) => item.clipperId === profile("clipper@fweta.test").id);
    log({ ok: mine.length >= 3, step: "creator submits clips", detail: String(mine.length) });
  } catch (error) {
    await shot(clipper2.page, "submit");
    log({ ok: false, step: "creator submits clips", detail: String(error) });
  }
  await clipper2.context.close();

  const brand3 = await login(browser, "brand@fweta.test");
  try {
    if (cpmId) await approveFirst(brand3.page, cpmId);
    if (stopId) await approveFirst(brand3.page, stopId);
    if (poolId) await approveFirst(brand3.page, poolId);
    const approved = load().submissions.filter((item) => item.status === "approved").length;
    log({ ok: approved >= 3, step: "brand approves clips", detail: String(approved) });
  } catch (error) {
    await shot(brand3.page, "approve");
    log({ ok: false, step: "brand approves clips", detail: String(error) });
  }
  await brand3.context.close();

  const admin3 = await login(browser, "admin@fweta.test");
  try {
    const pendingBefore = walletOf("clipper@fweta.test").pendingCents;
    await saveViews(admin3.page, cpmTitle, 1000);
    const sub = load().submissions.find((item) => item.postUrl.includes(`${stamp}01`));
    const pending = walletOf("clipper@fweta.test").pendingCents;
    const campaign = campaignByTitle(cpmTitle);
    log({
      ok: sub?.views === 1000 && sub.earningsCents === 4000 && pending - pendingBefore === 4000 && campaign.budgetSpentCents === 4000,
      step: "admin view entry credits earnings",
      detail: `views ${sub?.views} earn ${sub?.earningsCents} pending ${pending} spent ${campaign?.budgetSpentCents}`,
    });
  } catch (error) {
    await shot(admin3.page, "views");
    log({ ok: false, step: "admin view entry credits earnings", detail: String(error) });
  }

  const clipper3 = await login(browser, "clipper@fweta.test");
  try {
    await clipper3.page.goto(`${BASE}/dashboard/clipper/submissions`, { waitUntil: "domcontentloaded" });
    const card = clipper3.page.locator("li").filter({ hasText: `${stamp}01` }).first();
    await card.getByRole("button", { name: "Report views" }).click();
    await card.locator('input[name="views"]').fill("1500");
    await card.locator('input[name="screenshot"]').setInputFiles("/tmp/view-shot.png");
    await card.getByRole("button", { name: "Send report" }).click();
    await card.getByText("Creator report waiting for confirmation").waitFor({ timeout: 20000 });
    const snap = load().viewSnapshots.find((item) => item.source === "creator" && item.views === 1500 && item.status === "pending");
    log({ ok: Boolean(snap), step: "creator screenshot report", detail: snap?.status ?? "missing" });
  } catch (error) {
    await shot(clipper3.page, "report");
    log({ ok: false, step: "creator screenshot report", detail: String(error) });
  }
  await clipper3.context.close();

  try {
    await admin3.page.goto(`${BASE}/dashboard/admin/views`, { waitUntil: "domcontentloaded" });
    const report = admin3.page.locator("li").filter({ hasText: "Reported" }).filter({ hasText: cpmTitle }).first();
    const pendingBeforeReport = walletOf("clipper@fweta.test").pendingCents;
    await report.getByRole("button", { name: "Confirm count" }).click();
    await admin3.page.getByText("No reports waiting").waitFor({ timeout: 20000 });
    const sub = load().submissions.find((item) => item.postUrl.includes(`${stamp}01`));
    log({
      ok: sub?.views === 1500 && sub.earningsCents === 6000 && walletOf("clipper@fweta.test").pendingCents - pendingBeforeReport === 2000,
      step: "admin confirms creator report",
      detail: `views ${sub?.views} earn ${sub?.earningsCents} pending ${walletOf("clipper@fweta.test").pendingCents}`,
    });
  } catch (error) {
    await shot(admin3.page, "confirm-report");
    log({ ok: false, step: "admin confirms creator report", detail: String(error) });
  }

  try {
    await saveViews(admin3.page, stopTitle, 5000);
    const campaign = campaignByTitle(stopTitle);
    const sub = load().submissions.find((item) => item.postUrl.includes(`${stamp}02`));
    log({
      ok: campaign?.status === "completed" && campaign.budgetSpentCents === 3000 && sub?.earningsCents === 3000,
      step: "budget auto-stop",
      detail: `status ${campaign?.status} spent ${campaign?.budgetSpentCents} earn ${sub?.earningsCents}`,
    });
  } catch (error) {
    await shot(admin3.page, "autostop");
    log({ ok: false, step: "budget auto-stop", detail: String(error) });
  }

  try {
    await admin3.page.goto(`${BASE}/dashboard/admin/views`, { waitUntil: "domcontentloaded" });
    const poolSub = load().submissions.find((item) => item.postUrl.includes(`${stamp}03`));
    const bulk = admin3.page.locator('input[name="views-' + poolSub.id + '"]');
    await bulk.fill("800");
    await admin3.page.getByRole("button", { name: "Save filled counts" }).click();
    const bulkStarted = Date.now();
    let after = load().submissions.find((item) => item.id === poolSub.id);
    while (Date.now() - bulkStarted < 20000) {
      after = load().submissions.find((item) => item.id === poolSub.id);
      if (after?.views === 800) break;
      await admin3.page.waitForTimeout(400);
    }
    log({ ok: after?.views === 800, step: "bulk view entry", detail: String(after?.views) });
  } catch (error) {
    await shot(admin3.page, "bulk");
    log({ ok: false, step: "bulk view entry", detail: String(error) });
  }
  await admin3.context.close();

  const brand4 = await login(browser, "brand@fweta.test");
  try {
    await brand4.page.goto(`${BASE}/dashboard/brand/campaigns/${poolId}`, { waitUntil: "domcontentloaded" });
    await brand4.page.getByRole("button", { name: "Mark completed" }).click();
    await brand4.page.waitForTimeout(1500);
    const campaign = campaignByTitle(poolTitle);
    const sub = load().submissions.find((item) => item.postUrl.includes(`${stamp}03`));
    log({
      ok: Boolean(campaign?.poolSettledAt) && campaign.status === "completed" && (sub?.reservedCents ?? 0) > 0,
      step: "pool settlement at close",
      detail: `settled ${campaign?.poolSettledAt ?? "no"} share ${sub?.reservedCents}`,
    });
  } catch (error) {
    await shot(brand4.page, "pool-close");
    log({ ok: false, step: "pool settlement at close", detail: String(error) });
  }

  try {
    const beforeBrand = walletOf("brand@fweta.test").availableCents;
    const beforePending = walletOf("clipper@fweta.test").pendingCents;
    await brand4.page.goto(`${BASE}/dashboard/brand/campaigns/${cpmId}/submissions?tab=approved`, {
      waitUntil: "domcontentloaded",
    });
    const row = brand4.page.locator("li").filter({ hasText: `${stamp}01` });
    await row.locator("textarea").fill("Logo was covered. Returning the unsettled share.");
    await row.getByRole("button", { name: "Reject and return" }).click();
    await brand4.page.waitForTimeout(1500);
    const sub = load().submissions.find((item) => item.postUrl.includes(`${stamp}01`));
    const brandWallet = walletOf("brand@fweta.test").availableCents;
    const pending = walletOf("clipper@fweta.test").pendingCents;
    log({
      ok: sub?.status === "rejected" && brandWallet > beforeBrand && pending < beforePending,
      step: "rejection refunds the brand",
      detail: `status ${sub?.status} brand ${beforeBrand}->${brandWallet} pending ${beforePending}->${pending}`,
    });
  } catch (error) {
    await shot(brand4.page, "reject");
    log({ ok: false, step: "rejection refunds the brand", detail: String(error) });
  }
  await brand4.context.close();

  const held = load().submissions.find((item) => item.postUrl.includes(`${stamp}02`));
  log({
    ok: held?.payoutState === "holding" || held?.payoutState === "reserved",
    step: "earnings stay on hold",
    detail: `${held?.payoutState} until ${held?.holdUntil ?? "none"} available ${walletOf("clipper@fweta.test").availableCents}`,
  });

  const admin4 = await login(browser, "admin@fweta.test");
  try {
    const availableBeforeCredit = walletOf("clipper@fweta.test").availableCents;
    await admin4.page.goto(`${BASE}/dashboard/admin`, { waitUntil: "domcontentloaded" });
    const clipperId = profile("clipper@fweta.test").id;
    await admin4.page.selectOption("#userId", clipperId);
    await admin4.page.fill("#amount", "200");
    await admin4.page.fill("#reason", "QA available balance for payout");
    await admin4.page.getByRole("button", { name: /credit/i }).click();
    await admin4.page.waitForTimeout(1200);
    log({
      ok: walletOf("clipper@fweta.test").availableCents - availableBeforeCredit === 20000,
      step: "admin credits available balance",
      detail: `${availableBeforeCredit}->${walletOf("clipper@fweta.test").availableCents}`,
    });
  } catch (error) {
    await shot(admin4.page, "credit");
    log({ ok: false, step: "admin credits available balance", detail: String(error) });
  }
  await admin4.context.close();

  const clipper4 = await login(browser, "clipper@fweta.test");
  try {
    await clipper4.page.goto(`${BASE}/dashboard/settings/payout`, { waitUntil: "domcontentloaded" });
    await clipper4.page.fill("#bankName", "Bank Windhoek");
    await clipper4.page.fill("#branchCode", "461266");
    await clipper4.page.fill("#accountNumber", "1234567890");
    await clipper4.page.fill("#accountHolderName", "Kai Clips");
    await clipper4.page.getByRole("button", { name: "Save payout method" }).click();
    await clipper4.page.getByText("Payout method saved.").waitFor({ timeout: 15000 });
    await clipper4.page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "domcontentloaded" });
    if (await clipper4.page.locator("#legalName").isVisible().catch(() => false)) {
      await clipper4.page.fill("#legalName", "Kai Clips");
      await clipper4.page.fill("#idNumber", "9001010000000");
      await clipper4.page.fill("#country", "NA");
      await clipper4.page.setInputFiles("#idDocument", {
        name: "id.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
          "base64",
        ),
      });
      await clipper4.page.getByRole("button", { name: "Save identity" }).click();
      await clipper4.page.getByText("Waiting for a review").waitFor({ timeout: 15000 });
      const pending = profile("clipper@fweta.test")?.kyc?.status;
      log({
        ok: pending === "pending" && Boolean(profile("clipper@fweta.test")?.kyc?.documentPath),
        step: "identity photo waits for review",
        detail: pending || "missing",
      });
    } else {
      log({
        ok: (profile("clipper@fweta.test")?.kyc?.status ?? "") === "verified",
        step: "identity photo waits for review",
        detail: "already verified",
      });
    }
  } catch (error) {
    await shot(clipper4.page, "kyc");
    log({ ok: false, step: "identity photo waits for review", detail: String(error) });
  }
  await clipper4.context.close();

  const adminKyc = await login(browser, "admin@fweta.test");
  try {
    const before = profile("clipper@fweta.test")?.kyc?.status;
    if (before === "pending") {
      await adminKyc.page.goto(`${BASE}/dashboard/admin/kyc`, { waitUntil: "domcontentloaded" });
      await adminKyc.page.locator("li").filter({ hasText: "clipper@fweta.test" }).getByRole("button", { name: "Verify identity" }).click();
      await adminKyc.page.waitForTimeout(1200);
    }
    log({
      ok: (profile("clipper@fweta.test")?.kyc?.status ?? "verified") === "verified",
      step: "admin verifies identity",
      detail: profile("clipper@fweta.test")?.kyc?.status ?? "legacy",
    });
  } catch (error) {
    await shot(adminKyc.page, "kyc-review");
    log({ ok: false, step: "admin verifies identity", detail: String(error) });
  }
  await adminKyc.context.close();

  const clipperPayout = await login(browser, "clipper@fweta.test");
  try {
    await clipperPayout.page.goto(`${BASE}/dashboard/settings/withdraw`, { waitUntil: "domcontentloaded" });
    await clipperPayout.page.getByText("Verified.").waitFor({ timeout: 15000 });
    const availableBeforePayout = walletOf("clipper@fweta.test").availableCents;
    await clipperPayout.page.fill("#amount", "100");
    await clipperPayout.page.getByRole("button", { name: "Request withdrawal" }).click();
    await clipperPayout.page.getByText("Withdrawal requested").waitFor({ timeout: 20000 });
    const request = load()
      .withdrawalRequests.filter((item) => item.userId === profile("clipper@fweta.test").id && item.amountCents === 10000)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1);
    log({
      ok: request?.status === "pending" && availableBeforePayout - walletOf("clipper@fweta.test").availableCents === 10000,
      step: "creator requests payout",
      detail: `${request?.status} available ${walletOf("clipper@fweta.test").availableCents}`,
    });
  } catch (error) {
    await shot(clipperPayout.page, "withdraw");
    log({ ok: false, step: "creator requests payout", detail: String(error) });
  }
  await clipperPayout.context.close();

  const admin5 = await login(browser, "admin@fweta.test");
  try {
    await admin5.page.goto(`${BASE}/dashboard/admin/withdrawals`, { waitUntil: "domcontentloaded" });
    const row = admin5.page.locator("li").filter({ has: admin5.page.getByRole("button", { name: "Mark paid" }) }).first();
    await row.locator('input[name="ref"]').fill("EFT-QA-100");
    await row.getByRole("button", { name: "Mark paid" }).click();
    await admin5.page.waitForTimeout(1500);
    const request = load()
      .withdrawalRequests.filter((item) => item.amountCents === 10000)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .at(-1);
    log({
      ok: request?.status === "paid" && request.bankReference === "EFT-QA-100",
      step: "admin marks EFT paid",
      detail: `${request?.status} ${request?.bankReference}`,
    });
  } catch (error) {
    await shot(admin5.page, "paid");
    log({ ok: false, step: "admin marks EFT paid", detail: String(error) });
  }
  await admin5.context.close();

  const brand5 = await login(browser, "brand@fweta.test");
  try {
    await brand5.page.goto(`${BASE}/dashboard/brand/team`, { waitUntil: "domcontentloaded" });
    await brand5.page.fill("#invite-email", `qa.mate.${stamp}@example.com`);
    await brand5.page.selectOption("#invite-role", "manager");
    await brand5.page.getByRole("button", { name: /invite/i }).click();
    await brand5.page.getByText("Invite saved").waitFor({ timeout: 15000 });
    const member = (load().workspaceMembers ?? []).find((item) => item.email === `qa.mate.${stamp}@example.com` && item.status === "invited");
    log({
      ok: Boolean(member),
      step: "brand invites a teammate",
      detail: member ? `${member.role} ${member.status}` : "missing",
    });
  } catch (error) {
    await shot(brand5.page, "invite");
    log({ ok: false, step: "brand invites a teammate", detail: String(error) });
  }
  await brand5.context.close();

  const mateEmail = `qa.mate.${stamp}@example.com`;
  const mateContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const matePage = await mateContext.newPage();
  matePage.on("dialog", (dialog) => dialog.accept());
  let creator = { context: mateContext, page: matePage };
  try {
    await matePage.goto(`${BASE}/signup?role=creator`, { waitUntil: "domcontentloaded" });
    await matePage.fill("#email", mateEmail);
    await matePage.fill("#password", PASSWORD);
    await matePage.getByRole("button", { name: "Create account" }).click();
    await matePage.waitForURL(/\/onboarding/, { timeout: 20000, waitUntil: "domcontentloaded" });
    for (let step = 0; step < 8; step += 1) {
      if (await matePage.getByText("You're in.").isVisible().catch(() => false)) break;
      const skip = matePage.getByRole("button", { name: "Skip for now" });
      if (!(await skip.isVisible().catch(() => false))) break;
      await skip.click();
      await matePage.waitForTimeout(600);
    }
    if (await matePage.getByText("You're in.").isVisible().catch(() => false)) {
      await matePage.getByRole("button", { name: "Go to dashboard" }).click();
    }
    await matePage.waitForURL(/\/dashboard/, { timeout: 20000, waitUntil: "domcontentloaded" });
    await dismissTour(matePage);
    await matePage.getByText("Brand invites").waitFor({ timeout: 15000 });
    await matePage.getByRole("button", { name: "Accept" }).click();
    await matePage.waitForTimeout(1200);
    const member = (load().workspaceMembers ?? []).find((item) => item.email === mateEmail);
    const roles = profile(mateEmail)?.roles ?? [];
    log({
      ok: member?.status === "active" && roles.includes("brand"),
      step: "teammate accepts invite",
      detail: `${member?.status} roles ${roles.join(",")}`,
    });
    await matePage.reload({ waitUntil: "domcontentloaded" });
    await matePage.selectOption("#role-switcher", "brand");
    await matePage.waitForURL(/\/dashboard\/brand/, { timeout: 15000, waitUntil: "domcontentloaded" });
    const body = await matePage.locator("body").innerText();
    log({ ok: body.includes(cpmTitle) || body.includes("Campaigns"), step: "role switch shows brand workspace", detail: matePage.url() });
  } catch (error) {
    await shot(matePage, "team");
    log({ ok: false, step: "teammate accepts invite", detail: String(error) });
  }

  const pages = {
    brand: [
      "/dashboard/brand",
      "/dashboard/brand/campaigns",
      "/dashboard/brand/analytics",
      "/dashboard/brand/bookings",
      "/dashboard/brand/deposits",
      "/dashboard/brand/team",
      "/dashboard/notifications",
      "/dashboard/settings",
      "/help",
    ],
    creator: [
      "/dashboard/clipper",
      "/dashboard/clipper/campaigns",
      "/dashboard/clipper/submissions",
      "/dashboard/clipper/earnings",
      "/dashboard/clipper/leaderboard",
      "/dashboard/clipper/saved",
      "/dashboard/support",
      "/dashboard/notifications",
    ],
    influencer: [
      "/dashboard/influencer",
      "/dashboard/influencer/bookings",
      "/dashboard/influencer/rate-cards",
      "/dashboard/influencer/profile",
      "/dashboard/influencer/earnings",
    ],
    admin: [
      "/dashboard/admin",
      "/dashboard/admin/payins",
      "/dashboard/admin/views",
      "/dashboard/admin/withdrawals",
      "/dashboard/admin/fraud",
      "/dashboard/admin/users",
      "/dashboard/admin/onboarding",
      "/dashboard/admin/accounts",
      "/dashboard/admin/workspaces",
      "/dashboard/admin/stats",
      "/dashboard/admin/emails",
      "/dashboard/admin/fees",
      "/dashboard/admin/kyc",
      "/dashboard/admin/support",
    ],
  };

  async function sweep(label, session, paths) {
    const broken = [];
    for (const path of paths) {
      try {
        const response = await session.page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
        const text = await session.page.locator("body").innerText();
        const status = response?.status() ?? 0;
        if ((status !== 200 && status !== 0) || /application error|something went wrong/i.test(text)) {
          broken.push(`${path} ${status}`);
        }
      } catch (error) {
        const text = await session.page.locator("body").innerText().catch(() => "");
        if (/application error|something went wrong/i.test(text) || session.page.url().includes("/login")) {
          broken.push(`${path} ${String(error).split("\n")[0]}`);
        }
      }
    }
    log({ ok: broken.length === 0, step: `${label} page sweep`, detail: broken.join(", ") || `${paths.length} pages` });
  }

  await sweep("brand teammate", creator, pages.brand);
  try {
    await creator.page.goto(`${BASE}/dashboard/brand/analytics`, { waitUntil: "domcontentloaded" });
    const analytics = await creator.page.locator("body").innerText();
    log({
      ok: /cost\s*\/\s*1,000/i.test(analytics) && /Download CSV/.test(analytics),
      step: "brand analytics shows cost and export",
      detail: analytics.includes("Download CSV") ? "csv link" : "missing",
    });
  } catch (error) {
    log({ ok: false, step: "brand analytics shows cost and export", detail: String(error).split("\n")[0] });
  }
  try {
    await creator.page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await creator.page.locator("aside #role-switcher").selectOption("influencer");
    await creator.page.goto(`${BASE}/dashboard/influencer`, { waitUntil: "domcontentloaded" });
    await sweep("influencer", creator, pages.influencer);
  } catch (error) {
    log({ ok: false, step: "influencer role switch", detail: String(error).split("\n")[0] });
  }
  await creator.context.close();

  const clipper5 = await login(browser, "clipper@fweta.test");
  await sweep("creator", clipper5, pages.creator);
  const board = await clipper5.page.goto(`${BASE}/dashboard/clipper/leaderboard`, { waitUntil: "domcontentloaded" });
  await clipper5.page.getByText("Referral code").waitFor({ timeout: 15000 });
  const boardText = await clipper5.page.locator("body").innerText();
  log({
    ok: (board?.status() ?? 0) === 200 && /Kai|leaderboard|views/i.test(boardText) && /This week/.test(boardText) && /Referral code/.test(boardText),
    step: "leaderboard renders",
    detail: boardText.slice(0, 160).replace(/\s+/g, " "),
  });
  try {
    await clipper5.page.goto(`${BASE}/dashboard/clipper/campaigns?country=NA&type=clipping&platform=tiktok`, { waitUntil: "domcontentloaded" });
    const discover = await clipper5.page.locator("body").innerText();
    const campaignLink = clipper5.page.locator('a[href^="/campaigns/"]').first();
    let savedOk = false;
    if (await campaignLink.count()) {
      await campaignLink.click();
      await clipper5.page.getByRole("button", { name: /Save campaign|Saved/ }).waitFor({ timeout: 15000 });
      if (await clipper5.page.getByRole("button", { name: "Save campaign" }).isVisible().catch(() => false)) {
        await clipper5.page.getByRole("button", { name: "Save campaign" }).click();
      }
      await clipper5.page.getByRole("button", { name: "Saved" }).waitFor({ timeout: 15000 });
      savedOk = true;
    }
    log({
      ok: /CPM and pool|No campaigns match/.test(discover) && (savedOk || /No campaigns match/.test(discover)),
      step: "discover filters and save",
      detail: savedOk ? "saved" : "no campaign card",
    });
    await clipper5.page.goto(`${BASE}/dashboard/support`, { waitUntil: "domcontentloaded" });
    await clipper5.page.fill("#subject", `QA ticket ${stamp}`);
    await clipper5.page.fill("#body", "Please confirm the payout minimum and the ID review.");
    await clipper5.page.getByRole("button", { name: "Open ticket" }).click();
    const ticketStarted = Date.now();
    let ticket = null;
    while (Date.now() - ticketStarted < 15000) {
      ticket = (load().supportTickets ?? []).find((item) => item.subject === `QA ticket ${stamp}`);
      if (ticket) break;
      await clipper5.page.waitForTimeout(400);
    }
    log({ ok: Boolean(ticket), step: "support ticket opens", detail: ticket?.status ?? "missing" });
  } catch (error) {
    await shot(clipper5.page, "growth");
    log({ ok: false, step: "discover filters and save", detail: String(error).split("\n")[0] });
  }
  await clipper5.context.close();

  const admin6 = await login(browser, "admin@fweta.test");
  await sweep("admin", admin6, pages.admin);
  await admin6.page.goto(`${BASE}/dashboard/admin/emails?template=welcome&device=desktop`, { waitUntil: "domcontentloaded" });
  const emailText = await admin6.page.locator("body").innerText();
  log({ ok: /welcome|fweta/i.test(emailText), step: "email preview", detail: "welcome desktop" });
  const userId = profile("brand@fweta.test").id;
  await admin6.page.goto(`${BASE}/dashboard/admin/users/${userId}`, { waitUntil: "domcontentloaded" });
  const userText = await admin6.page.locator("body").innerText();
  log({ ok: /Desert Brands|brand@fweta.test/i.test(userText), step: "admin user profile", detail: admin6.page.url() });
  try {
    await admin6.page.goto(`${BASE}/dashboard/admin/fees`, { waitUntil: "domcontentloaded" });
    await admin6.page.fill("#percent", "10");
    await admin6.page.getByRole("button", { name: "Save fee" }).click();
    const feeStarted = Date.now();
    let fee;
    let audited = false;
    while (Date.now() - feeStarted < 15000) {
      fee = (load().platformSettings ?? [])[0]?.platformFeeBps;
      audited = (load().auditLog ?? []).some((item) => item.action === "fee.update");
      if (fee === 1000 && audited) break;
      await admin6.page.waitForTimeout(400);
    }
    log({ ok: fee === 1000 && audited, step: "admin sets platform fee", detail: `bps ${fee}` });
    await admin6.page.goto(`${BASE}/dashboard/admin/support`, { waitUntil: "domcontentloaded" });
    const queue = await admin6.page.locator("body").innerText();
    log({ ok: queue.includes(`QA ticket ${stamp}`), step: "admin sees support ticket", detail: "queue" });
  } catch (error) {
    await shot(admin6.page, "fees");
    log({ ok: false, step: "admin sets platform fee", detail: String(error).split("\n")[0] });
  }
  await admin6.context.close();

  const guest = await browser.newContext();
  const publicPage = await guest.newPage();
  for (const path of ["/legal/terms", "/legal/privacy", "/legal/creator-terms", "/legal/abuse", "/help", "/no-such-page"]) {
    const response = await publicPage.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const text = await publicPage.locator("body").innerText();
    const expected = path === "/no-such-page" ? 404 : 200;
    log({
      ok: (response?.status() ?? 0) === expected && !/—/.test(text),
      step: `public ${path}`,
      detail: String(response?.status()),
    });
  }
  await guest.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await mobilePage.fill("#email", "clipper@fweta.test");
  await mobilePage.fill("#password", PASSWORD);
  await mobilePage.getByRole("button", { name: /^continue$/i }).click();
  await mobilePage.waitForURL(/\/dashboard/, { timeout: 20000, waitUntil: "domcontentloaded" });
  await dismissTour(mobilePage);
  const overflow = [];
  for (const path of ["/dashboard/clipper", "/dashboard/clipper/submissions", "/dashboard/settings"]) {
    await mobilePage.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const wide = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (wide) overflow.push(path);
  }
  await mobilePage.getByRole("button", { name: "Open menu" }).click();
  const menu = await mobilePage.getByRole("navigation").count();
  log({ ok: overflow.length === 0 && menu > 0, step: "mobile layout", detail: overflow.join(", ") || "menu open" });
  await mobile.close();

  const brandEmail = `qa.brand.${stamp}@example.com`;
  const signup = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const signupPage = await signup.newPage();
  try {
    await signupPage.goto(`${BASE}/signup?role=brand`, { waitUntil: "domcontentloaded" });
    await signupPage.fill("#email", brandEmail);
    await signupPage.fill("#password", PASSWORD);
    await signupPage.getByRole("button", { name: "Create account" }).click();
    await signupPage.waitForURL(/\/onboarding/, { timeout: 20000, waitUntil: "domcontentloaded" });
    await signupPage.fill("#firstName", "Lena");
    await signupPage.fill("#lastName", "Shipanga");
    await signupPage.getByRole("button", { name: "Continue" }).click();
    await signupPage.getByText("Tell us about the business").waitFor({ timeout: 15000 });
    await signupPage.fill("#companyName", "Shipanga Foods");
    await signupPage.fill("#website", "https://shipanga.example");
    await signupPage.getByRole("button", { name: "Continue" }).click();
    await signupPage.getByText("What do you want to promote?").waitFor({ timeout: 15000 });
    await signupPage.fill("#promote", "A Windhoek rooibos cold brew launching on TikTok and Reels this month.");
    await signupPage.getByRole("button", { name: "Continue" }).click();
    await signupPage.getByText("Set up your first campaign").waitFor({ timeout: 15000 });
    await signupPage.fill("#title", `Shipanga launch ${stamp}`);
    await signupPage.fill("#cpmNad", "25");
    await signupPage.fill("#budgetNad", "500");
    await signupPage.fill("#minViews", "0");
    await signupPage.fill("#maxPayoutNad", "100");
    await signupPage.fill("#brief", "Cut the tasting video into vertical clips and keep the bottle in frame.");
    await signupPage.fill("#rules", "No other drinks on screen. Leave the caption credit in.");
    await signupPage.getByRole("button", { name: "Save draft campaign" }).click();
    await signupPage.getByText("How funding works").waitFor({ timeout: 20000 });
    await signupPage.getByRole("button", { name: "I understand" }).click();
    await signupPage.getByText("A quick look around").waitFor({ timeout: 15000 });
    await signupPage.getByRole("button", { name: "Continue" }).click();
    await signupPage.waitForURL(/\/dashboard/, { timeout: 20000, waitUntil: "domcontentloaded" });
    const created = profile(brandEmail);
    const draft = load().campaigns.find((item) => item.title === `Shipanga launch ${stamp}`);
    log({
      ok: created?.onboardingCompletedAt != null && draft?.status === "draft",
      step: "brand signup and onboarding",
      detail: `${created?.displayName} campaign ${draft?.status}`,
    });
  } catch (error) {
    await shot(signupPage, "onboarding");
    log({ ok: false, step: "brand signup and onboarding", detail: String(error) });
  }
  await signup.close();
} catch (error) {
  log({ ok: false, step: "runner", detail: String(error) });
} finally {
  await browser.close();
  writeFileSync("/tmp/qa-results.json", JSON.stringify(results, null, 2));
  const failed = results.filter((item) => !item.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
