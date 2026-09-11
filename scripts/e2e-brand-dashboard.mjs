import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const BASE = "http://localhost:3000";
const PASSWORD = "password123";
const results = [];

function log(entry) {
  results.push(entry);
  console.log(entry.ok ? "✓" : "✗", JSON.stringify(entry));
}

async function login(page, email) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

function readLocalStore() {
  const path = "/workspace/data/store.json";
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function getBrandProfileId(store) {
  return store.profiles?.find((p) => p.email === "brand@fweta.test")?.id;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await login(page, "brand@fweta.test");
  log({ step: "brand login", ok: true });

  const storeBefore = readLocalStore();
  const brandId = storeBefore ? getBrandProfileId(storeBefore) : null;
  const walletBefore = storeBefore?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;

  // Deposits page
  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "networkidle" });
  log({ step: "deposits page loads", ok: page.url().includes("/deposits") });

  const depositNote = `QA EFT deposit ${Date.now()}`;
  await page.fill("#amount", "2500");
  await page.fill("#note", depositNote);
  await page.getByRole("button", { name: /record deposit/i }).click();
  await page.waitForTimeout(2000);
  const depositBody = await page.locator("body").innerText();
  log({
    step: "record deposit N$2500",
    ok: /2,500|2500|N\$2,500/i.test(depositBody),
  });

  const storeAfterDeposit = readLocalStore();
  const walletAfterDeposit =
    storeAfterDeposit?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;
  log({
    step: "wallet credited in store",
    ok: walletAfterDeposit >= walletBefore + 250000,
    walletBefore,
    walletAfterDeposit,
  });

  // Dashboard wallet stat
  await page.goto(`${BASE}/dashboard/brand`, { waitUntil: "networkidle" });
  const dashBody = await page.locator("body").innerText();
  log({
    step: "wallet shows on dashboard",
    ok: /wallet/i.test(dashBody) && /N\$/i.test(dashBody),
  });

  // Create campaign
  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "networkidle" });
  const title = `Launch Campaign ${Date.now()}`;
  await page.fill("#title", title);
  await page.fill("#description", "Full brand dashboard QA test campaign with funded budget.");
  await page.fill("#category", "Tech");
  await page.fill("#budgetTotal", "1000");
  await page.fill("#cpm", "10");
  await page.fill("#maxPayout", "200");
  await page.locator('label:has-text("youtube") input[type="checkbox"]').check();
  await page.selectOption("#status", "active");
  await page.getByRole("button", { name: /create campaign/i }).click();

  await page.waitForURL(/\/dashboard\/brand\/campaigns\/[a-f0-9-]+/, { timeout: 15000 });
  const campaignUrl = page.url();
  const campaignId = campaignUrl.split("/campaigns/")[1]?.split("/")[0];
  const detailBody = await page.locator("body").innerText();
  log({
    step: "create active campaign + detail page",
    ok: detailBody.includes(title) && !detailBody.includes("404"),
    campaignId,
    url: campaignUrl,
  });

  const storeAfterCampaign = readLocalStore();
  const walletAfterCampaign =
    storeAfterCampaign?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;
  const campaignFundEntry = storeAfterCampaign?.ledgerEntries?.find(
    (e) => e.referenceType === "campaign_fund" && e.referenceId === campaignId,
  );
  log({
    step: "campaign budget deducted from wallet",
    ok: walletAfterCampaign === walletAfterDeposit - 100000 && Boolean(campaignFundEntry),
    walletAfterCampaign,
    expectedWallet: walletAfterDeposit - 100000,
  });

  // Campaigns list
  await page.goto(`${BASE}/dashboard/brand/campaigns`, { waitUntil: "networkidle" });
  const listBody = await page.locator("body").innerText();
  log({ step: "campaign in list", ok: listBody.includes(title) });

  // Analytics
  await page.goto(`${BASE}/dashboard/brand/analytics`, { waitUntil: "networkidle" });
  log({
    step: "analytics page",
    ok: (await page.locator("body").innerText()).length > 100,
  });

  // Reviews inbox
  await page.goto(`${BASE}/dashboard/brand/submissions`, { waitUntil: "networkidle" });
  log({
    step: "reviews inbox",
    ok: /review|pending|no pending/i.test(await page.locator("body").innerText()),
  });

  // Marketplace (demo influencer seeded)
  await page.goto(`${BASE}/influencers`, { waitUntil: "networkidle" });
  log({
    step: "influencer marketplace seeded",
    ok: /Amara/i.test(await page.locator("body").innerText()),
  });

  // Draft campaign create + delete
  page.once("dialog", (d) => d.accept());
  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "networkidle" });
  const draftTitle = `Temp Draft ${Date.now()}`;
  await page.fill("#title", draftTitle);
  await page.fill("#description", "Temporary draft campaign that should be deleted after QA.");
  await page.fill("#category", "QA");
  await page.fill("#budgetTotal", "50");
  await page.fill("#cpm", "5");
  await page.fill("#maxPayout", "20");
  await page.locator('label:has-text("tiktok") input[type="checkbox"]').check();
  await page.selectOption("#status", "draft");
  await page.getByRole("button", { name: /create campaign/i }).click();
  await page.waitForURL(/\/dashboard\/brand\/campaigns\/[a-f0-9-]+/, { timeout: 15000 });
  await page.getByRole("button", { name: /^delete$/i }).click();
  await page.waitForURL(/\/dashboard\/brand\/campaigns$/, { timeout: 15000 });
  const afterDeleteList = await page.locator("body").innerText();
  log({
    step: "delete draft campaign",
    ok: !afterDeleteList.includes(draftTitle),
  });

  // Complete funded campaign — unused budget returns to wallet
  await page.goto(campaignUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /mark completed/i }).click();
  await page.waitForTimeout(1500);
  const storeAfterComplete = readLocalStore();
  const walletAfterComplete =
    storeAfterComplete?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;
  const refundEntry = storeAfterComplete?.ledgerEntries?.find(
    (e) => e.referenceType === "campaign_refund" && e.referenceId === campaignId,
  );
  log({
    step: "complete campaign refunds unused budget",
    ok: walletAfterComplete === walletAfterDeposit && Boolean(refundEntry),
    walletAfterComplete,
    expectedWallet: walletAfterDeposit,
  });

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /^delete$/i }).click();
  await page.waitForURL(/\/dashboard\/brand\/campaigns$/, { timeout: 15000 });
  const storeAfterDelete = readLocalStore();
  log({
    step: "delete completed campaign",
    ok: !storeAfterDelete?.campaigns?.some((c) => c.id === campaignId),
  });

  // Health + persist
  const healthRes = await page.goto(`${BASE}/api/health/store`);
  const health = await healthRes.json();
  log({
    step: "local store health",
    ok: health.ok === true && health.mode === "local" && health.persist === "ok",
    health,
  });

  // Verify store records
  const store = readLocalStore();
  if (store) {
    const deposit = store.brandDeposits?.find((d) => d.note === depositNote);
    log({
      step: "store has deposit record",
      ok: Boolean(deposit && deposit.amountCents === 250000),
    });
    log({
      step: "temp campaigns cleaned up",
      ok: !store.campaigns?.some((c) => c.title === title || c.title === draftTitle),
    });
  } else {
    log({ step: "local store file", ok: false, note: "no data/store.json" });
  }
} catch (e) {
  log({ step: "fatal", ok: false, note: e.message });
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== BRAND QA: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) {
  console.log("Failed:", failed);
  process.exit(1);
}
