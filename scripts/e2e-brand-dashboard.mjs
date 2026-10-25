import {
  ADMIN_EMAIL,
  baseUrl,
  clickLogOut,
  confirmPayIn,
  launchBrowser,
  loadPlaywright,
  login,
  publishCampaign,
  readStore,
  submitEftDeposit,
} from "./e2e-helpers.mjs";

const BASE = baseUrl();
const results = [];

function log(entry) {
  results.push(entry);
  console.log(entry.ok ? "✓" : "✗", JSON.stringify(entry));
}

function getBrandProfileId(store) {
  return store.profiles?.find((p) => p.email === "brand@fweta.test")?.id;
}

const playwright = await loadPlaywright();
const browser = await launchBrowser(playwright);
const page = await browser.newPage();

try {
  await login(page, "brand@fweta.test");
  log({ step: "brand login", ok: true });

  const storeBefore = readStore();
  const brandId = storeBefore ? getBrandProfileId(storeBefore) : null;
  const walletBefore = storeBefore?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;

  await page.goto(`${BASE}/dashboard/brand/deposits`, { waitUntil: "domcontentloaded" });
  log({ step: "deposits page loads", ok: page.url().includes("/deposits") });

  const depositNote = `QA EFT deposit ${Date.now()}`;
  await submitEftDeposit(page, "2500", depositNote);
  const depositBody = await page.locator("body").innerText();
  log({
    step: "submit EFT deposit N$2500",
    ok: /2,500|2500|N\$2,500|Deposit submitted/i.test(depositBody),
  });

  await login(page, ADMIN_EMAIL);
  await confirmPayIn(page, depositNote);
  log({ step: "admin confirms deposit", ok: true });

  const storeAfterDeposit = readStore();
  const walletAfterDeposit =
    storeAfterDeposit?.wallets?.find((w) => w.userId === brandId)?.availableCents ?? 0;
  log({
    step: "wallet credited in store",
    ok: walletAfterDeposit >= walletBefore + 250000,
    walletBefore,
    walletAfterDeposit,
  });

  await login(page, "brand@fweta.test");
  await page.goto(`${BASE}/dashboard/brand`, { waitUntil: "domcontentloaded" });
  await page.getByText("Budget spent", { exact: true }).waitFor();
  const dashBody = await page.locator("body").innerText();
  log({
    step: "wallet shows on dashboard",
    ok: /wallet/i.test(dashBody) && /N\$/i.test(dashBody),
  });

  await page.goto(`${BASE}/dashboard/brand/campaigns/new`, { waitUntil: "domcontentloaded" });
  const title = `Launch Campaign ${Date.now()}`;
  await publishCampaign(page, {
    title,
    description: "Full brand dashboard QA test campaign with funded budget.",
    category: "Tech",
    budget: "1000",
    cpm: "10",
    maxPayout: "200",
    platform: "YouTube",
  });

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

  const storeAfterCampaign = readStore();
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

  await page.goto(`${BASE}/dashboard/brand/campaigns`, { waitUntil: "domcontentloaded" });
  const listBody = await page.locator("body").innerText();
  log({ step: "campaign in list", ok: listBody.includes(title) });

  await page.goto(`${BASE}/dashboard/brand/analytics`, { waitUntil: "domcontentloaded" });
  log({
    step: "analytics page",
    ok: (await page.locator("body").innerText()).length > 100,
  });

  const store = readStore();
  if (store) {
    const deposit = store.brandDeposits?.find((d) => d.note === depositNote);
    const campaign = store.campaigns?.find((c) => c.title === title);
    log({
      step: "store has deposit record",
      ok: Boolean(deposit && deposit.amountCents === 250000 && deposit.status === "credited"),
    });
    log({
      step: "store has campaign record",
      ok: Boolean(campaign && campaign.status === "active" && campaign.budgetTotalCents === 100000),
    });
  } else {
    log({ step: "local store file", ok: false, note: "no data/store.json" });
  }

  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "domcontentloaded" });
  await clickLogOut(page);
  await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), { timeout: 10000 });
  log({ step: "log out from the visible settings button", ok: !page.url().includes("/dashboard") });
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
